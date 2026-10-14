import { Copy, Loader2, RefreshCw, Upload } from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useSharedPublication } from "@/components/SharedPublication";
import type { BonusProject, DepositBonus } from "@/entities/bonus";
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
import { useProjectCatalog } from "@/services/project-catalog.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useBonusStore } from "@/store/bonus.store";
import { BonusEditor } from "./deposit-bonuses/BonusEditor";
import { BonusList } from "./deposit-bonuses/BonusList";
import {
	BONUS_LANGUAGES,
	type BonusDraft,
	buildBonusBind,
	buildBonusSearchText,
	buildDraftTranslations,
	buildPackageBind,
	buildProjectSearchText,
	createEmptyBonusDraft,
	FALLBACK_CURRENCIES,
	getProjectSearchScore,
	getSearchTokens,
	isEmptyBonusDraft,
	matchesTokens,
	parseAmount,
	pickPrimaryDraftContent,
	toDraft,
} from "./deposit-bonuses/bonus-presentation";
import { ImportSourcePanel } from "./deposit-bonuses/ImportSourcePanel";
import { ProjectSelector } from "./deposit-bonuses/ProjectSelector";

export function DepositBonusesPage({
	management = false,
}: {
	management?: boolean;
} = {}) {
	const { showToast } = useToast();
	const bonusDataProjects = useBonusStore((state) => state.projects);
	const projectCatalog = useProjectCatalog();
	const projects = useMemo(() => {
		const catalog = projectCatalog.data ?? [];
		if (!catalog.length) return bonusDataProjects;

		const dataById = new Map(
			bonusDataProjects.map((project) => [project.id, project]),
		);
		const dataBySlug = new Map(
			bonusDataProjects.map((project) => [project.slug.toLowerCase(), project]),
		);
		const matchedDataIds = new Set<string>();
		const canonicalProjects: BonusProject[] = catalog.map((project) => {
			const bonusData =
				dataById.get(project.id) ?? dataBySlug.get(project.slug.toLowerCase());
			if (bonusData) matchedDataIds.add(bonusData.id);

			return {
				id: project.id,
				name: project.name,
				slug: project.slug,
				bonuses: bonusData?.bonuses ?? [],
				updatedAt: bonusData?.updatedAt ?? "",
				...(bonusData?.sheetId ? { sheetId: bonusData.sheetId } : {}),
				...(bonusData?.sourceUrl ? { sourceUrl: bonusData.sourceUrl } : {}),
				...(bonusData?.sourceHash ? { sourceHash: bonusData.sourceHash } : {}),
			};
		});

		// Keep unmatched legacy drafts visible until their IDs are mapped server-side.
		return [
			...canonicalProjects,
			...bonusDataProjects.filter((project) => !matchedDataIds.has(project.id)),
		];
	}, [bonusDataProjects, projectCatalog.data]);
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
	const publication = useSharedPublication(
		"bonuses",
		projects,
		replaceProjects,
		management,
	);
	const canEdit = publication.canEdit;
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
					showToast("Курсы валют обновлены");
				}
			} catch (error) {
				setRatesError(
					error instanceof Error
						? error.message
						: "Не удалось загрузить курсы валют",
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
			showToast("Предпросмотр готов");
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Не удалось загрузить данные",
			);
		} finally {
			setImporting(false);
		}
	};

	const commitPreview = () => {
		if (!canEdit) return;
		if (!preview || preview.projects.length === 0) return;

		setCommitting(true);

		try {
			if (mode === "replace") {
				replaceProjects(preview.projects);
			} else {
				upsertProjects(preview.projects);
			}

			showToast(`Добавлено в черновик проектов: ${preview.projects.length}`);
			setPreview(undefined);
			setSheetUrl("");
			setImportOpen(false);
		} finally {
			setCommitting(false);
		}
	};

	const createProject = (event: FormEvent) => {
		if (!canEdit) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		const project = addProject(newProjectName);

		if (!project) {
			showToast("Укажите название проекта");
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
				? "Проект добавлен в группу валют"
				: "Проект добавлен в черновик",
		);
	};

	const saveProjectName = () => {
		if (!canEdit) return;
		if (!activeProject) return;

		renameProject(activeProject.id, renameValue);
		showToast("Название изменено. Сохраните справочник.");
	};

	const updateActiveProjectCurrencyGroup = (tableName: string) => {
		if (!canEdit) return;
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
				? "Группа валют выбрана"
				: "Включён автоматический выбор группы валют",
		);
	};

	const resetBonusForm = () => {
		setBonusDraft(createEmptyBonusDraft(defaultBonusCurrency));
		setEditingBonusId(undefined);
		setFormError("");
	};

	const submitBonus = (event: FormEvent) => {
		if (!canEdit) {
			event.preventDefault();
			return;
		}
		event.preventDefault();
		setFormError("");

		if (!activeProject) {
			setFormError("Сначала создайте проект");
			return;
		}

		const name = bonusDraft.name.trim();
		const translations = buildDraftTranslations(bonusDraft);
		const content = pickPrimaryDraftContent(bonusDraft, selectedLanguage);

		if (!name) {
			setFormError("Укажите название бонуса");
			return;
		}

		if (translations.length === 0) {
			setFormError("Заполните условия хотя бы на одном языке");
			return;
		}

		const amount = parseAmount(bonusDraft.minDepositAmount);
		const currency =
			bonusDraft.minDepositCurrency.trim().toUpperCase() || "USD";

		if (editingBonus) {
			updateBonus(activeProject.id, editingBonus.id, {
				checkedAt:
					name !== editingBonus.name ||
					content !== editingBonus.content ||
					JSON.stringify(translations.map((t) => [t.language, t.content])) !==
						JSON.stringify(
							(editingBonus.translations ?? []).map((t) => [
								t.language,
								t.content,
							]),
						) ||
					amount !== editingBonus.minDepositAmount ||
					currency !== editingBonus.minDepositCurrency
						? ""
						: editingBonus.checkedAt,
				name,
				content,
				translations,
				minDepositAmount: amount,
				minDepositCurrency: currency,
			});
			showToast("Правки применены. Сохраните справочник.");
		} else {
			addBonus(activeProject.id, {
				name,
				content,
				translations,
				minDepositAmount: amount,
				minDepositCurrency: currency,
			});
			showToast("Бонус добавлен в черновик справочника");
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

		showToast(copied ? "Условия бонуса скопированы" : "Не удалось скопировать");
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

		showToast(copied ? "Пакет условий скопирован" : "Не удалось скопировать");
	};

	const confirmDeleteProject = () => {
		if (!canEdit) return;
		if (!deleteProjectTarget) return;

		removeProject(deleteProjectTarget.id);
		setDeleteProjectId(undefined);
		showToast("Проект удалён из черновика");
	};

	const confirmDeleteBonus = () => {
		if (!canEdit) return;
		if (!activeProject || !deleteBonusTarget) return;

		removeBonus(activeProject.id, deleteBonusTarget.id);
		setDeleteBonusId(undefined);
		showToast("Бонус удалён из черновика");
	};

	if (!publication.ready) return publication.banner;
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
			{publication.banner}
			<datalist id="deposit-bonus-currencies">
				{currencies.map((currency) => (
					<option key={currency} value={currency} />
				))}
			</datalist>

			<div className="supportos-page-scroll flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4 overflow-auto py-4 sm:py-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="text-xs font-semibold uppercase text-muted">
							База бонусов
						</div>
						<h1 className="mt-1 text-xl font-semibold sm:text-2xl">
							Приветственные бонусы
						</h1>
						<p className="mt-1 text-sm text-muted">
							{projects.length} проектов / {totalBonuses} бонусов готовы к
							копированию.
						</p>
					</div>

					<div className="ui-actions items-center flex flex-wrap  gap-2">
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
							className="ui-input border border-border bg-surface outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
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
							className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border bg-surface font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							{ratesLoading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<RefreshCw size={16} />
							)}
							Курсы валют
						</button>

						<button
							type="button"
							disabled={!canEdit}
							style={!management ? { display: "none" } : undefined}
							onClick={() => setImportOpen((current) => !current)}
							className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border bg-surface font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<Upload size={16} />
							Импорт
						</button>

						{activeProject && (
							<button
								type="button"
								onClick={() => void copyPackage(activeProject)}
								className="ui-button ui-button--primary inline-flex items-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
							>
								<Copy size={16} />
								Скопировать пакет
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
						Источник курсов: {rates.source}. Дата: {rates.date}. Базовая валюта:{" "}
						{rates.base}.
					</div>
				)}

				{activeCurrencyContext && (
					<div className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted [overflow-wrap:anywhere]">
						Группа валют:{" "}
						{activeCurrencyContext.source === "manual"
							? "Вручную"
							: "Автоматически"}{" "}
						- {activeCurrencyContext.rule?.site ?? activeProject?.name} -{" "}
						{activeCurrencyContext.table.name}. Суммы из текста в EUR копируются
						в {selectedCurrency} при наличии подходящей строки.
					</div>
				)}

				{management && importOpen && (
					<ImportSourcePanel
						sheetUrl={sheetUrl}
						setSheetUrl={setSheetUrl}
						mode={mode}
						setMode={setMode}
						loadPreview={loadPreview}
						importing={importing}
						preview={preview}
						commitPreview={commitPreview}
						committing={committing}
					/>
				)}

				<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
					<ProjectSelector
						canEdit={canEdit}
						newProjectName={newProjectName}
						setNewProjectName={setNewProjectName}
						newProjectCurrencyGroup={newProjectCurrencyGroup}
						setNewProjectCurrencyGroup={setNewProjectCurrencyGroup}
						currencyGroupOptions={currencyGroupOptions}
						createProject={createProject}
						query={query}
						setQuery={setQuery}
						filteredProjects={filteredProjects}
						activeProject={activeProject}
						projectCurrencyGroups={projectCurrencyGroups}
						searchTokens={searchTokens}
						setActiveProject={setActiveProject}
					/>

					{activeProject ? (
						<div className="min-w-0 space-y-4">
							<BonusEditor
								activeProject={activeProject}
								renameValue={renameValue}
								setRenameValue={setRenameValue}
								canEdit={canEdit}
								saveProjectName={saveProjectName}
								activeProjectCurrencyGroup={activeProjectCurrencyGroup}
								updateActiveProjectCurrencyGroup={
									updateActiveProjectCurrencyGroup
								}
								currencyGroupOptions={currencyGroupOptions}
								activeCurrencyContext={activeCurrencyContext}
								setDeleteProjectId={setDeleteProjectId}
								submitBonus={submitBonus}
								bonusDraft={bonusDraft}
								setBonusDraft={setBonusDraft}
								selectedLanguage={selectedLanguage}
								formError={formError}
								editingBonusId={editingBonusId}
								resetBonusForm={resetBonusForm}
							/>

							<BonusList
								activeProject={activeProject}
								visibleBonuses={visibleBonuses}
								selectedLanguage={selectedLanguage}
								selectedCurrency={selectedCurrency}
								activeProjectCurrencyGroup={activeProjectCurrencyGroup}
								canEdit={canEdit}
								updateBonus={updateBonus}
								rates={rates}
								setSelectedLanguage={setSelectedLanguage}
								copyBonus={copyBonus}
								editBonus={editBonus}
								setDeleteBonusId={setDeleteBonusId}
								searchTokens={searchTokens}
							/>
						</div>
					) : (
						<div className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-sm text-muted">
							Добавьте проект, чтобы начать заполнять бонусы
						</div>
					)}
				</div>
			</div>

			<ConfirmDialog
				open={Boolean(deleteProjectTarget)}
				title="Удалить проект?"
				description={
					deleteProjectTarget
						? `${deleteProjectTarget.name} и его бонусы будут удалены из черновика.`
						: ""
				}
				onCancel={() => setDeleteProjectId(undefined)}
				onConfirm={confirmDeleteProject}
			/>

			<ConfirmDialog
				open={Boolean(deleteBonusTarget)}
				title="Удалить бонус?"
				description={
					deleteBonusTarget
						? `${deleteBonusTarget.name} будет удалён из черновика проекта.`
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
				<div className="ui-actions items-center mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="ui-button ui-button--secondary inline-flex items-center border border-border font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
					>
						Отмена
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="ui-button ui-button--danger inline-flex items-center bg-red-500 font-semibold text-white transition hover:bg-red-600"
					>
						Удалить
					</button>
				</div>
			</div>
		</div>
	);
}
