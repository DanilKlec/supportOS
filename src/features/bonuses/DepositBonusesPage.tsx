import {
	Copy,
	FileSpreadsheet,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	X,
} from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

import type {
	BonusProject,
	DepositBonus,
	DepositBonusTranslation,
} from "@/entities/bonus";
import { BONUS_PROJECT_ALIASES } from "@/entities/bonus/project-aliases";
import { bonusCurrencyRegistryService } from "@/services/bonus-currency-registry.service";
import {
	type CurrencyRates,
	currencyService,
} from "@/services/currency.service";
import {
	type DepositBonusImportMode,
	type DepositBonusImportPreview,
	depositBonusImportService,
} from "@/services/deposit-bonus-import.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useBonusStore } from "@/store/bonus.store";

interface BonusDraft {
	name: string;
	minDepositAmount: string;
	minDepositCurrency: string;
	contents: Record<string, string>;
}

const DEFAULT_BONUS_LANGUAGE = "ru";

const BONUS_LANGUAGES = [
	{ code: "ru", label: "RU" },
	{ code: "en", label: "EN" },
	{ code: "de", label: "DE" },
	{ code: "pt", label: "PT" },
	{ code: "el", label: "GR" },
];

const EMPTY_DRAFT_CONTENT = { [DEFAULT_BONUS_LANGUAGE]: "" };

function createEmptyBonusDraft(currency = "USD"): BonusDraft {
	return {
		name: "",
		minDepositAmount: "",
		minDepositCurrency: currency,
		contents: { ...EMPTY_DRAFT_CONTENT },
	};
}

function isEmptyBonusDraft(draft: BonusDraft) {
	return (
		!draft.name.trim() &&
		!draft.minDepositAmount.trim() &&
		Object.values(draft.contents).every((content) => !content.trim())
	);
}

const FALLBACK_CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"RUB",
	"UAH",
	"TRY",
	"BRL",
	"CAD",
	"AUD",
	"PLN",
	"RON",
	"KZT",
];

function normalizeSearchText(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0451/g, "\u0435")
		.replace(/[^a-z0-9\u0430-\u044f\u0370-\u03ff]+/g, " ")
		.trim();
}

