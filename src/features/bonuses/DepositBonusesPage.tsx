import {
	CheckCircle2,
	Copy,
	FileSpreadsheet,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
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

function formatCurrencyGroupLabel(name: string, currencies: string[]) {
	const visibleCurrencies = currencies.slice(0, 5).join(", ");

	return visibleCurrencies ? `${name} (${visibleCurrencies})` : name;
}

function getCurrencyGroupShortName(name: string) {
	return name.replace(/^Currency\s*/i, "");
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

function getSearchWords(value: string) {
	return getSearchTokens(value);
}

function getCompactSearchText(value: string) {
	return getSearchWords(value).join("");
}

function getInitials(value: string) {
	return getSearchWords(value)
		.map((word) => word[0])
		.filter(Boolean)
		.join("");
}

function matchesToken(value: string, token: string) {
	const words = getSearchWords(value);

	if (token.length <= 2) {
		const compact = words.join("");

		return (
			words.includes(token) ||
			compact === token ||
			words.some((word) => word.length <= 4 && word.startsWith(token))
		);
	}

	return normalizeSearchText(value).includes(token);
}

function matchesTokens(value: string, tokens: string[]) {
	if (tokens.length === 0) return true;

	return tokens.every((token) => matchesToken(value, token));
}

function getProjectAliases(project: BonusProject) {
	const directAliases = BONUS_PROJECT_ALIASES[project.name.toUpperCase()] ?? [];
	const slugAliases = BONUS_PROJECT_ALIASES[project.slug.toUpperCase()] ?? [];
	const compactName = getCompactSearchText(project.name);
	const compactSlug = getCompactSearchText(project.slug);
	const reverseAliases = Object.entries(BONUS_PROJECT_ALIASES)
		.filter(([, aliases]) =>
			aliases.some((alias) => {
				const compactAlias = getCompactSearchText(alias);

				return compactAlias === compactName || compactAlias === compactSlug;
			}),
		)
		.map(([alias]) => alias.toLowerCase());

	return Array.from(
		new Set(
			[
				...directAliases,
				...slugAliases,
				...reverseAliases,
				getInitials(project.name),
			].filter(Boolean),
		),
	);
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

function getProjectSearchScore(project: BonusProject, tokens: string[]) {
	if (tokens.length === 0) return 0;

	const projectText = buildProjectSearchText(project);
	const projectWords = new Set(getSearchWords(projectText));
	const projectMatches = matchesTokens(projectText, tokens);
	const bonusMatches = project.bonuses.some((bonus) =>
		matchesTokens(buildBonusSearchText(bonus), tokens),
	);

	if (!projectMatches && !bonusMatches) return -1;

	return tokens.reduce((score, token) => {
		if (projectWords.has(token)) return score + 120;
		if (
			Array.from(projectWords).some(
				(word) => word.length <= 4 && word.startsWith(token),
			)
		) {
			return score + 80;
		}
		if (matchesToken(projectText, token)) return score + 40;

		return score + 8;
	}, 0);
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
	currencyTableName,
}: {
	bonus: DepositBonus;
	project?: BonusProject;
	language: string;
	selectedCurrency: string;
	currencyTableName?: string;
}) {
	return bonusCurrencyRegistryService.replaceProjectMoneyText({
		text: getBonusContent(bonus, language),
		project,
		targetCurrency: selectedCurrency,
		tableName: currencyTableName,
	});
}

function buildBonusBind({
	bonus,
	project,
	language,
	selectedCurrency,
	currencyTableName,
}: {
	bonus: DepositBonus;
	project?: BonusProject;
	language: string;
	selectedCurrency: string;
	currencyTableName?: string;
}) {
	return getDisplayBonusContent({
		bonus,
		project,
		language,
		selectedCurrency,
		currencyTableName,
	}).trim();
}

function buildPackageBind({
	project,
	language,
	selectedCurrency,
	rates,
	currencyTableName,
}: {
	project: BonusProject;
	language: string;
	selectedCurrency: string;
	rates?: CurrencyRates;
	currencyTableName?: string;
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
				currencyTableName,
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
	const projectCurrencyGroups = useBonusStore(
		(state) => state.projectCurrencyGroups,
	);
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
	const setProjectCurrencyGroup = useBonusStore(
		(state) => state.setProjectCurrencyGroup,
	);
	const [newProjectName, setNewProjectName] = useState("");
	const [newProjectCurrencyGroup, setNewProjectCurrencyGroup] = useState("");
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
	const [importOpen, setImportOpen] = useState(false);
	const [deleteProjectId, setDeleteProjectId] = useState<string>();
	const [deleteBonusId, setDeleteBonusId] = useState<string>();

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

		return projects
			.map((project) => ({
				project,
				score: getProjectSearchScore(project, searchTokens),
			}))
			.filter((item) => item.score >= 0)
			.sort((first, second) => {
				if (second.score !== first.score) return second.score - first.score;

				return first.project.name.localeCompare(second.project.name);
			})
			.map((item) => item.project);
	}, [projects, searchTokens]);
	const activeProject =
		filteredProjects.find((project) => project.id === activeProjectId) ??
		filteredProjects[0] ??
		projects.find((project) => project.id === activeProjectId) ??
		projects[0];
	const activeProjectCurrencyGroup = activeProject
		? (projectCurrencyGroups[activeProject.id] ?? "")
		: "";
	const currencyGroupOptions = useMemo(
		() => bonusCurrencyRegistryService.getCurrencyGroupOptions(),
		[],
	);
	const activeCurrencyContext = useMemo(
		() =>
			bonusCurrencyRegistryService.getProjectContext(
				activeProject,
				undefined,
				activeProjectCurrencyGroup,
			),
		[activeProject, activeProjectCurrencyGroup],
	);
	const defaultBonusCurrency =
		bonusCurrencyRegistryService.getDefaultCurrency(
			activeProject,
			undefined,
			activeProjectCurrencyGroup,
		) ??
		selectedCurrency ??
		"USD";
	const currencies = useMemo(
		() =>
			bonusCurrencyRegistryService.getCurrencyOptions({
				project: activeProject,
				tableName: activeProjectCurrencyGroup,
				fallback: rateCurrencies,
			}),
		[activeProject, activeProjectCurrencyGroup, rateCurrencies],
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
	const totalBonuses = useMemo(
		() =>
			projects.reduce((total, project) => total + project.bonuses.length, 0),
		[projects],
	);
	const deleteProjectTarget = projects.find(
		(project) => project.id === deleteProjectId,
	);
	const deleteBonusTarget = activeProject?.bonuses.find(
		(bonus) => bonus.id === deleteBonusId,
	);

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
			setSheetUrl("");
			setImportOpen(false);
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

		if (newProjectCurrencyGroup) {
			setProjectCurrencyGroup(project.id, newProjectCurrencyGroup);
			const nextCurrency = bonusCurrencyRegistryService.getDefaultCurrency(
				project,
				undefined,
				newProjectCurrencyGroup,
			);

			if (nextCurrency) {
				setSelectedCurrency(nextCurrency);
			}
		}

		setNewProjectName("");
		setNewProjectCurrencyGroup("");
		showToast(
			newProjectCurrencyGroup
				? "Project sheet added to currency group"
				: "Project sheet added",
		);
	};

	const saveProjectName = () => {
		if (!activeProject) return;

		renameProject(activeProject.id, renameValue);
		showToast("Project name saved");
	};

	const updateActiveProjectCurrencyGroup = (tableName: string) => {
		if (!activeProject) return;

		setProjectCurrencyGroup(activeProject.id, tableName);

		const nextCurrency = bonusCurrencyRegistryService.getDefaultCurrency(
			activeProject,
			undefined,
			tableName,
		);

		if (nextCurrency) {
			setSelectedCurrency(nextCurrency);
		}

		showToast(
			tableName
				? "Currency group saved for project"
				: "Automatic currency group enabled",
		);
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
				currencyTableName: activeProjectCurrencyGroup,
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
				currencyTableName: projectCurrencyGroups[project.id] ?? "",
			}),
		);

		showToast(copied ? "Package bind copied" : "Copy failed");
	};

	const confirmDeleteProject = () => {
		if (!deleteProjectTarget) return;

		removeProject(deleteProjectTarget.id);
		setDeleteProjectId(undefined);
		showToast("Project sheet deleted");
	};

	const confirmDeleteBonus = () => {
		if (!activeProject || !deleteBonusTarget) return;

		removeBonus(activeProject.id, deleteBonusTarget.id);
		setDeleteBonusId(undefined);
		showToast("Bonus deleted");
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<datalist id="deposit-bonus-currencies">
				{currencies.map((currency) => (
					<option key={currency} value={currency} />
				))}
			</datalist>

			<div className="supportos-scroll mx-auto flex h-full w-full max-w-7xl flex-col gap-4 overflow-auto p-4 sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="text-xs font-semibold uppercase text-muted">
							Fast bonus library
						</div>
						<h1 className="mt-1 text-xl font-semibold sm:text-2xl">
							Deposit Bonuses
						</h1>
						<p className="mt-1 text-sm text-muted">
							{projects.length} projects / {totalBonuses} bonuses ready to copy.
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
							className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							{ratesLoading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<RefreshCw size={16} />
							)}
							Rates
						</button>

						<button
							type="button"
							onClick={() => setImportOpen((current) => !current)}
							className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<Upload size={16} />
							Import
						</button>

						{activeProject && (
							<button
								type="button"
								onClick={() => void copyPackage(activeProject)}
								className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
							>
								<Copy size={16} />
								Copy package
							</button>
						)}
					</div>
				</div>

				{ratesError && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
						{ratesError}
					</div>
				)}

				{rates && (
					<div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
						Rates source: {rates.source}. Date: {rates.date}. Base: {rates.base}
						.
					</div>
				)}

				{activeCurrencyContext && (
					<div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
						Currency group:{" "}
						{activeCurrencyContext.source === "manual" ? "Manual" : "Auto"} -{" "}
						{activeCurrencyContext.rule?.site ?? activeProject?.name} -{" "}
						{activeCurrencyContext.table.name}. Text amounts in EUR are copied
						as {selectedCurrency} when a matching row exists.
					</div>
				)}

				{importOpen && (
					<div className="rounded-xl border border-border bg-surface p-4">
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
							<div className="mt-4 rounded-lg bg-background p-3">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="inline-flex items-center gap-2 text-sm">
										<CheckCircle2 size={16} className="text-accent" />
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
										{committing && (
											<Loader2 size={15} className="animate-spin" />
										)}
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
				)}

				<div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
					<div className="space-y-3">
						<form
							onSubmit={createProject}
							className="min-w-0 rounded-xl border border-border bg-surface p-3"
						>
							<div className="mb-3 text-sm font-semibold">Project sheets</div>
							<div className="grid gap-2">
								<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
									<input
										value={newProjectName}
										onChange={(event) => setNewProjectName(event.target.value)}
										className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
										placeholder="Project name"
									/>
									<button
										type="submit"
										className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 sm:w-auto"
									>
										<Plus size={16} />
										Add
									</button>
								</div>
								<select
									value={newProjectCurrencyGroup}
									onChange={(event) =>
										setNewProjectCurrencyGroup(event.target.value)
									}
									className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									aria-label="Currency group for new project"
								>
									<option value="">Auto currency group</option>
									{currencyGroupOptions.map((group) => (
										<option key={group.name} value={group.name}>
											{formatCurrencyGroupLabel(group.name, group.currencies)}
										</option>
									))}
								</select>
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
								className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
								placeholder="Search sheets or bonuses..."
							/>
						</div>

						<div className="supportos-scroll max-h-[28rem] overflow-auto rounded-xl border border-border bg-surface">
							{filteredProjects.length > 0 ? (
								filteredProjects.map((project) => {
									const active = project.id === activeProject?.id;
									const currencyGroup = projectCurrencyGroups[project.id];
									const visibleCount =
										searchTokens.length > 0 &&
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
											: project.bonuses.length;

									return (
										<button
											key={project.id}
											type="button"
											onClick={() => setActiveProject(project.id)}
											className={`flex min-h-14 w-full min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-3 text-left text-sm transition last:border-b-0 ${
												active
													? "bg-accent/10 text-foreground"
													: "text-muted hover:bg-surface-elevated hover:text-foreground"
											}`}
										>
											<span className="min-w-0">
												<span className="block truncate font-medium">
													{project.name}
												</span>
												<span className="mt-0.5 block text-xs text-muted">
													{visibleCount} bonuses
													{currencyGroup
														? ` - ${getCurrencyGroupShortName(currencyGroup)}`
														: ""}
												</span>
											</span>
											<span className="shrink-0 rounded-md bg-background px-2 py-1 text-xs text-muted">
												{project.bonuses.length}
											</span>
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
							<section className="rounded-xl border border-border bg-surface">
								<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
									<div className="min-w-0 flex-1">
										<div className="mb-2 text-xs font-semibold uppercase text-muted">
											Active sheet
										</div>
										<div className="flex max-w-xl gap-2">
											<input
												value={renameValue}
												onChange={(event) => setRenameValue(event.target.value)}
												className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
											/>
											<button
												type="button"
												onClick={saveProjectName}
												className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
											>
												<Pencil size={15} />
												Save
											</button>
										</div>
										<div className="mt-3 grid max-w-xl gap-1">
											<label
												htmlFor="active-project-currency-group"
												className="text-xs font-medium text-muted"
											>
												Currency group
											</label>
											<select
												id="active-project-currency-group"
												value={activeProjectCurrencyGroup}
												onChange={(event) =>
													updateActiveProjectCurrencyGroup(event.target.value)
												}
												className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
											>
												<option value="">Auto detect by project name</option>
												{currencyGroupOptions.map((group) => (
													<option key={group.name} value={group.name}>
														{formatCurrencyGroupLabel(
															group.name,
															group.currencies,
														)}
													</option>
												))}
											</select>
											<div className="text-xs text-muted">
												{activeCurrencyContext
													? `${activeCurrencyContext.source === "manual" ? "Manual" : "Auto"} uses ${activeCurrencyContext.table.name}.`
													: "No currency table matched yet. Load Bonus Tools or choose a group manually."}
											</div>
										</div>
									</div>

									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => setDeleteProjectId(activeProject.id)}
											className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-red-400"
											title="Delete project sheet"
											aria-label="Delete project sheet"
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
											className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
											className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
											className="h-11 rounded-lg border border-border bg-background px-3 text-sm uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
										className="min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
												className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
											>
												<X size={15} />
												Cancel
											</button>
										)}
										<button
											type="submit"
											className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
										>
											<Plus size={16} />
											{editingBonusId ? "Save Bonus" : "Add Bonus"}
										</button>
									</div>
								</form>
							</section>

							<section className="rounded-xl border border-border bg-surface">
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
													currencyTableName: activeProjectCurrencyGroup,
												});
												const languages = getBonusTranslations(bonus).map(
													(translation) => translation.language,
												);

												return (
													<div
														key={bonus.id}
														className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_auto]"
													>
														<div>
															<div className="text-sm font-medium">
																{bonus.name}
															</div>
															<div className="mt-1 text-xs text-muted">
																{formatDeposit(bonus, selectedCurrency, rates)}
															</div>
															<div className="mt-2 flex flex-wrap gap-1">
																{languages.map((language) => (
																	<button
																		key={language}
																		type="button"
																		onClick={() =>
																			setSelectedLanguage(language)
																		}
																		title={`Switch to ${getLanguageLabel(language)}`}
																		className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition ${
																			selectedLanguage === language
																				? "border-accent bg-accent/10 text-foreground"
																				: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
																		}`}
																	>
																		{getLanguageLabel(language)}
																	</button>
																))}
															</div>
														</div>

														<div className="min-w-0 whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-sm leading-6 text-muted">
															{content}
														</div>

														<div className="flex items-start gap-2">
															<button
																type="button"
																onClick={() => void copyBonus(bonus)}
																className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
															>
																<Copy size={15} />
																Copy
															</button>
															<button
																type="button"
																onClick={() => editBonus(bonus)}
																className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-foreground"
																title="Edit bonus"
																aria-label="Edit bonus"
															>
																<Pencil size={15} />
															</button>
															<button
																type="button"
																onClick={() => setDeleteBonusId(bonus.id)}
																className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-red-400"
																title="Delete bonus"
																aria-label="Delete bonus"
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

			<ConfirmDialog
				open={Boolean(deleteProjectTarget)}
				title="Delete project sheet?"
				description={
					deleteProjectTarget
						? `${deleteProjectTarget.name} and its bonuses will be removed.`
						: ""
				}
				onCancel={() => setDeleteProjectId(undefined)}
				onConfirm={confirmDeleteProject}
			/>

			<ConfirmDialog
				open={Boolean(deleteBonusTarget)}
				title="Delete bonus?"
				description={
					deleteBonusTarget
						? `${deleteBonusTarget.name} will be removed from this project.`
						: ""
				}
				onCancel={() => setDeleteBonusId(undefined)}
				onConfirm={confirmDeleteBonus}
			/>
		</div>
	);
}

function ConfirmDialog({
	open,
	title,
	description,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	title: string;
	description: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	useEffect(() => {
		if (!open) return;

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onCancel();
		};

		document.addEventListener("keydown", closeOnEscape);

		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [onCancel, open]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="deposit-bonus-confirm-title"
			onMouseDown={(event) => {
				if (event.currentTarget === event.target) onCancel();
			}}
		>
			<div className="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-2xl">
				<h2
					id="deposit-bonus-confirm-title"
					className="text-base font-semibold"
				>
					{title}
				</h2>
				<p className="mt-2 text-sm text-muted">{description}</p>
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="inline-flex h-10 items-center rounded-lg bg-red-500 px-3 text-sm font-semibold text-white transition hover:bg-red-600"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	);
}
