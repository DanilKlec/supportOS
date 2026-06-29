const ODDS_API_HOST = "https://api.the-odds-api.com";
const DEFAULT_SPORTS = "upcoming";
const DEFAULT_REGIONS = "eu";
const DEFAULT_MARKETS = "h2h";
const DEFAULT_ODDS_FORMAT = "decimal";
const DEFAULT_DATE_FORMAT = "iso";
const DEFAULT_LIMIT = 24;
const DEFAULT_POLL_MS = 60_000;

const MARKET_LABELS = {
	h2h: "Moneyline",
	h2h_lay: "Lay moneyline",
	spreads: "Spread",
	totals: "Total",
	outrights: "Outright",
	outrights_lay: "Lay outright",
};

function readQueryValue(query, key) {
	const value = query?.[key];

	if (Array.isArray(value)) return value[0];

	return typeof value === "string" ? value : undefined;
}

function normalizeList(value, fallback, pattern) {
	return (value || fallback)
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item && pattern.test(item));
}

function normalizeInt(value, fallback, min, max) {
	const parsed = Number.parseInt(value ?? "", 10);

	if (!Number.isFinite(parsed)) return fallback;

	return Math.max(min, Math.min(max, parsed));
}

function getLastUpdate(bookmakers) {
	const timestamps = bookmakers
		.map((bookmaker) => new Date(bookmaker.last_update ?? "").getTime())
		.filter(Number.isFinite);

	if (timestamps.length === 0) return undefined;

	return new Date(Math.max(...timestamps)).toISOString();
}

function getEventStatus(commenceTime) {
	const startsAt = new Date(commenceTime).getTime();

	if (!Number.isFinite(startsAt)) return "Upcoming";

	const now = Date.now();
	const fourHours = 4 * 60 * 60 * 1000;

	if (startsAt <= now && now - startsAt < fourHours) return "Live";
	if (now - startsAt >= fourHours) return "Settling";

	return "Upcoming";
}

function getOutcomeGroupKey(outcome) {
	return [
		outcome.marketKey,
		outcome.name,
		typeof outcome.point === "number" ? outcome.point : "",
	].join(":");
}

function toMarketLabel(key) {
	return MARKET_LABELS[key] ?? key;
}

function normalizeEvent(event) {
	const markets = new Map();
	const allOutcomes = [];

	for (const bookmaker of event.bookmakers ?? []) {
		for (const market of bookmaker.markets ?? []) {
			const marketKey = market.key ?? "market";
			const marketLabel = toMarketLabel(marketKey);
			const normalizedMarket =
				markets.get(marketKey) ??
				{
					key: marketKey,
					label: marketLabel,
					outcomes: [],
				};

			for (const outcome of market.outcomes ?? []) {
				if (typeof outcome.price !== "number") continue;

				const normalizedOutcome = {
					name: outcome.name ?? "Outcome",
					price: outcome.price,
					point:
						typeof outcome.point === "number" ? outcome.point : undefined,
					bookmakerKey: bookmaker.key ?? "bookmaker",
					bookmakerTitle: bookmaker.title ?? bookmaker.key ?? "Bookmaker",
					marketKey,
					marketLabel,
					lastUpdate:
						market.last_update ?? bookmaker.last_update ?? undefined,
					link: outcome.link ?? market.link ?? bookmaker.link ?? undefined,
				};

				normalizedMarket.outcomes.push(normalizedOutcome);
				allOutcomes.push(normalizedOutcome);
			}

			markets.set(marketKey, normalizedMarket);
		}
	}

	const bestOdds = Array.from(
		allOutcomes
			.reduce((bestByOutcome, outcome) => {
				const key = getOutcomeGroupKey(outcome);
				const current = bestByOutcome.get(key);

				if (!current || outcome.price > current.price) {
					bestByOutcome.set(key, outcome);
				}

				return bestByOutcome;
			}, new Map())
			.values(),
	).sort((first, second) => {
		if (first.marketKey !== second.marketKey) {
			return first.marketKey.localeCompare(second.marketKey);
		}

		return first.name.localeCompare(second.name);
	});

	const bookmakerCount = event.bookmakers?.length ?? 0;
	const normalizedMarkets = Array.from(markets.values());

	return {
		id: event.id,
		sportKey: event.sport_key,
		sportTitle: event.sport_title ?? event.sport_key,
		commenceTime: event.commence_time,
		homeTeam: event.home_team,
		awayTeam: event.away_team,
		matchup:
			event.home_team && event.away_team
				? `${event.away_team} @ ${event.home_team}`
				: event.home_team ?? event.away_team ?? "Event",
		status: getEventStatus(event.commence_time),
		bookmakerCount,
		marketCount: normalizedMarkets.length,
		lastUpdate: getLastUpdate(event.bookmakers ?? []),
		markets: normalizedMarkets,
		bestOdds,
	};
}

function getSortWeight(status) {
	if (status === "Live") return 0;
	if (status === "Upcoming") return 1;

	return 2;
}

