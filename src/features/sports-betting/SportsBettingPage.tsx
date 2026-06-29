import {
	Activity,
	AlertTriangle,
	BarChart3,
	Clock3,
	Copy,
	RefreshCw,
	Search,
	ShieldCheck,
	Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	type SportsBettingEvent,
	type SportsBettingFeed,
	type SportsBettingOutcome,
	sportsBettingService,
} from "@/services/sports-betting.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";

type Movement = "new" | "up" | "down" | "flat";

const ALL_FILTER = "All";
const DEFAULT_POLL_MS = 7_200_000;
const DEFAULT_SOURCE_ID = "football-world-cup";

const SPORT_SOURCE_OPTIONS = [
	{
		id: DEFAULT_SOURCE_ID,
		label: "Football / FIFA World Cup",
		sports: "soccer_fifa_world_cup",
	},
	{
		id: "football-club-world-cup",
		label: "Football / Club World Cup",
		sports: "soccer_fifa_club_world_cup",
	},
	{
		id: "football-champions-league",
		label: "Football / Champions League",
		sports: "soccer_uefa_champs_league",
	},
	{
		id: "football-epl",
		label: "Football / English Premier League",
		sports: "soccer_epl",
	},
	{
		id: "football-spain",
		label: "Football / Spain La Liga",
		sports: "soccer_spain_la_liga",
	},
	{
		id: "mixed-upcoming",
		label: "Mixed / Upcoming",
		sports: "upcoming",
	},
];

const QUICK_SNIPPETS = [
	{
		title: "Odds changed",
		text: "Odds can change before bet confirmation. The accepted bet slip price is the price used for settlement.",
	},
	{
		title: "Promo eligibility",
		text: "Please check minimum odds, eligible markets, qualifying stake, expiry time, and local restrictions before placing a bet.",
	},
	{
		title: "Responsible betting",
		text: "Sports betting is for adults only. Set limits, avoid chasing losses, and use self-exclusion tools if betting stops feeling controlled.",
	},
];

function getOutcomeKey(
	event: SportsBettingEvent,
	outcome: SportsBettingOutcome,
) {
	return [
		event.id,
		outcome.marketKey,
		outcome.name,
		typeof outcome.point === "number" ? outcome.point : "",
	].join(":");
}

