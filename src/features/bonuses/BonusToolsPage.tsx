import {
	Copy,
	FileSpreadsheet,
	Loader2,
	RefreshCw,
	Search,
	Table2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
	type BonusRule,
	type BonusToolsData,
	bonusToolsService,
	buildBonusRuleBind,
	type CurrencyTable,
	DEFAULT_BONUS_TOOLS_SHEET_URL,
	findCurrencyValue,
	formatRuleCurrencyAmount,
	getCurrencyTableNameForRule,
	normalizeBonusToolsSearch,
} from "@/services/bonus-tools.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";

function getRuleFieldValue(rule: BonusRule, field: keyof BonusRule) {
	const value = rule[field];

	return typeof value === "string" ? value : "";
}

function getTableByName(tables: CurrencyTable[], name?: string) {
	return tables.find((table) => table.name === name) ?? tables[0];
}

function getRuleAmount(rule?: BonusRule) {
	return rule?.noDeposit || "50";
}

function matchesRule(rule: BonusRule, query: string) {
	const tokens = normalizeBonusToolsSearch(query).split(/\s+/).filter(Boolean);

	if (tokens.length === 0) return true;

	return tokens.every((token) => rule.searchText.includes(token));
}

function formatCell(value: string) {
	return value.trim() || "-";
}

const RULE_COLUMNS: Array<{
	key: keyof BonusRule;
	label: string;
	convert?: boolean;
}> = [
	{ key: "welcomeWager", label: "Welcome wager" },
	{ key: "welcomeMaxWin", label: "Welcome max / FS" },
	{ key: "noDeposit", label: "No dep", convert: true },
	{ key: "retentionWager", label: "Retention wager" },
	{ key: "retentionMaxWin", label: "Retention max / FS" },
	{ key: "events", label: "Events" },
	{ key: "map", label: "Map" },
	{ key: "note", label: "Note" },
];