function sortEvents(first, second) {
	const statusDiff = getSortWeight(first.status) - getSortWeight(second.status);

	if (statusDiff !== 0) return statusDiff;

	return (
		new Date(first.commenceTime).getTime() -
		new Date(second.commenceTime).getTime()
	);
}

function collectQuota(headers) {
	return {
		requestsRemaining: headers.get("x-requests-remaining") ?? undefined,
		requestsUsed: headers.get("x-requests-used") ?? undefined,
		requestsLast: headers.get("x-requests-last") ?? undefined,
	};
}

function createHttpError(status, message, details) {
	const error = new Error(message);

	error.status = status;
	error.details = details;

	return error;
}

function getConfig({ query = {}, env = process.env } = {}) {
	const apiKey = env.SPORTS_BETTING_API_KEY ?? env.THE_ODDS_API_KEY;

	if (!apiKey) {
		throw createHttpError(
			503,
			"SPORTS_BETTING_API_KEY is not configured",
		);
	}

	const sports = normalizeList(
		readQueryValue(query, "sports") ?? env.SPORTS_BETTING_SPORTS,
		DEFAULT_SPORTS,
		/^[a-z0-9_]+$/i,
	);
	const regions = normalizeList(
		readQueryValue(query, "regions") ?? env.SPORTS_BETTING_REGIONS,
		DEFAULT_REGIONS,
		/^[a-z0-9_]+$/i,
	).join(",");
	const markets = normalizeList(
		readQueryValue(query, "markets") ?? env.SPORTS_BETTING_MARKETS,
		DEFAULT_MARKETS,
		/^[a-z0-9_]+$/i,
	).join(",");
	const bookmakers = normalizeList(
		readQueryValue(query, "bookmakers") ?? env.SPORTS_BETTING_BOOKMAKERS,
		"",
		/^[a-z0-9_]+$/i,
	).join(",");
	const limit = normalizeInt(
		readQueryValue(query, "limit") ?? env.SPORTS_BETTING_LIMIT,
		DEFAULT_LIMIT,
		1,
		50,
	);
	const pollMs = normalizeInt(
		env.SPORTS_BETTING_POLL_MS,
		DEFAULT_POLL_MS,
		15_000,
		300_000,
	);

	return {
		apiKey,
		sports: sports.length > 0 ? sports : [DEFAULT_SPORTS],
		regions,
		markets,
		bookmakers,
		limit,
		pollMs,
	};
}

async function fetchOddsForSport(config, sport) {
	const params = new URLSearchParams({
		apiKey: config.apiKey,
		markets: config.markets,
		oddsFormat: DEFAULT_ODDS_FORMAT,
		dateFormat: DEFAULT_DATE_FORMAT,
	});

	if (config.bookmakers) {
		params.set("bookmakers", config.bookmakers);
	} else {
		params.set("regions", config.regions);
	}

	const response = await fetch(
		`${ODDS_API_HOST}/v4/sports/${encodeURIComponent(sport)}/odds/?${params}`,
		{
			headers: {
				Accept: "application/json",
				"User-Agent": "SupportOS Sports Betting Live",
			},
		},
	);
	const text = await response.text();

	if (!response.ok) {
		throw createHttpError(
			response.status,
			`The Odds API returned ${response.status}`,
			text,
		);
	}

	let events;

	try {
		events = JSON.parse(text);
	} catch {
		throw createHttpError(502, "The Odds API returned invalid JSON");
	}

	if (!Array.isArray(events)) {
		throw createHttpError(502, "The Odds API returned an unexpected payload");
	}

	return {
		sport,
		events,
		quota: collectQuota(response.headers),
	};
}

export async function loadSportsBettingLive(options = {}) {
	const config = getConfig(options);
	const results = await Promise.allSettled(
		config.sports.map((sport) => fetchOddsForSport(config, sport)),
	);
	const fulfilled = results
		.filter((result) => result.status === "fulfilled")
		.map((result) => result.value);
	const warnings = results
		.filter((result) => result.status === "rejected")
		.map((result) =>
			result.reason instanceof Error
				? result.reason.message
				: "Unable to load one sport",
		);

	if (fulfilled.length === 0) {
		const firstError = results[0]?.reason;

		throw createHttpError(
			firstError?.status ?? 502,
			firstError instanceof Error
				? firstError.message
				: "Unable to load sports betting data",
			firstError?.details,
		);
	}

	const events = fulfilled
		.flatMap((result) => result.events)
		.map(normalizeEvent)
		.filter((event) => event.id && event.bestOdds.length > 0)
		.sort(sortEvents)
		.slice(0, config.limit);
	const quota = fulfilled[fulfilled.length - 1]?.quota;

	return {
		provider: "The Odds API",
		loadedAt: new Date().toISOString(),
		pollMs: config.pollMs,
		config: {
			sports: config.sports,
			regions: config.regions,
			markets: config.markets,
			bookmakers: config.bookmakers || undefined,
			oddsFormat: DEFAULT_ODDS_FORMAT,
		},
		quota,
		warnings,
		events,
	};
}