function formatDateTime(value?: string) {
	if (!value) return "-";

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatTime(value?: string) {
	if (!value) return "-";

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
}

function formatPrice(price: number) {
	return new Intl.NumberFormat("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(price);
}

function formatDurationMs(value: number) {
	const minutes = Math.max(1, Math.round(value / 60_000));

	if (minutes >= 60 && minutes % 60 === 0) {
		return `${minutes / 60}h`;
	}

	return `${minutes}m`;
}

function formatOutcomeLabel(outcome: SportsBettingOutcome) {
	if (typeof outcome.point !== "number") return outcome.name;

	const point = outcome.point > 0 ? `+${outcome.point}` : outcome.point;

	return `${outcome.name} ${point}`;
}

function getStatusClass(status: SportsBettingEvent["status"]) {
	if (status === "Live") return "border-emerald-500/30 text-emerald-300";
	if (status === "Settling") return "border-amber-500/30 text-amber-200";

	return "border-border text-muted";
}

function getMovementClass(movement?: Movement) {
	if (movement === "up") return "text-emerald-300";
	if (movement === "down") return "text-red-300";
	if (movement === "new") return "text-accent";

	return "text-muted";
}

function getMovementLabel(movement?: Movement) {
	if (movement === "up") return "Up";
	if (movement === "down") return "Down";
	if (movement === "new") return "New";

	return "Flat";
}

function buildEventSearchText(event: SportsBettingEvent) {
	return [
		event.sportTitle,
		event.sportKey,
		event.matchup,
		event.homeTeam,
		event.awayTeam,
		event.status,
		event.markets.map((market) => market.label).join(" "),
		event.bestOdds
			.map(
				(outcome) =>
					`${outcome.marketLabel} ${outcome.name} ${outcome.bookmakerTitle}`,
			)
			.join(" "),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function buildEventSummary(event: SportsBettingEvent) {
	const odds = event.bestOdds
		.slice(0, 8)
		.map(
			(outcome) =>
				`${outcome.marketLabel}: ${formatOutcomeLabel(outcome)} ${formatPrice(
					outcome.price,
				)} (${outcome.bookmakerTitle})`,
		)
		.join("\n");

	return [
		`${event.sportTitle} | ${event.matchup}`,
		`Starts: ${formatDateTime(event.commenceTime)}`,
		`Status: ${event.status}`,
		`Bookmakers: ${event.bookmakerCount}`,
		"Best odds:",
		odds || "-",
	].join("\n");
}

export function SportsBettingPage() {
	const { showToast } = useToast();
	const previousPricesRef = useRef<Map<string, number>>(new Map());
	const [feed, setFeed] = useState<SportsBettingFeed>();
	const [movements, setMovements] = useState<Record<string, Movement>>({});
	const [sourceId, setSourceId] = useState(DEFAULT_SOURCE_ID);
	const [activeSport, setActiveSport] = useState(ALL_FILTER);
	const [activeMarket, setActiveMarket] = useState(ALL_FILTER);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");

	const applyFeed = useCallback((nextFeed: SportsBettingFeed) => {
		const previousPrices = previousPricesRef.current;
		const nextPrices = new Map<string, number>();
		const nextMovements: Record<string, Movement> = {};

		for (const event of nextFeed.events) {
			for (const outcome of event.bestOdds) {
				const key = getOutcomeKey(event, outcome);
				const previousPrice = previousPrices.get(key);

				nextPrices.set(key, outcome.price);

				if (previousPrice === undefined) {
					nextMovements[key] = "new";
				} else if (outcome.price > previousPrice) {
					nextMovements[key] = "up";
				} else if (outcome.price < previousPrice) {
					nextMovements[key] = "down";
				} else {
					nextMovements[key] = "flat";
				}
			}
		}

		previousPricesRef.current = nextPrices;
		setMovements(nextMovements);
		setFeed(nextFeed);
	}, []);
	const selectedSource =
		SPORT_SOURCE_OPTIONS.find((source) => source.id === sourceId) ??
		SPORT_SOURCE_OPTIONS[0];

	const loadFeed = useCallback(
		async (showSuccess = false) => {
			setRefreshing(true);
			setError("");

			try {
				const nextFeed = await sportsBettingService.loadLiveFeed({
					sports: selectedSource.sports,
				});

				applyFeed(nextFeed);
				if (showSuccess) {
					showToast("Live sports betting data updated");
				}
			} catch (loadError) {
				setError(
					loadError instanceof Error
						? loadError.message
						: "Unable to load live sports betting data",
				);
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[applyFeed, selectedSource.sports, showToast],
	);

	useEffect(() => {
		void loadFeed(false);
	}, [loadFeed]);

	const pollMs = feed?.pollMs ?? DEFAULT_POLL_MS;

	useEffect(() => {
		const timer = window.setInterval(() => {
			if (document.visibilityState === "hidden") return;

			void loadFeed(false);
		}, pollMs);

		return () => window.clearInterval(timer);
	}, [loadFeed, pollMs]);

	const sportOptions = useMemo(
		() => [
			ALL_FILTER,
			...Array.from(
				new Set((feed?.events ?? []).map((event) => event.sportTitle)),
			).sort((first, second) => first.localeCompare(second)),
		],
		[feed?.events],
	);
	const marketOptions = useMemo(
		() => [
			ALL_FILTER,
			...Array.from(
				new Map(
					(feed?.events ?? []).flatMap((event) =>
						event.markets.map((market) => [market.key, market.label] as const),
					),
				).entries(),
			).sort((first, second) => first[1].localeCompare(second[1])),
		],
		[feed?.events],
	);
	const visibleEvents = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();

		return (feed?.events ?? []).filter((event) => {
			const sportMatches =
				activeSport === ALL_FILTER || event.sportTitle === activeSport;
			const marketMatches =
				activeMarket === ALL_FILTER ||
				event.markets.some((market) => market.key === activeMarket);
			const queryMatches =
				!normalizedQuery ||
				buildEventSearchText(event).includes(normalizedQuery);

			return sportMatches && marketMatches && queryMatches;
		});
	}, [activeMarket, activeSport, feed?.events, query]);
	const stats = useMemo(() => {
		const events = feed?.events ?? [];
		const bookmakers = new Set(
			events.flatMap((event) =>
				event.bestOdds.map((outcome) => outcome.bookmakerKey),
			),
		);
		const markets = new Set(
			events.flatMap((event) => event.markets.map((market) => market.key)),
		);

		return {
			events: events.length,
			live: events.filter((event) => event.status === "Live").length,
			bookmakers: bookmakers.size,
			markets: markets.size,
		};
	}, [feed?.events]);

	const copyText = async (value: string, successMessage: string) => {
		const copied = await copyToClipboard(value);

		showToast(copied ? successMessage : "Copy failed");
	};

	return (
		<div className="flex h-full flex-col overflow-auto bg-background">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="mb-2 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
							<Trophy size={14} />
							Live sportsbook
						</div>
						<h1 className="text-2xl font-bold">Sports Betting</h1>
						<p className="mt-1 max-w-3xl text-sm text-muted">
							Separate live page for online odds, markets, bookmakers, price
							movement, event status, and quick support copy.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
							Auto update every {formatDurationMs(pollMs)}
						</div>
						<button
							type="button"
							onClick={() => void loadFeed(true)}
							disabled={refreshing}
							className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							<RefreshCw
								size={16}
								className={refreshing ? "animate-spin" : undefined}
							/>
							Update
						</button>
					</div>
				</div>

				{error && (
					<div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
						<div className="flex items-start gap-3">
							<AlertTriangle size={18} className="mt-0.5 shrink-0" />
							<div>
								<div className="font-semibold">Live source is unavailable</div>
								<div className="mt-1">{error}</div>
								{error.includes("SPORTS_BETTING_API_KEY") && (
									<div className="mt-2 text-red-100/80">
										Add `SPORTS_BETTING_API_KEY` or `THE_ODDS_API_KEY` to the
										server environment.
									</div>
								)}
							</div>
						</div>
					</div>
				)}

				<section className="rounded-lg border border-border bg-surface p-4">
					<div className="flex flex-wrap items-center gap-3">
						<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300">
							<ShieldCheck size={18} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-semibold">
								Responsible betting guardrail
							</div>
							<div className="mt-1 text-sm text-muted">
								Keep 18+, local eligibility, limits, self-exclusion, and risk
								wording visible in betting promos and support replies.
							</div>
						</div>
					</div>
				</section>

				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
							<BarChart3 size={15} />
							Events
						</div>
						<div className="mt-3 text-2xl font-semibold">{stats.events}</div>
					</div>
					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
							<Activity size={15} />
							Live now
						</div>
						<div className="mt-3 text-2xl font-semibold">{stats.live}</div>
					</div>
					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
							<Trophy size={15} />
							Bookmakers
						</div>
						<div className="mt-3 text-2xl font-semibold">
							{stats.bookmakers}
						</div>
					</div>
					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
							<Clock3 size={15} />
							Updated
						</div>
						<div className="mt-3 text-2xl font-semibold">
							{formatTime(feed?.loadedAt)}
						</div>
					</div>
				</div>

				<div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_minmax(14rem,18rem)_auto_auto]">
					<div className="relative">
						<Search
							size={16}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
						/>
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className="h-10 w-full rounded-md border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="Search sport, team, market, bookmaker..."
						/>
					</div>

					<select
						value={sourceId}
						onChange={(event) => {
							setSourceId(event.target.value);
							setActiveSport(ALL_FILTER);
							setActiveMarket(ALL_FILTER);
							setQuery("");
							setFeed(undefined);
							setLoading(true);
							setMovements({});
							previousPricesRef.current = new Map();
						}}
						className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
					>
						{SPORT_SOURCE_OPTIONS.map((source) => (
							<option key={source.id} value={source.id}>
								{source.label}
							</option>
						))}
					</select>

					<select
						value={activeSport}
						onChange={(event) => setActiveSport(event.target.value)}
						className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
					>
						{sportOptions.map((sport) => (
							<option key={sport} value={sport}>
								{sport}
							</option>
						))}
					</select>

					<select
						value={activeMarket}
						onChange={(event) => setActiveMarket(event.target.value)}
						className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
					>
						{marketOptions.map((market) => (
							<option key={market[0]} value={market[0]}>
								{market[1]}
							</option>
						))}
					</select>
				</div>

				<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
					<section className="rounded-lg border border-border bg-surface">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
							<div>
								<div className="font-semibold">Live Odds Feed</div>
								<div className="mt-1 text-xs text-muted">
									{visibleEvents.length} events visible
								</div>
							</div>
							<div className="rounded-md border border-border px-2 py-1 text-xs text-muted">
								{feed?.provider ?? "Live API"}
							</div>
						</div>

						<div className="divide-y divide-border">
							{loading && !feed ? (
								<div className="px-4 py-12 text-center text-sm text-muted">
									Loading live sports betting data...
								</div>
							) : visibleEvents.length > 0 ? (
								visibleEvents.map((event) => (
									<article key={event.id} className="p-4">
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="flex flex-wrap items-center gap-2">
													<span className="text-xs font-semibold uppercase tracking-wide text-muted">
														{event.sportTitle}
													</span>
													<span
														className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${getStatusClass(
															event.status,
														)}`}
													>
														{event.status}
													</span>
													<span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted">
														{event.bookmakerCount} books
													</span>
												</div>
												<h2 className="mt-2 text-lg font-semibold">
													{event.matchup}
												</h2>
												<div className="mt-1 text-sm text-muted">
													Starts {formatDateTime(event.commenceTime)}
													{event.lastUpdate
														? ` - odds ${formatDateTime(event.lastUpdate)}`
														: ""}
												</div>
											</div>

											<button
												type="button"
												onClick={() =>
													void copyText(
														buildEventSummary(event),
														"Event summary copied",
													)
												}
												className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
											>
												<Copy size={15} />
												Copy
											</button>
										</div>

										<div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
											{event.bestOdds.slice(0, 9).map((outcome) => {
												const key = getOutcomeKey(event, outcome);
												const movement = movements[key];

												return (
													<button
														key={key}
														type="button"
														onClick={() =>
															void copyText(
																`${event.matchup}: ${outcome.marketLabel} ${formatOutcomeLabel(
																	outcome,
																)} ${formatPrice(outcome.price)} at ${
																	outcome.bookmakerTitle
																}`,
																"Odd copied",
															)
														}
														className="rounded-md border border-border bg-background p-3 text-left hover:bg-surface-elevated"
													>
														<div className="flex items-start justify-between gap-2">
															<div className="min-w-0">
																<div className="truncate text-xs font-semibold uppercase tracking-wide text-muted">
																	{outcome.marketLabel}
																</div>
																<div className="mt-1 truncate text-sm font-medium">
																	{formatOutcomeLabel(outcome)}
																</div>
															</div>
															<span
																className={`shrink-0 text-xs font-semibold ${getMovementClass(
																	movement,
																)}`}
															>
																{getMovementLabel(movement)}
															</span>
														</div>
														<div className="mt-3 flex items-end justify-between gap-3">
															<span className="text-2xl font-semibold">
																{formatPrice(outcome.price)}
															</span>
															<span className="truncate text-xs text-muted">
																{outcome.bookmakerTitle}
															</span>
														</div>
													</button>
												);
											})}
										</div>
									</article>
								))
							) : (
								<div className="px-4 py-12 text-center text-sm text-muted">
									No events for {selectedSource.label}. Try another football
									league or Mixed / Upcoming.
								</div>
							)}
						</div>
					</section>

					<div className="space-y-4">
						<section className="rounded-lg border border-border bg-surface">
							<div className="border-b border-border px-4 py-3 font-semibold">
								Live Source
							</div>
							<div className="space-y-3 p-4 text-sm">
								<div className="flex justify-between gap-3">
									<span className="text-muted">Provider</span>
									<span className="font-medium">{feed?.provider ?? "-"}</span>
								</div>
								<div className="flex justify-between gap-3">
									<span className="text-muted">Sports</span>
									<span className="max-w-44 truncate text-right font-medium">
										{feed?.config.sports.join(", ") ?? "-"}
									</span>
								</div>
								<div className="flex justify-between gap-3">
									<span className="text-muted">Selected</span>
									<span className="max-w-44 truncate text-right font-medium">
										{selectedSource.label}
									</span>
								</div>
								<div className="flex justify-between gap-3">
									<span className="text-muted">Markets</span>
									<span className="font-medium">
										{feed?.config.markets ?? "-"}
									</span>
								</div>
								<div className="flex justify-between gap-3">
									<span className="text-muted">
										{feed?.config.bookmakers ? "Bookmakers" : "Regions"}
									</span>
									<span className="font-medium">
										{feed?.config.bookmakers || feed?.config.regions || "-"}
									</span>
								</div>
								<div className="flex justify-between gap-3">
									<span className="text-muted">Quota left</span>
									<span className="font-medium">
										{feed?.quota?.requestsRemaining ?? "-"}
									</span>
								</div>
							</div>
							{feed?.warnings.length ? (
								<div className="border-t border-border px-4 py-3 text-xs text-amber-200">
									{feed.warnings.join(" ")}
								</div>
							) : null}
						</section>

						<section className="rounded-lg border border-border bg-surface">
							<div className="border-b border-border px-4 py-3 font-semibold">
								Quick Copy
							</div>
							<div className="space-y-2 p-4">
								{QUICK_SNIPPETS.map((snippet) => (
									<button
										key={snippet.title}
										type="button"
										onClick={() =>
											void copyText(snippet.text, `${snippet.title} copied`)
										}
										className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
									>
										<span className="font-medium">{snippet.title}</span>
										<Copy size={14} />
									</button>
								))}
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