export function BonusToolsPage() {
	const { showToast } = useToast();
	const [sourceUrl, setSourceUrl] = useState(DEFAULT_BONUS_TOOLS_SHEET_URL);
	const [data, setData] = useState<BonusToolsData>();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [selectedRuleId, setSelectedRuleId] = useState("");
	const [selectedCurrency, setSelectedCurrency] = useState("EUR");
	const [selectedTableName, setSelectedTableName] = useState("");
	const [selectedBaseAmount, setSelectedBaseAmount] = useState("");

	const loadData = useCallback(
		async (nextUrl: string) => {
			setLoading(true);
			setError("");

			try {
				const nextData = await bonusToolsService.load(nextUrl);

				setData(nextData);
				setSelectedRuleId((current) => current || nextData.rules[0]?.id || "");
				showToast("Bonus tools loaded");
			} catch (loadError) {
				setError(
					loadError instanceof Error
						? loadError.message
						: "Unable to load bonus tools",
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	useEffect(() => {
		void loadData(DEFAULT_BONUS_TOOLS_SHEET_URL);
	}, [loadData]);

	const filteredRules = useMemo(
		() => data?.rules.filter((rule) => matchesRule(rule, query)) ?? [],
		[data?.rules, query],
	);
	const selectedRule =
		data?.rules.find((rule) => rule.id === selectedRuleId) ??
		filteredRules[0] ??
		data?.rules[0];
	const inferredTableName = getCurrencyTableNameForRule(
		selectedRule,
		data?.currencyTables ?? [],
	);
	const activeTable = getTableByName(
		data?.currencyTables ?? [],
		selectedTableName || inferredTableName,
	);
	const currencies = activeTable?.currencies ?? [];
	const selectedAmount =
		findCurrencyValue(activeTable, selectedBaseAmount, selectedCurrency) ||
		findCurrencyValue(
			activeTable,
			getRuleAmount(selectedRule),
			selectedCurrency,
		);
	const quickBind =
		selectedRule &&
		buildBonusRuleBind({
			rule: selectedRule,
			table: activeTable,
			currency: selectedCurrency,
		});

	useEffect(() => {
		if (!selectedRule) return;

		setSelectedTableName(
			(current) =>
				current ||
				getCurrencyTableNameForRule(selectedRule, data?.currencyTables ?? []) ||
				"",
		);
		setSelectedBaseAmount((current) => current || getRuleAmount(selectedRule));
	}, [data?.currencyTables, selectedRule]);

	useEffect(() => {
		if (currencies.length === 0) return;

		setSelectedCurrency((current) =>
			currencies.includes(current) ? current : currencies[0],
		);
	}, [currencies]);

	const copyText = async (value: string, successMessage: string) => {
		const copied = await copyToClipboard(value);

		showToast(copied ? successMessage : "Copy failed");
	};

	return (
		<div className="flex h-full flex-col overflow-auto bg-background">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold">Bonus Tools</h1>
						<div className="mt-1 text-sm text-muted">
							{data
								? `${data.rules.length} projects · ${data.currencyTables.length} currency tables`
								: "Bonus rules and currency tables"}
						</div>
					</div>

					<button
						type="button"
						onClick={() => void loadData(sourceUrl)}
						disabled={loading}
						className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
					>
						{loading ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<RefreshCw size={16} />
						)}
						Reload
					</button>
				</div>

				<div className="rounded-lg border border-border bg-surface p-4">
					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<FileSpreadsheet size={16} />
						Google Sheet
					</div>

					<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
						<input
							value={sourceUrl}
							onChange={(event) => setSourceUrl(event.target.value)}
							className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
						/>
						<button
							type="button"
							onClick={() => void loadData(sourceUrl)}
							disabled={loading || !sourceUrl.trim()}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{loading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<FileSpreadsheet size={16} />
							)}
							Load
						</button>
					</div>

					{error && (
						<div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
							{error}
						</div>
					)}

					{data?.warnings.length ? (
						<div className="mt-3 space-y-1 text-xs text-amber-200">
							{data.warnings.map((warning) => (
								<div key={warning}>{warning}</div>
							))}
						</div>
					) : null}
				</div>

				<div className="grid gap-3 xl:grid-cols-[minmax(16rem,1.2fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)]">
					<div className="relative">
						<Search
							size={16}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
						/>
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className="h-10 w-full rounded-md border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="Search project, wager, note..."
						/>
					</div>

					<select
						value={selectedRule?.id ?? ""}
						onChange={(event) => {
							const nextRule = data?.rules.find(
								(rule) => rule.id === event.target.value,
							);

							setSelectedRuleId(event.target.value);
							setSelectedTableName(
								getCurrencyTableNameForRule(
									nextRule,
									data?.currencyTables ?? [],
								) ?? "",
							);
							setSelectedBaseAmount(getRuleAmount(nextRule));
						}}
						className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
					>
						{data?.rules.map((rule) => (
							<option key={rule.id} value={rule.id}>
								{rule.site}
							</option>
						))}
					</select>

					<select
						value={selectedCurrency}
						onChange={(event) => setSelectedCurrency(event.target.value)}
						className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
					>
						{currencies.map((currency) => (
							<option key={currency} value={currency}>
								{currency}
							</option>
						))}
					</select>

					<select
						value={selectedTableName || activeTable?.name || ""}
						onChange={(event) => setSelectedTableName(event.target.value)}
						className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
					>
						{data?.currencyTables.map((table) => (
							<option key={table.name} value={table.name}>
								{table.name}
							</option>
						))}
					</select>
				</div>

				<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
					<section className="rounded-lg border border-border bg-surface">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
							<div>
								<div className="font-semibold">
									{selectedRule?.site ?? "No project selected"}
								</div>
								<div className="mt-1 text-xs text-muted">
									{selectedRule?.group ?? "-"} · {activeTable?.name ?? "-"}
								</div>
							</div>

							{quickBind && (
								<button
									type="button"
									onClick={() => void copyText(quickBind, "Bonus rules copied")}
									className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
								>
									<Copy size={15} />
									Copy Rules
								</button>
							)}
						</div>

						<div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
							{RULE_COLUMNS.map((column) => {
								const rawValue = selectedRule
									? getRuleFieldValue(selectedRule, column.key)
									: "";
								const value =
									column.convert && selectedRule
										? formatRuleCurrencyAmount(
												selectedRule,
												activeTable,
												selectedCurrency,
												rawValue,
											)
										: rawValue;

								return (
									<div
										key={column.key}
										className="rounded-md border border-border bg-background p-3"
									>
										<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
											{column.label}
										</div>
										<div className="min-h-10 whitespace-pre-wrap text-sm leading-5">
											{formatCell(value)}
										</div>
										{value && (
											<button
												type="button"
												onClick={() =>
													void copyText(value, `${column.label} copied`)
												}
												className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
											>
												<Copy size={13} />
												Copy
											</button>
										)}
									</div>
								);
							})}
						</div>
					</section>

					<section className="rounded-lg border border-border bg-surface">
						<div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
							<Table2 size={16} />
							Currency
						</div>

						<div className="space-y-3 p-4">
							<select
								value={selectedBaseAmount}
								onChange={(event) => setSelectedBaseAmount(event.target.value)}
								className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							>
								{activeTable?.rows.map((row) => (
									<option key={row.base} value={row.base}>
										{row.base}
									</option>
								))}
							</select>

							<div className="rounded-md border border-border bg-background p-3">
								<div className="text-xs font-semibold uppercase tracking-wide text-muted">
									Selected
								</div>
								<div className="mt-2 text-2xl font-semibold">
									{selectedAmount || "-"}
								</div>
								{selectedAmount && (
									<button
										type="button"
										onClick={() =>
											void copyText(selectedAmount, "Currency value copied")
										}
										className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
									>
										<Copy size={13} />
										Copy
									</button>
								)}
							</div>

							<div className="max-h-72 overflow-auto rounded-md border border-border">
								<table className="min-w-full text-left text-xs">
									<thead className="sticky top-0 bg-surface-elevated text-muted">
										<tr>
											<th className="px-2 py-2 font-semibold">EUR</th>
											{currencies
												.filter((currency) => currency !== "EUR")
												.map((currency) => (
													<th
														key={currency}
														className="px-2 py-2 font-semibold"
													>
														{currency}
													</th>
												))}
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{activeTable?.rows.slice(0, 80).map((row) => (
											<tr
												key={row.base}
												className="hover:bg-surface-elevated/60"
											>
												<td className="whitespace-nowrap px-2 py-2 font-medium">
													{row.values.EUR ?? row.base}
												</td>
												{currencies
													.filter((currency) => currency !== "EUR")
													.map((currency) => (
														<td
															key={currency}
															className="whitespace-nowrap px-2 py-2 text-muted"
														>
															{row.values[currency] ?? ""}
														</td>
													))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					</section>
				</div>

				<section className="rounded-lg border border-border bg-surface">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div className="font-semibold">Bonus Rules</div>
						<div className="text-sm text-muted">
							{filteredRules.length} rows
						</div>
					</div>

					<div className="overflow-auto">
						<table className="min-w-[72rem] text-left text-sm">
							<thead className="bg-surface-elevated text-xs uppercase tracking-wide text-muted">
								<tr>
									<th className="px-3 py-2 font-semibold">Project</th>
									<th className="px-3 py-2 font-semibold">Group</th>
									{RULE_COLUMNS.map((column) => (
										<th key={column.key} className="px-3 py-2 font-semibold">
											{column.label}
										</th>
									))}
									<th className="px-3 py-2 font-semibold">Copy</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{filteredRules.map((rule) => {
									const rowTable = getTableByName(
										data?.currencyTables ?? [],
										getCurrencyTableNameForRule(
											rule,
											data?.currencyTables ?? [],
										),
									);
									const bind = buildBonusRuleBind({
										rule,
										table: rowTable,
										currency: selectedCurrency,
									});

									return (
										<tr
											key={rule.id}
											className="align-top hover:bg-surface-elevated/60"
										>
											<td className="whitespace-nowrap px-3 py-2 font-medium">
												<button
													type="button"
													onClick={() => setSelectedRuleId(rule.id)}
													className="text-left text-foreground hover:text-accent"
												>
													{rule.site}
												</button>
											</td>
											<td className="whitespace-nowrap px-3 py-2 text-muted">
												{rule.group}
											</td>
											{RULE_COLUMNS.map((column) => {
												const rawValue = getRuleFieldValue(rule, column.key);
												const value = column.convert
													? formatRuleCurrencyAmount(
															rule,
															rowTable,
															selectedCurrency,
															rawValue,
														)
													: rawValue;

												return (
													<td
														key={column.key}
														className="max-w-48 whitespace-pre-wrap px-3 py-2 text-muted"
													>
														{formatCell(value)}
													</td>
												);
											})}
											<td className="whitespace-nowrap px-3 py-2">
												<button
													type="button"
													onClick={() =>
														void copyText(bind, `${rule.site} copied`)
													}
													className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
												>
													<Copy size={13} />
													Copy
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</div>
	);
}
