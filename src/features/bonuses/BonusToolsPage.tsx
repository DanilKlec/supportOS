import {
	Copy,
	FileSpreadsheet,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Table2,
	Upload,
	X,
} from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

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
	loadStoredBonusToolsData,
	normalizeBonusToolsSearch,
	saveStoredBonusToolsData,
} from "@/services/bonus-tools.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useBonusStore } from "@/store/bonus.store";

type EditableRuleField = Exclude<keyof BonusRule, "id" | "searchText">;
type RuleDraft = Record<EditableRuleField, string>;

const EMPTY_RULE_DRAFT: RuleDraft = {
	group: "",
	site: "",
	welcomeWager: "",
	welcomeMaxWin: "",
	noDeposit: "",
	retentionWager: "",
	retentionMaxWin: "",
	events: "",
	map: "",
	note: "",
};

const RULE_FORM_FIELDS: Array<{
	key: EditableRuleField;
	label: string;
	placeholder?: string;
	multiline?: boolean;
}> = [
	{ key: "group", label: "Group", placeholder: "B2C / GZ / CS" },
	{ key: "site", label: "Project", placeholder: "Project name" },
	{
		key: "welcomeWager",
		label: "Welcome wager",
		placeholder: "35x bonus + 40x FS",
	},
	{
		key: "welcomeMaxWin",
		label: "Welcome max / FS",
		placeholder: "Max win / FS release",
	},
	{ key: "noDeposit", label: "No deposit", placeholder: "50 EUR" },
	{
		key: "retentionWager",
		label: "Retention wager",
		placeholder: "Wager for retention",
	},
	{
		key: "retentionMaxWin",
		label: "Retention max / FS",
		placeholder: "Max win / FS release",
	},
	{
		key: "events",
		label: "Events",
		placeholder: "Event rules",
		multiline: true,
	},
	{ key: "map", label: "Map", placeholder: "Map details", multiline: true },
	{ key: "note", label: "Note", placeholder: "Internal note", multiline: true },
];

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

function getRuleSearchWords(rule: BonusRule) {
	return normalizeBonusToolsSearch(
		[
			rule.group,
			rule.site,
			rule.welcomeWager,
			rule.welcomeMaxWin,
			rule.noDeposit,
			rule.retentionWager,
			rule.retentionMaxWin,
			rule.events,
			rule.map,
			rule.note,
		].join(" "),
	)
		.split(/\s+/)
		.filter(Boolean);
}

function matchesRuleToken(rule: BonusRule, token: string) {
	if (token.length <= 2) {
		const words = getRuleSearchWords(rule);
		const site = normalizeBonusToolsSearch(rule.site).replace(/\s+/g, "");
		const group = normalizeBonusToolsSearch(rule.group).replace(/\s+/g, "");

		return (
			site === token ||
			group === token ||
			words.includes(token) ||
			words.some((word) => word.length <= 4 && word.startsWith(token))
		);
	}

	return rule.searchText.includes(token);
}

function getRuleSearchScore(rule: BonusRule, query: string) {
	const tokens = normalizeBonusToolsSearch(query).split(/\s+/).filter(Boolean);

	if (tokens.length === 0) return 0;

	const words = new Set(getRuleSearchWords(rule));
	const site = normalizeBonusToolsSearch(rule.site).replace(/\s+/g, "");

	if (!tokens.every((token) => matchesRuleToken(rule, token))) return -1;

	return tokens.reduce((score, token) => {
		if (site === token) return score + 150;
		if (words.has(token)) return score + 100;
		if (
			Array.from(words).some(
				(word) => word.length <= 4 && word.startsWith(token),
			)
		) {
			return score + 70;
		}

		return score + 10;
	}, 0);
}

function normalizeRuleIdPart(value: string) {
	return normalizeBonusToolsSearch(value).replace(/\s+/g, "-");
}

function buildEditableRuleSearchText(draft: RuleDraft) {
	return normalizeBonusToolsSearch(
		RULE_FORM_FIELDS.map((field) => draft[field.key]).join(" "),
	);
}

function toRuleDraft(rule?: BonusRule): RuleDraft {
	if (!rule) return { ...EMPTY_RULE_DRAFT };

	return {
		group: rule.group,
		site: rule.site,
		welcomeWager: rule.welcomeWager,
		welcomeMaxWin: rule.welcomeMaxWin,
		noDeposit: rule.noDeposit,
		retentionWager: rule.retentionWager,
		retentionMaxWin: rule.retentionMaxWin,
		events: rule.events,
		map: rule.map,
		note: rule.note,
	};
}

function createRuleId(draft: RuleDraft, rules: BonusRule[]) {
	const base =
		normalizeRuleIdPart(`${draft.group}-${draft.site}`) ||
		`bonus-rule-${Date.now()}`;
	let candidate = base;
	let suffix = 2;

	while (rules.some((rule) => rule.id === candidate)) {
		candidate = `${base}-${suffix}`;
		suffix += 1;
	}

	return candidate;
}