function getSearchTokens(value: string) {
	return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function matchesTokens(value: string, tokens: string[]) {
	if (tokens.length === 0) return true;

	const haystack = normalizeSearchText(value);

	return tokens.every((token) => haystack.includes(token));
}

function getProjectAliases(project: BonusProject) {
	const directAliases = BONUS_PROJECT_ALIASES[project.name.toUpperCase()] ?? [];
	const slugAliases = BONUS_PROJECT_ALIASES[project.slug.toUpperCase()] ?? [];

	return Array.from(new Set([...directAliases, ...slugAliases]));
}

function buildBonusSearchText(bonus: DepositBonus) {
	return [
		bonus.name,
		bonus.content,
		bonus.minDepositAmount?.toString() ?? "",
		bonus.minDepositCurrency ?? "",
		...getBonusTranslations(bonus).flatMap((translation) => [
			translation.language,
			translation.content,
		]),
	].join(" ");
}

function buildProjectSearchText(project: BonusProject) {
	return [
		project.name,
		project.slug,
		project.sheetId ?? "",
		...getProjectAliases(project),
	].join(" ");
}

function getConvertedDeposit(
	bonus: DepositBonus,
	selectedCurrency: string,
	rates?: CurrencyRates,
) {
	if (!bonus.minDepositAmount || !bonus.minDepositCurrency || !rates) {
		return undefined;
	}

	return currencyService.convert({
		amount: bonus.minDepositAmount,
		from: bonus.minDepositCurrency,
		to: selectedCurrency,
		rates,
	});
}

function formatDeposit(
	bonus: DepositBonus,
	selectedCurrency: string,
	rates?: CurrencyRates,
) {
	if (!bonus.minDepositAmount || !bonus.minDepositCurrency) {
		return "Min deposit: not specified";
	}

	const original = currencyService.format(
		bonus.minDepositAmount,
		bonus.minDepositCurrency,
	);
	const converted = getConvertedDeposit(bonus, selectedCurrency, rates);

	if (
		!converted ||
		bonus.minDepositCurrency.toUpperCase() === selectedCurrency.toUpperCase()
	) {
		return `Min deposit: ${original}`;
	}

	return `Min deposit: ${original} (~${currencyService.format(
		converted,
		selectedCurrency,
	)})`;
}

function getLanguageLabel(language: string) {
	return (
		BONUS_LANGUAGES.find((item) => item.code === language)?.label ??
		language.toUpperCase()
	);
}

function getBonusTranslations(bonus: DepositBonus): DepositBonusTranslation[] {
	const translations = bonus.translations?.filter((item) =>
		item.content?.trim(),
	);
	const content = bonus.content ?? "";

	if (translations?.length) return translations;

	return content.trim()
		? [
				{
					language: DEFAULT_BONUS_LANGUAGE,
					content,
					updatedAt: new Date().toISOString(),
				},
			]
		: [];
}

function getBonusContent(bonus: DepositBonus, language: string) {
	const translations = getBonusTranslations(bonus);

	return (
		translations.find((translation) => translation.language === language)
			?.content ??
		translations.find(
			(translation) => translation.language === DEFAULT_BONUS_LANGUAGE,
		)?.content ??
		translations.find((translation) => translation.language === "en")
			?.content ??
		translations[0]?.content ??
		bonus.content ??
		""
	);
}

function getBonusContentMap(bonus: DepositBonus) {
	const contentMap: Record<string, string> = {};

	for (const translation of getBonusTranslations(bonus)) {
		contentMap[translation.language] = translation.content;
	}

	if (!contentMap[DEFAULT_BONUS_LANGUAGE] && bonus.content?.trim()) {
		contentMap[DEFAULT_BONUS_LANGUAGE] = bonus.content;
	}

	return contentMap;
}

function getDraftContent(draft: BonusDraft, language: string) {
	return draft.contents[language] ?? "";
}

function setDraftLanguageContent(
	draft: BonusDraft,
	language: string,
	content: string,
): BonusDraft {
	return {
		...draft,
		contents: {
			...draft.contents,
			[language]: content,
		},
	};
}

function buildDraftTranslations(draft: BonusDraft): DepositBonusTranslation[] {
	const updatedAt = new Date().toISOString();

	return Object.entries(draft.contents)
		.map(([language, content]) => ({
			language,
			content: content.trim(),
			updatedAt,
		}))
		.filter((translation) => translation.content);
}

function pickPrimaryDraftContent(draft: BonusDraft, language: string) {
	const translations = buildDraftTranslations(draft);

	return (
		translations.find((translation) => translation.language === language)
			?.content ??
		translations.find(
			(translation) => translation.language === DEFAULT_BONUS_LANGUAGE,
		)?.content ??
		translations.find((translation) => translation.language === "en")
			?.content ??
		translations[0]?.content ??
		""
	);
}

function getDisplayBonusContent({
	bonus,
	project,
	language,
	selectedCurrency,
}: {
	bonus: DepositBonus;
	project?: BonusProject;
	language: string;
	selectedCurrency: string;
}) {
	return bonusCurrencyRegistryService.replaceProjectMoneyText({
		text: getBonusContent(bonus, language),
		project,
		targetCurrency: selectedCurrency,
	});
}

function buildBonusBind({
	bonus,
	project,
	language,
	selectedCurrency,
}: {
	bonus: DepositBonus;
	project?: BonusProject;
	language: string;
	selectedCurrency: string;
}) {
	return getDisplayBonusContent({
		bonus,
		project,
		language,
		selectedCurrency,
	}).trim();
}

function buildPackageBind({
	project,
	language,
	selectedCurrency,
	rates,
}: {
	project: BonusProject;
	language: string;
	selectedCurrency: string;
	rates?: CurrencyRates;
}) {
	return [
		`${project.name} welcome package`,
		"",
		...project.bonuses.flatMap((bonus, index) => [
			`${index + 1}. ${bonus.name}`,
			formatDeposit(bonus, selectedCurrency, rates),
			getDisplayBonusContent({
				bonus,
				project,
				language,
				selectedCurrency,
			}),
			"",
		]),
	]
		.join("\n")
		.trim();
}

function parseAmount(value: string) {
	const normalized = value.trim().replace(",", ".");

	if (!normalized) return undefined;

	const amount = Number(normalized);

	return Number.isFinite(amount) ? amount : undefined;
}

function toDraft(bonus: DepositBonus): BonusDraft {
	return {
		name: bonus.name,
		minDepositAmount: bonus.minDepositAmount?.toString() ?? "",
		minDepositCurrency: bonus.minDepositCurrency ?? "USD",
		contents: getBonusContentMap(bonus),
	};
}

export function DepositBonusesPage() {
	const { showToast } = useToast();
	const projects = useBonusStore((state) => state.projects);
	const activeProjectId = useBonusStore((state) => state.activeProjectId);
	const selectedCurrency = useBonusStore((state) => state.selectedCurrency);
	const selectedLanguage = useBonusStore((state) => state.depositBonusLanguage);
	const query = useBonusStore((state) => state.depositBonusQuery);
	const addProject = useBonusStore((state) => state.addProject);
	const renameProject = useBonusStore((state) => state.renameProject);
	const upsertProjects = useBonusStore((state) => state.upsertProjects);
	const replaceProjects = useBonusStore((state) => state.replaceProjects);
	const removeProject = useBonusStore((state) => state.removeProject);
	const setActiveProject = useBonusStore((state) => state.setActiveProject);
	const addBonus = useBonusStore((state) => state.addBonus);
	const updateBonus = useBonusStore((state) => state.updateBonus);
	const removeBonus = useBonusStore((state) => state.removeBonus);
	const setSelectedCurrency = useBonusStore(
		(state) => state.setSelectedCurrency,
	);
	const setSelectedLanguage = useBonusStore(
		(state) => state.setDepositBonusLanguage,
	);
	const setQuery = useBonusStore((state) => state.setDepositBonusQuery);
	const [newProjectName, setNewProjectName] = useState("");
	const [renameValue, setRenameValue] = useState("");
	const [bonusDraft, setBonusDraft] = useState<BonusDraft>(() =>
		createEmptyBonusDraft(),
	);
	const [editingBonusId, setEditingBonusId] = useState<string>();
	const [formError, setFormError] = useState("");
	const [sheetUrl, setSheetUrl] = useState("");
	const [mode, setMode] = useState<DepositBonusImportMode>("upsert");
	const [preview, setPreview] = useState<DepositBonusImportPreview>();
	const [importing, setImporting] = useState(false);
	const [committing, setCommitting] = useState(false);
	const [rates, setRates] = useState<CurrencyRates>();
	const [ratesLoading, setRatesLoading] = useState(false);
	const [ratesError, setRatesError] = useState("");

	const rateCurrencies = useMemo(() => {
		const values = new Set([
			...FALLBACK_CURRENCIES,
			...(rates ? Object.keys(rates.rates) : []),
		]);

		return Array.from(values).sort();
	}, [rates]);
	const searchTokens = useMemo(() => getSearchTokens(query), [query]);
	const filteredProjects = useMemo(() => {
		if (searchTokens.length === 0) return projects;

		return projects.filter((project) => {
			if (matchesTokens(buildProjectSearchText(project), searchTokens)) {
				return true;
			}

			return project.bonuses.some((bonus) =>
				matchesTokens(buildBonusSearchText(bonus), searchTokens),
			);
		});
	}, [projects, searchTokens]);
	const activeProject =
		filteredProjects.find((project) => project.id === activeProjectId) ??
		filteredProjects[0] ??
		projects.find((project) => project.id === activeProjectId) ??
		projects[0];
	const activeCurrencyContext = useMemo(
		() => bonusCurrencyRegistryService.getProjectContext(activeProject),
		[activeProject],
	);
	const defaultBonusCurrency =
		bonusCurrencyRegistryService.getDefaultCurrency(activeProject) ??
		selectedCurrency ??
		"USD";
	const currencies = useMemo(
		() =>
			bonusCurrencyRegistryService.getCurrencyOptions({
				project: activeProject,
				fallback: rateCurrencies,
			}),
		[activeProject, rateCurrencies],
	);
	const editingBonus = activeProject?.bonuses.find(
		(bonus) => bonus.id === editingBonusId,
	);
	const activeProjectMatchesSearch = activeProject
		? matchesTokens(buildProjectSearchText(activeProject), searchTokens)
		: false;
	const visibleBonuses = useMemo(() => {
		if (!activeProject) return [];
		if (searchTokens.length === 0 || activeProjectMatchesSearch) {
			return activeProject.bonuses;
		}

		return activeProject.bonuses.filter((bonus) =>
			matchesTokens(buildBonusSearchText(bonus), searchTokens),
		);
	}, [activeProject, activeProjectMatchesSearch, searchTokens]);

	const loadRates = useCallback(
		async (force: boolean) => {
			setRatesLoading(true);
			setRatesError("");

			try {
				const nextRates = await currencyService.getRates({ force });

				setRates(nextRates);
				if (force) {
					showToast("Currency rates updated");
				}
			} catch (error) {
				setRatesError(
					error instanceof Error
						? error.message
						: "Unable to load currency rates",
				);
			} finally {
				setRatesLoading(false);
			}
		},
		[showToast],
	);

	useEffect(() => {
		void loadRates(false);
	}, [loadRates]);

	useEffect(() => {
		if (activeProject && activeProject.id !== activeProjectId) {
			setActiveProject(activeProject.id);
		}
	}, [activeProject, activeProjectId, setActiveProject]);

	useEffect(() => {
		setRenameValue(activeProject?.name ?? "");
	}, [activeProject?.name]);

	useEffect(() => {
		if (editingBonusId) return;

		setBonusDraft((current) => {
			if (!isEmptyBonusDraft(current)) return current;
			if (current.minDepositCurrency === defaultBonusCurrency) return current;

			return createEmptyBonusDraft(defaultBonusCurrency);
		});
	}, [defaultBonusCurrency, editingBonusId]);

	const loadPreview = async () => {
		setImporting(true);

		try {
			const nextPreview = await depositBonusImportService.preview(sheetUrl);

			setPreview(nextPreview);
			showToast("Preview loaded");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Import failed");
		} finally {
			setImporting(false);
		}
	};

	const commitPreview = () => {
		if (!preview || preview.projects.length === 0) return;

		setCommitting(true);

		try {
			if (mode === "replace") {
				replaceProjects(preview.projects);
			} else {
				upsertProjects(preview.projects);
			}

			showToast(`Imported and saved ${preview.projects.length} project sheets`);
			setPreview(undefined);
		} finally {
			setCommitting(false);
		}
	};

	const createProject = (event: FormEvent) => {
		event.preventDefault();
		const project = addProject(newProjectName);

		if (!project) {
			showToast("Project name is required");
			return;
		}

		setNewProjectName("");
		showToast("Project sheet added");
	};

	const saveProjectName = () => {
		if (!activeProject) return;

		renameProject(activeProject.id, renameValue);
		showToast("Project name saved");
	};

	const resetBonusForm = () => {
		setBonusDraft(createEmptyBonusDraft(defaultBonusCurrency));
		setEditingBonusId(undefined);
		setFormError("");
	};

	const submitBonus = (event: FormEvent) => {
		event.preventDefault();
		setFormError("");

		if (!activeProject) {
			setFormError("Create a project sheet first");
			return;
		}

		const name = bonusDraft.name.trim();
		const translations = buildDraftTranslations(bonusDraft);
		const content = pickPrimaryDraftContent(bonusDraft, selectedLanguage);

		if (!name) {
			setFormError("Bonus name is required");
			return;
		}

		if (translations.length === 0) {
			setFormError("Add bonus content for at least one language");
			return;
		}

		const amount = parseAmount(bonusDraft.minDepositAmount);
		const currency =
			bonusDraft.minDepositCurrency.trim().toUpperCase() || "USD";

		if (editingBonus) {
			updateBonus(activeProject.id, editingBonus.id, {
				name,
				content,
				translations,
				minDepositAmount: amount,
				minDepositCurrency: currency,
			});
			showToast("Bonus saved");
		} else {
			addBonus(activeProject.id, {
				name,
				content,
				translations,
				minDepositAmount: amount,
				minDepositCurrency: currency,
			});
			showToast("Bonus added");
		}

		resetBonusForm();
	};

	const editBonus = (bonus: DepositBonus) => {
		setEditingBonusId(bonus.id);
		setBonusDraft(toDraft(bonus));
		setFormError("");
	};

	const copyBonus = async (bonus: DepositBonus) => {
		const copied = await copyToClipboard(
			buildBonusBind({
				bonus,
				project: activeProject,
				language: selectedLanguage,
				selectedCurrency,
			}),
		);

		showToast(copied ? "Bonus bind copied" : "Copy failed");
	};

	const copyPackage = async (project: BonusProject) => {
		const copied = await copyToClipboard(
			buildPackageBind({
				project,
				language: selectedLanguage,
				selectedCurrency,
				rates,
			}),
		);

		showToast(copied ? "Package bind copied" : "Copy failed");
	};

	return (
		<div className="flex h-full flex-col overflow-auto bg-background">
			<datalist id="deposit-bonus-currencies">
				{currencies.map((currency) => (
					<option key={currency} value={currency} />
				))}
			</datalist>

			<div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold">Deposit Bonuses</h1>
						<p className="mt-1 text-sm text-muted">
							Project sheets with welcome package bonuses, minimum deposits,
							currency equivalents, and ready-to-copy binds.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<div className="flex rounded-md border border-border bg-surface p-1">
							{BONUS_LANGUAGES.map((language) => (
								<button
									key={language.code}
									type="button"
									onClick={() => setSelectedLanguage(language.code)}
									className={`h-8 rounded px-3 text-xs font-semibold transition ${
										selectedLanguage === language.code
											? "bg-accent text-accent-foreground"
											: "text-muted hover:bg-surface-elevated hover:text-foreground"
									}`}
								>
									{language.label}
								</button>
							))}
						</div>

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

						<button
							type="button"
							onClick={() => void loadRates(true)}
							disabled={ratesLoading}
							className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							{ratesLoading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<RefreshCw size={16} />
							)}
							Rates
						</button>
					</div>
				</div>

				{ratesError && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
						{ratesError}
					</div>
				)}

				{rates && (
					<div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
						Rates source: {rates.source}. Date: {rates.date}. Base: {rates.base}
						.
					</div>
				)}

				{activeCurrencyContext && (
					<div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
						Currency registry: {activeCurrencyContext.rule.site} -{" "}
						{activeCurrencyContext.table.name}. Text amounts in EUR are copied
						as {selectedCurrency} when a matching row exists.
					</div>
				)}

				<div className="rounded-lg border border-border bg-surface p-4">
					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<FileSpreadsheet size={16} />
						Google Sheets Import
					</div>

					<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
						<textarea
							value={sheetUrl}
							onChange={(event) => setSheetUrl(event.target.value)}
							className="min-h-10 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="Paste one Google Spreadsheet URL. Each tab/sheet becomes one project. You can also paste several sheet URLs, one per line."
						/>

						<select
							value={mode}
							onChange={(event) =>
								setMode(event.target.value as DepositBonusImportMode)
							}
							className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
						>
							<option value="upsert">Upsert</option>
							<option value="replace">Replace all project sheets</option>
						</select>

						<button
							type="button"
							onClick={loadPreview}
							disabled={importing || !sheetUrl.trim()}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{importing ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<FileSpreadsheet size={16} />
							)}
							Preview
						</button>
					</div>

					{preview && (
						<div className="mt-4 rounded-md border border-border bg-background p-3">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="text-sm">
									<span className="font-semibold">
										{preview.projects.length}
									</span>{" "}
									project sheets found
								</div>

								<button
									type="button"
									onClick={commitPreview}
									disabled={
										committing ||
										preview.projects.length === 0 ||
										preview.errors.length > 0
									}
									className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{committing && <Loader2 size={15} className="animate-spin" />}
									Commit Import
								</button>
							</div>

							{preview.projects.length > 0 && (
								<div className="mt-3 flex flex-wrap gap-2">
									{preview.projects.map((project) => {
										const languages = Array.from(
											new Set(
												project.bonuses.flatMap((bonus) =>
													getBonusTranslations(bonus).map((translation) =>
														getLanguageLabel(translation.language),
													),
												),
											),
										).join(", ");

										return (
											<span
												key={`${project.slug}-${project.sheetId ?? "sheet"}`}
												className="rounded-md border border-border px-2 py-1 text-xs text-muted"
											>
												{project.name}: {project.bonuses.length}
												{languages ? ` (${languages})` : ""}
											</span>
										);
									})}
								</div>
							)}

							{preview.errors.length > 0 && (
								<div className="mt-3 space-y-1 text-sm text-red-300">
									{preview.errors.map((error) => (
										<div key={error}>{error}</div>
									))}
								</div>
							)}

							{preview.warnings.length > 0 && (
								<div className="mt-3 max-h-24 overflow-auto text-xs text-amber-200">
									{preview.warnings.slice(0, 12).map((warning) => (
										<div key={warning}>{warning}</div>
									))}
								</div>
							)}
						</div>
					)}
				</div>

				<div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
					<div className="space-y-4">
						<form
							onSubmit={createProject}
							className="rounded-lg border border-border bg-surface p-4"
						>
							<div className="mb-3 text-sm font-semibold">Project Sheets</div>
							<div className="flex gap-2">
								<input
									value={newProjectName}
									onChange={(event) => setNewProjectName(event.target.value)}
									className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Project name"
								/>
								<button
									type="submit"
									className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
								>
									<Plus size={16} />
									Add
								</button>
							</div>
						</form>

						<div className="relative">
							<Search
								size={16}
								className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
							/>
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								className="h-10 w-full rounded-md border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								placeholder="Search sheets or bonuses..."
							/>
						</div>

						<div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-3">
							{filteredProjects.length > 0 ? (
								filteredProjects.map((project) => {
									const active = project.id === activeProject?.id;

									return (
										<button
											key={project.id}
											type="button"
											onClick={() => setActiveProject(project.id)}
											className={`min-w-0 rounded-md border px-3 py-2 text-left text-sm transition ${
												active
													? "border-accent bg-accent/10 text-foreground"
													: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
											}`}
										>
											<div className="max-w-48 truncate font-medium">
												{project.name}
											</div>
											<div className="mt-1 text-xs text-muted">
												{searchTokens.length > 0 &&
												!matchesTokens(
													buildProjectSearchText(project),
													searchTokens,
												)
													? project.bonuses.filter((bonus) =>
															matchesTokens(
																buildBonusSearchText(bonus),
																searchTokens,
															),
														).length
													: project.bonuses.length}{" "}
												bonuses
											</div>
										</button>
									);
								})
							) : (
								<div className="px-2 py-6 text-sm text-muted">
									No project sheets yet
								</div>
							)}
						</div>
					</div>

					{activeProject ? (
						<div className="space-y-4">
							<section className="rounded-lg border border-border bg-surface">
								<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
									<div className="min-w-0 flex-1">
										<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
											Active sheet
										</div>
										<div className="flex max-w-xl gap-2">
											<input
												value={renameValue}
												onChange={(event) => setRenameValue(event.target.value)}
												className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
											/>
											<button
												type="button"
												onClick={saveProjectName}
												className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
											>
												<Pencil size={15} />
												Save
											</button>
										</div>
									</div>

									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => void copyPackage(activeProject)}
											className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
										>
											<Copy size={15} />
											Copy Package
										</button>

										<button
											type="button"
											onClick={() => removeProject(activeProject.id)}
											className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-red-400"
											title="Delete project sheet"
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>

								<form onSubmit={submitBonus} className="space-y-3 p-4">
									<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_7rem]">
										<input
											value={bonusDraft.name}
											onChange={(event) =>
												setBonusDraft((current) => ({
													...current,
													name: event.target.value,
												}))
											}
											className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
											placeholder="Bonus name"
										/>
										<input
											value={bonusDraft.minDepositAmount}
											onChange={(event) =>
												setBonusDraft((current) => ({
													...current,
													minDepositAmount: event.target.value,
												}))
											}
											className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
											placeholder="Min dep."
										/>
										<input
											value={bonusDraft.minDepositCurrency}
											list="deposit-bonus-currencies"
											onChange={(event) =>
												setBonusDraft((current) => ({
													...current,
													minDepositCurrency: event.target.value,
												}))
											}
											className="h-10 rounded-md border border-border bg-background px-3 text-sm uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
											placeholder="USD"
										/>
									</div>

									<textarea
										value={getDraftContent(bonusDraft, selectedLanguage)}
										onChange={(event) =>
											setBonusDraft((current) =>
												setDraftLanguageContent(
													current,
													selectedLanguage,
													event.target.value,
												),
											)
										}
										className="min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
										placeholder={`Bonus content / ready bind text (${getLanguageLabel(
											selectedLanguage,
										)})`}
									/>

									{formError && (
										<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
											{formError}
										</div>
									)}

									<div className="flex flex-wrap justify-end gap-2">
										{editingBonusId && (
											<button
												type="button"
												onClick={resetBonusForm}
												className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
											>
												<X size={15} />
												Cancel
											</button>
										)}
										<button
											type="submit"
											className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
										>
											<Plus size={16} />
											{editingBonusId ? "Save Bonus" : "Add Bonus"}
										</button>
									</div>
								</form>
							</section>

							<section className="rounded-lg border border-border bg-surface">
								<div className="border-b border-border px-4 py-3">
									<div className="font-semibold">{activeProject.name}</div>
									<div className="mt-1 text-xs text-muted">
										{visibleBonuses.length}
										{visibleBonuses.length !== activeProject.bonuses.length
											? ` of ${activeProject.bonuses.length}`
											: ""}{" "}
										bonuses
									</div>
								</div>

								<div className="divide-y divide-border">
									{visibleBonuses.length > 0 ? (
										visibleBonuses
											.slice()
											.sort((first, second) => first.order - second.order)
											.map((bonus) => {
												const content = getDisplayBonusContent({
													bonus,
													project: activeProject,
													language: selectedLanguage,
													selectedCurrency,
												});
												const languages = getBonusTranslations(bonus).map(
													(translation) => translation.language,
												);

												return (
													<div
														key={bonus.id}
														className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_auto]"
													>
														<div>
															<div className="text-sm font-medium">
																{bonus.name}
															</div>
															<div className="mt-1 text-xs text-muted">
																{formatDeposit(bonus, selectedCurrency, rates)}
															</div>
															{languages.map((language) => (
																<button
																	key={language}
																	type="button"
																	onClick={() => setSelectedLanguage(language)}
																	title={`Switch to ${getLanguageLabel(language)}`}
																	className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold transition ${
																		selectedLanguage === language
																			? "border-accent bg-accent/10 text-foreground"
																			: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
																	}`}
																>
																	{getLanguageLabel(language)}
																</button>
															))}
														</div>

														<div className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-muted">
															{content}
														</div>

														<div className="flex items-start gap-2">
															<button
																type="button"
																onClick={() => void copyBonus(bonus)}
																className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
															>
																<Copy size={15} />
																Copy
															</button>
															<button
																type="button"
																onClick={() => editBonus(bonus)}
																className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-foreground"
																title="Edit bonus"
															>
																<Pencil size={15} />
															</button>
															<button
																type="button"
																onClick={() =>
																	removeBonus(activeProject.id, bonus.id)
																}
																className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-red-400"
																title="Delete bonus"
															>
																<Trash2 size={15} />
															</button>
														</div>
													</div>
												);
											})
									) : (
										<div className="px-4 py-12 text-center text-sm text-muted">
											{searchTokens.length > 0
												? "No bonuses match this search"
												: "This project sheet has no bonuses yet"}
										</div>
									)}
								</div>
							</section>
						</div>
					) : (
						<div className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-sm text-muted">
							Add a project sheet to start collecting bonuses
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