function createRuleFromDraft({
	draft,
	rules,
	id,
}: {
	draft: RuleDraft;
	rules: BonusRule[];
	id?: string;
}): BonusRule {
	const cleanDraft = RULE_FORM_FIELDS.reduce(
		(nextDraft, field) => {
			nextDraft[field.key] = draft[field.key].trim();

			return nextDraft;
		},
		{ ...EMPTY_RULE_DRAFT },
	);

	return {
		id: id ?? createRuleId(cleanDraft, rules),
		...cleanDraft,
		searchText: buildEditableRuleSearchText(cleanDraft),
	};
}

function createEmptyBonusToolsData(sourceUrl: string): BonusToolsData {
	return {
		sourceUrl: sourceUrl.trim() || DEFAULT_BONUS_TOOLS_SHEET_URL,
		rules: [],
		currencyTables: [],
		loadedAt: new Date().toISOString(),
		warnings: [],
	};
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
	const query = useBonusStore((state) => state.bonusToolsQuery);
	const selectedRuleId = useBonusStore(
		(state) => state.bonusToolsSelectedRuleId,
	);
	const selectedCurrency = useBonusStore((state) => state.selectedCurrency);
	const selectedTableName = useBonusStore(
		(state) => state.bonusToolsSelectedTableName,
	);
	const selectedBaseAmount = useBonusStore(
		(state) => state.bonusToolsSelectedBaseAmount,
	);
	const storedSourceUrl = useBonusStore((state) => state.bonusToolsSourceUrl);
	const setQuery = useBonusStore((state) => state.setBonusToolsQuery);
	const setSelectedRuleId = useBonusStore(
		(state) => state.setBonusToolsSelectedRule,
	);
	const setSelectedCurrency = useBonusStore(
		(state) => state.setSelectedCurrency,
	);
	const setSelectedTableName = useBonusStore(
		(state) => state.setBonusToolsSelectedTable,
	);
	const setSelectedBaseAmount = useBonusStore(
		(state) => state.setBonusToolsSelectedBaseAmount,
	);
	const setStoredSourceUrl = useBonusStore(
		(state) => state.setBonusToolsSourceUrl,
	);
	const [data, setData] = useState<BonusToolsData | undefined>(() =>
		loadStoredBonusToolsData(),
	);
	const sourceUrl =
		storedSourceUrl || data?.sourceUrl || DEFAULT_BONUS_TOOLS_SHEET_URL;
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [sourceOpen, setSourceOpen] = useState(false);
	const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
	const [editingRuleId, setEditingRuleId] = useState<string>();
	const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() => toRuleDraft());
	const [ruleFormError, setRuleFormError] = useState("");

	const updateFromGoogle = useCallback(
		async (nextUrl: string, showSuccess = true) => {
			setLoading(true);
			setError("");

			try {
				const nextData = await bonusToolsService.load(nextUrl);

				saveStoredBonusToolsData(nextData);
				setData(nextData);
				setSelectedRuleId(selectedRuleId || nextData.rules[0]?.id || "");
				setStoredSourceUrl(nextData.sourceUrl);
				if (showSuccess) {
					showToast("Bonus tools updated from Google Sheet");
					setSourceOpen(false);
				}
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
		[showToast, selectedRuleId, setSelectedRuleId, setStoredSourceUrl],
	);

	useEffect(() => {
		if (data) return;

		void updateFromGoogle(DEFAULT_BONUS_TOOLS_SHEET_URL, false);
	}, [data, updateFromGoogle]);

	useEffect(() => {
		if (!ruleEditorOpen) return;

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setRuleEditorOpen(false);
		};

		document.addEventListener("keydown", closeOnEscape);

		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [ruleEditorOpen]);

	const filteredRules = useMemo(
		() =>
			data?.rules
				.map((rule) => ({
					rule,
					score: getRuleSearchScore(rule, query),
				}))
				.filter((item) => item.score >= 0)
				.sort((first, second) => {
					if (second.score !== first.score) return second.score - first.score;

					return first.rule.site.localeCompare(second.rule.site);
				})
				.map((item) => item.rule) ?? [],
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

		const tableExists = data?.currencyTables.some(
			(table) => table.name === selectedTableName,
		);

		if (!selectedTableName || !tableExists) {
			setSelectedTableName(
				getCurrencyTableNameForRule(selectedRule, data?.currencyTables ?? []) ||
					"",
			);
		}

		if (!selectedBaseAmount) {
			setSelectedBaseAmount(getRuleAmount(selectedRule));
		}
	}, [
		data?.currencyTables,
		selectedBaseAmount,
		selectedRule,
		selectedTableName,
		setSelectedBaseAmount,
		setSelectedTableName,
	]);

	useEffect(() => {
		if (currencies.length === 0) return;

		if (!currencies.includes(selectedCurrency)) {
			setSelectedCurrency(currencies[0]);
		}
	}, [currencies, selectedCurrency, setSelectedCurrency]);

	const copyText = async (value: string, successMessage: string) => {
		const copied = await copyToClipboard(value);

		showToast(copied ? successMessage : "Copy failed");
	};

	const openCreateRule = () => {
		setEditingRuleId(undefined);
		setRuleDraft(toRuleDraft());
		setRuleFormError("");
		setRuleEditorOpen(true);
	};

	const openEditRule = (rule: BonusRule) => {
		setEditingRuleId(rule.id);
		setRuleDraft(toRuleDraft(rule));
		setRuleFormError("");
		setRuleEditorOpen(true);
	};

	const updateRuleDraft = (field: EditableRuleField, value: string) => {
		setRuleDraft((current) => ({
			...current,
			[field]: value,
		}));
	};

	const submitRule = (event: FormEvent) => {
		event.preventDefault();
		setRuleFormError("");

		if (!ruleDraft.site.trim()) {
			setRuleFormError("Project name is required");
			return;
		}

		const baseData = data ?? createEmptyBonusToolsData(sourceUrl);
		const editingRule = baseData.rules.find(
			(rule) => rule.id === editingRuleId,
		);
		const rule = createRuleFromDraft({
			draft: ruleDraft,
			rules: baseData.rules,
			id: editingRule?.id,
		});
		const nextRules = editingRule
			? baseData.rules.map((currentRule) =>
					currentRule.id === editingRule.id ? rule : currentRule,
				)
			: [...baseData.rules, rule];
		const nextData: BonusToolsData = {
			...baseData,
			rules: nextRules,
			loadedAt: new Date().toISOString(),
		};

		saveStoredBonusToolsData(nextData);
		setData(nextData);
		setSelectedRuleId(rule.id);
		setSelectedTableName(
			getCurrencyTableNameForRule(rule, nextData.currencyTables) ?? "",
		);
		setSelectedBaseAmount(getRuleAmount(rule));
		setRuleEditorOpen(false);
		setEditingRuleId(undefined);
		setRuleDraft(toRuleDraft());
		setQuery("");
		showToast(editingRule ? "Bonus rule saved" : "Bonus rule added");
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<div className="supportos-scroll mx-auto flex h-full w-full max-w-7xl flex-col gap-4 overflow-auto p-4 sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="text-xs font-semibold uppercase text-muted">
							Fast rules lookup
						</div>
						<h1 className="mt-1 text-xl font-semibold sm:text-2xl">
							Bonus Tools
						</h1>
						<div className="mt-1 text-sm text-muted">
							{data
								? `${data.rules.length} projects / ${data.currencyTables.length} currency tables`
								: "Bonus rules and currency tables"}
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={openCreateRule}
							className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
						>
							<Plus size={16} />
							Add rule
						</button>

						<button
							type="button"
							onClick={() => void updateFromGoogle(sourceUrl)}
							disabled={loading}
							className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							{loading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<RefreshCw size={16} />
							)}
							Update
						</button>

						<button
							type="button"
							onClick={() => setSourceOpen((current) => !current)}
							className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<Upload size={16} />
							Source
						</button>
					</div>
				</div>

				{sourceOpen && (
					<div className="rounded-xl border border-border bg-surface p-4">
						<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
							<FileSpreadsheet size={16} />
							Google Sheet
						</div>

						{data && (
							<div className="mb-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
								Saved locally: {new Date(data.loadedAt).toLocaleString()}. Use
								Update from Google when the sheet changes. Local edits can be
								replaced by the next Google Sheet update.
							</div>
						)}

						<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
							<input
								value={sourceUrl}
								onChange={(event) => setStoredSourceUrl(event.target.value)}
								className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
							/>
							<button
								type="button"
								onClick={() => void updateFromGoogle(sourceUrl)}
								disabled={loading || !sourceUrl.trim()}
								className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{loading ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									<FileSpreadsheet size={16} />
								)}
								Update
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
				)}

				<div className="grid gap-3 xl:grid-cols-[minmax(16rem,1.2fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)]">
					<div className="relative">
						<Search
							size={16}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
						/>
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
						className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
						className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
						className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
					>
						{data?.currencyTables.map((table) => (
							<option key={table.name} value={table.name}>
								{table.name}
							</option>
						))}
					</select>
				</div>

				<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
					<section className="rounded-xl border border-border bg-surface">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
							<div>
								<div className="font-semibold">
									{selectedRule?.site ?? "No project selected"}
								</div>
								<div className="mt-1 text-xs text-muted">
									{selectedRule?.group ?? "-"} - {activeTable?.name ?? "-"}
								</div>
							</div>

							<div className="flex flex-wrap items-center gap-2">
								{selectedRule && (
									<button
										type="button"
										onClick={() => openEditRule(selectedRule)}
										className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
									>
										<Pencil size={15} />
										Edit
									</button>
								)}
								{quickBind && (
									<button
										type="button"
										onClick={() =>
											void copyText(quickBind, "Bonus rules copied")
										}
										className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
									>
										<Copy size={15} />
										Copy Rules
									</button>
								)}
							</div>
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
										className="rounded-lg bg-background p-3"
									>
										<div className="mb-2 text-xs font-semibold uppercase text-muted">
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
												className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
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

					<section className="rounded-xl border border-border bg-surface">
						<div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
							<Table2 size={16} />
							Currency
						</div>

						<div className="space-y-3 p-4">
							<select
								value={selectedBaseAmount}
								onChange={(event) => setSelectedBaseAmount(event.target.value)}
								className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
							>
								{activeTable?.rows.map((row) => (
									<option key={row.base} value={row.base}>
										{row.base}
									</option>
								))}
							</select>

							<div className="rounded-lg bg-background p-3">
								<div className="text-xs font-semibold uppercase text-muted">
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
										className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
									>
										<Copy size={13} />
										Copy
									</button>
								)}
							</div>

							<div className="supportos-scroll max-h-72 overflow-auto rounded-lg border border-border">
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

				<section className="rounded-xl border border-border bg-surface">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div className="font-semibold">Bonus Rules</div>
						<div className="text-sm text-muted">
							{filteredRules.length} rows
						</div>
					</div>

					<div className="supportos-scroll overflow-auto">
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
									<th className="px-3 py-2 font-semibold">Actions</th>
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
												<div className="flex items-center gap-2">
													<button
														type="button"
														onClick={() => openEditRule(rule)}
														className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
													>
														<Pencil size={13} />
														Edit
													</button>
													<button
														type="button"
														onClick={() =>
															void copyText(bind, `${rule.site} copied`)
														}
														className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
													>
														<Copy size={13} />
														Copy
													</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</section>
			</div>

			{ruleEditorOpen && (
				<div
					className="fixed inset-0 z-50 flex items-end bg-black/45 p-0 sm:items-center sm:justify-center sm:p-4"
					role="dialog"
					aria-modal="true"
					aria-labelledby="bonus-rule-editor-title"
					onMouseDown={(event) => {
						if (event.currentTarget === event.target) {
							setRuleEditorOpen(false);
						}
					}}
				>
					<form
						onSubmit={submitRule}
						className="supportos-scroll flex max-h-[92vh] w-full flex-col overflow-auto rounded-t-2xl border border-border bg-surface shadow-2xl sm:max-w-3xl sm:rounded-2xl"
					>
						<div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3">
							<div>
								<h2
									id="bonus-rule-editor-title"
									className="text-base font-semibold"
								>
									{editingRuleId ? "Edit bonus rule" : "Add bonus rule"}
								</h2>
								<p className="mt-1 text-xs text-muted">
									Saved locally and available in search, copy, and currency
									matching.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setRuleEditorOpen(false)}
								className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-foreground"
								aria-label="Close editor"
							>
								<X size={16} />
							</button>
						</div>

						<div className="grid gap-3 p-4 sm:grid-cols-2">
							{RULE_FORM_FIELDS.map((field) => {
								const inputId = `bonus-rule-${field.key}`;
								const className =
									"w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

								return (
									<label
										key={field.key}
										htmlFor={inputId}
										className={field.multiline ? "sm:col-span-2" : ""}
									>
										<span className="mb-1 block text-xs font-medium text-muted">
											{field.label}
										</span>
										{field.multiline ? (
											<textarea
												id={inputId}
												value={ruleDraft[field.key]}
												onChange={(event) =>
													updateRuleDraft(field.key, event.target.value)
												}
												className={`${className} min-h-24 py-2`}
												placeholder={field.placeholder}
											/>
										) : (
											<input
												id={inputId}
												value={ruleDraft[field.key]}
												onChange={(event) =>
													updateRuleDraft(field.key, event.target.value)
												}
												className={`${className} h-11`}
												placeholder={field.placeholder}
											/>
										)}
									</label>
								);
							})}

							{ruleFormError && (
								<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 sm:col-span-2">
									{ruleFormError}
								</div>
							)}
						</div>

						<div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
							<button
								type="button"
								onClick={() => setRuleEditorOpen(false)}
								className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								Cancel
							</button>
							<button
								type="submit"
								className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
							>
								{editingRuleId ? <Pencil size={16} /> : <Plus size={16} />}
								{editingRuleId ? "Save rule" : "Add rule"}
							</button>
						</div>
					</form>
				</div>
			)}
		</div>
	);
}
