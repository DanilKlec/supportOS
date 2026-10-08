import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Button, IconButton, Input, Select, Textarea } from "@/components/ui";
import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { AIFeedback } from "@/features/admin/AIFeedback";
import { usePreference } from "@/features/productivity/preferences";
import { AssistantSettingsPanel } from "@/features/spaces/AssistantSettingsPanel";
import {
	type AnswerSource,
	answerAssistantService,
	applyGlossary,
	type CheckIssue,
} from "@/services/answer-assistant.service";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useProjectCatalog } from "@/services/project-catalog.service";
import { getTeamGlossary } from "@/services/team-glossary.service";
import { translatorService } from "@/services/translator.service";
import { useToast } from "@/shared/hooks/useToast";
import { useViewState } from "@/shared/hooks/useViewState";
import { getBindTitle, searchBinds } from "@/shared/lib/bind-search";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { can } from "../../../shared/access.js";

const modes = [
	["answer", "Ответ"],
	["translate", "Перевод"],
	["rewrite", "Переписать"],
	["check", "Проверить"],
	["sources", "Источники"],
];

const checkGroups: Array<{
	severity: CheckIssue["severity"];
	title: string;
	className: string;
}> = [
	{ severity: "error", title: "Критично", className: "border-red-500/40" },
	{
		severity: "warning",
		title: "Требует внимания",
		className: "border-amber-500/40",
	},
	{ severity: "ok", title: "Всё хорошо", className: "border-emerald-500/40" },
];

type AIStatus = {
	configured?: boolean;
	provider?: "openai" | "gemini";
};

function getAIStatusLabel(status: AIStatus | undefined, unavailable: boolean) {
	if (unavailable) return "AI недоступен";
	if (!status?.configured) return "Локальный режим";
	return status.provider === "openai" ? "AI · OpenAI" : "AI · Gemini";
}

function getBindLocation(
	bind: Bind,
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
) {
	const location = [
		categories.find((category) => category.id === bind.categoryId)?.name,
	];
	const folderPath: string[] = [];
	let folder = bind.folderId
		? folders.find((item) => item.id === bind.folderId)
		: undefined;

	while (folder) {
		folderPath.unshift(folder.name);
		folder = folder.parentId
			? folders.find((item) => item.id === folder?.parentId)
			: undefined;
	}

	return [...location, ...folderPath].filter(Boolean).join(" / ");
}

const sourceTypeLabel: Record<AnswerSource["type"], string> = {
	material: "Материал",
	rule: "Правило",
	project_instruction: "Инструкция проекта",
	glossary: "Глоссарий",
};

export function SupportComposer() {
	const controlId = useId();
	const hash = useRouterState({ select: (s) => s.location.hash });
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const navigate = useNavigate();
	const access = useAuthStore((s) => s.session?.user.access);
	const userId = useAuthStore((s) => s.session?.user.id);
	const projectId = useBonusStore((s) => s.activeProjectId);
	const projectCatalog = useProjectCatalog();
	const preferredMaterialLanguage = useKnowledgeStore((s) => s.language);
	const [tone, setTone] = usePreference<
		import("@/services/answer-assistant.service").AnswerTone
	>(`composer-tone:${projectId ?? "all"}`, "neutral");
	const [expanded, setExpanded] = useViewState("composer", "expanded", false);
	const [intent, setIntent] = useViewState<
		import("@/services/answer-assistant.service").AnswerIntent
	>("composer", "intent", "general");
	useEffect(() => {
		const open = () => setExpanded(true);
		window.addEventListener("supportos:open-composer", open);
		return () => window.removeEventListener("supportos:open-composer", open);
	}, [setExpanded]);
	const [mode, setMode] = usePreference("composer-mode", "answer");
	const [input, setInput] = useViewState("composer", "input", "");
	const [output, setOutput] = useViewState("composer", "output", "");
	const [language, setLanguage] = usePreference(
		`composer-language:${projectId ?? "all"}`,
		preferredMaterialLanguage as string,
	);
	const [fromLanguage, setFromLanguage] = usePreference(
		"composer-source-language",
		"auto",
	);
	const [liveTranslate, setLiveTranslate] = useViewState(
		"composer",
		"live",
		false,
	);
	const liveSignature = useRef("");
	const requestVersion = useRef(0);
	useEffect(
		() => () => {
			requestVersion.current++;
		},
		[],
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [issues, setIssues] = useState<CheckIssue[]>([]);
	const [answerSources, setAnswerSources] = useState<AnswerSource[]>([]);
	const [checked, setChecked] = useState(false);
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);
	const [aiEnabled, setAIEnabled] = useState(
		() => answerAssistantService.load().settings.aiEnabled,
	);
	useEffect(() => {
		const select = (event: Event) => {
			const detail = (event as CustomEvent<{ text: string; mode: string }>)
				.detail;
			if (
				!can(access, "composer.use") ||
				!detail ||
				typeof detail.text !== "string" ||
				detail.text.length > 5000 ||
				!["translate", "rewrite", "check"].includes(detail.mode)
			)
				return;
			setInput(detail.text);
			setOutput("");
			setMode(detail.mode);
			setExpanded(true);
			void navigate({ to: "/", hash: `composer-${detail.mode}` });
		};
		window.addEventListener("supportos:compose-selection", select);
		return () =>
			window.removeEventListener("supportos:compose-selection", select);
	}, [access, setInput, setOutput, setMode, setExpanded, navigate]);
	const {
		binds,
		remoteBinds,
		categories,
		folders,
		activeTab,
		language: bindLanguage,
	} = useKnowledgeStore();
	const projects = projectCatalog.data ?? [];
	const project = projects.find((item) => item.id === projectId);
	const [selectedSourceIds, setSelectedSourceIds] = useViewState<string[]>(
		"composer",
		"selected-sources",
		[],
	);
	const availableBinds = [...binds, ...remoteBinds];
	const selectedSources = selectedSourceIds
		.map((id) => availableBinds.find((bind) => bind.id === id))
		.filter((bind): bind is Bind => Boolean(bind));
	const selectedTranslations = selectedSources.map(
		(bind) =>
			bind.translations.find(
				(translation) => translation.language === bindLanguage,
			) ?? bind.translations[0],
	);
	const selectedSourceSignature = selectedTranslations
		.map((translation) =>
			translation
				? [
						translation.title,
						translation.content,
						translation.agentInstructions,
					].join("\u0000")
				: "",
		)
		.join("\u0001");
	const addSource = (id: string) => {
		setSelectedSourceIds((current) =>
			current.includes(id) || current.length >= 5 ? current : [...current, id],
		);
	};
	const removeSource = (id: string) =>
		setSelectedSourceIds((current) =>
			current.filter((currentId) => currentId !== id),
		);
	const { showToast } = useToast();
	useEffect(() => {
		const close = (e: KeyboardEvent) => {
			if (
				e.key === "Escape" &&
				!e.defaultPrevented &&
				!document.querySelector('[aria-modal="true"]')
			) {
				setExpanded(false);
				if (hash.startsWith("composer")) void navigate({ to: "/", hash: "" });
			}
		};
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [hash, navigate, setExpanded]);
	const requested = hash.startsWith("composer");
	const open = expanded || requested;
	const aiStatus = useQuery({
		queryKey: ["composer-ai-status", userId],
		enabled: open && Boolean(userId) && can(access, "composer.use"),
		staleTime: 30_000,
		queryFn: async (): Promise<AIStatus> => {
			const response = await authenticatedFetch("/api/ai/status");
			const data = (await response.json().catch(() => ({}))) as AIStatus & {
				error?: string;
			};
			if (!response.ok) throw new Error(data.error ?? "AI status unavailable");
			return data;
		},
	});
	const aiStatusLabel = aiStatus.isPending
		? undefined
		: getAIStatusLabel(aiStatus.data, aiStatus.isError);
	const updateAIEnabled = (enabled: boolean) => {
		setAIEnabled(enabled);
		const current = answerAssistantService.load();
		answerAssistantService.save({
			...current,
			settings: { ...current.settings, aiEnabled: enabled },
		});
	};
	const activeMode = requested ? hash.split("-")[1] || mode : mode;
	const suggestions = input.trim()
		? searchBinds(
				[...binds, ...remoteBinds].filter((b) => !b.archived),
				input,
				{ language: bindLanguage, categories, folders },
			).slice(0, 5)
		: [];
	const context = [
		"Use the material and case notes as factual sources. Do not invent statuses, deadlines, payments or promises.",
		...selectedTranslations.flatMap((translation) =>
			translation ? [translation.title, translation.content] : [],
		),
	]
		.filter(Boolean)
		.join("\n\n");
	// biome-ignore lint/correctness/useExhaustiveDependencies: all case inputs invalidate in-flight responses and checks.
	useEffect(() => {
		requestVersion.current++;
		setBusy(false);
		setChecked(false);
		setAnswerSources([]);
	}, [
		input,
		language,
		fromLanguage,
		activeMode,
		selectedSourceIds,
		projectId,
		tone,
		intent,
		selectedSourceSignature,
	]);
	async function run() {
		const version = ++requestVersion.current;
		setBusy(true);
		setError("");
		setIssues([]);
		setAnswerSources([]);
		setChecked(false);
		try {
			const data = answerAssistantService.load();
			const glossary = (await getTeamGlossary()).filter(
				(term) => !term.projectId || term.projectId === projectId,
			);
			if (activeMode === "translate") {
				if (!can(access, "translator.use"))
					throw new Error("Нет доступа к переводчику");
				const result = await translatorService.translate({
					text: input,
					fromLanguage,
					toLanguage: language,
				});
				if (version !== requestVersion.current) return;
				setOutput(applyGlossary(result.text, glossary, language));
			} else if (activeMode === "check") {
				setChecked(true);
				setIssues(
					answerAssistantService.checkAnswer({
						answer: output || input,
						customerMessage: input,
						glossary,
						language,
					}),
				);
			} else {
				const result = await answerAssistantService.generateReadyAnswer({
					project: projectId,
					purpose: "composer",
					customerMessage:
						activeMode === "rewrite"
							? "Перепиши исходный ответ яснее, сохраняя факты и ограничения."
							: input,
					context,
					agentInstructions: selectedTranslations
						.map((translation) => translation?.agentInstructions)
						.filter(Boolean)
						.join("\n\n"),
					referenceAnswer:
						activeMode === "rewrite"
							? input
							: selectedTranslations
									.map((translation) => translation?.content)
									.filter(Boolean)
									.join("\n\n"),
					responseStyle: activeMode === "rewrite" ? "expanded-bind" : undefined,
					settings: {
						...data.settings,
						intent,
						tone,
						language,
						aiEnabled:
							activeMode === "rewrite" ? true : data.settings.aiEnabled,
					},
					glossary,
					memory: data.memory,
					sources: selectedSources.map((bind) => ({
						id: bind.id,
						title: getBindTitle(bind, bindLanguage),
						type: "material",
						...(project?.name ? { project: project.name } : {}),
					})),
				});
				if (version !== requestVersion.current) return;
				setOutput(result.answer);
				setIssues(result.issues);
				setAnswerSources(result.sources ?? []);
				if (result.warning) setError(result.warning);
			}
		} catch (e) {
			if (version !== requestVersion.current) return;
			setError(e instanceof Error ? e.message : "Не удалось подготовить ответ");
		} finally {
			if (version === requestVersion.current) setBusy(false);
		}
	}
	const runLive = useEffectEvent(run);
	useEffect(() => {
		if (
			!liveTranslate ||
			activeMode !== "translate" ||
			!input.trim() ||
			pathname !== "/"
		)
			return;
		const signature = JSON.stringify([input, language, fromLanguage]);
		if (signature === liveSignature.current) return;
		const timer = setTimeout(() => {
			liveSignature.current = signature;
			void runLive();
		}, 500);
		return () => clearTimeout(timer);
	}, [liveTranslate, input, language, fromLanguage, activeMode, pathname]);
	if (pathname !== "/" || !can(access, "composer.use")) return null;
	return (
		<>
			{open && (
				<aside
					onKeyDown={(event) => {
						if (
							(event.ctrlKey || event.metaKey) &&
							event.key === "Enter" &&
							!busy &&
							input.trim()
						) {
							event.preventDefault();
							void run();
						}
					}}
					aria-label="Помощник ответа"
					className="composer-panel absolute inset-0 z-30 flex min-h-0 flex-col border-l border-border bg-surface shadow-xl lg:relative lg:inset-auto lg:w-[420px] lg:shrink-0"
				>
					<header className="flex min-w-0 flex-col gap-2 p-3">
						<div className="flex min-w-0 items-center gap-2">
							<h2 className="min-w-0 flex-1 truncate font-semibold">
								Помощник ответа
							</h2>
							{aiStatusLabel && (
								<span
									className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted"
									aria-live="polite"
								>
									{aiStatusLabel}
								</span>
							)}
						</div>
						<div className="ui-actions">
							<div className="relative mr-auto shrink-0">
								<Button
									type="button"
									size="small"
									variant="ghost"
									aria-expanded={howItWorksOpen}
									aria-controls="composer-how-it-works"
									onClick={() => setHowItWorksOpen((open) => !open)}
								>
									Как это работает
								</Button>
								{howItWorksOpen && (
									<div
										id="composer-how-it-works"
										role="dialog"
										aria-label="Как работает Помощник"
										className="absolute left-0 top-full z-40 mt-2 w-72 rounded-lg border border-border bg-surface p-3 text-sm shadow-lg"
									>
										<ol className="list-decimal space-y-1 pl-5">
											<li>Вставьте сообщение клиента.</li>
											<li>Выберите проект.</li>
											<li>Добавьте подходящие материалы.</li>
											<li>
												Помощник применит подтверждённые правила и источники.
											</li>
											<li>Проверьте результат перед отправкой.</li>
										</ol>
									</div>
								)}
							</div>
							<Button
								type="button"
								size="small"
								onClick={() => {
									requestVersion.current++;
									setInput("");
									setSelectedSourceIds([]);
									setOutput("");
									setIssues([]);
									setAnswerSources([]);
									setError("");
									setChecked(false);
									setBusy(false);
									setLiveTranslate(false);
								}}
							>
								Новый кейс
							</Button>
							<IconButton
								type="button"
								variant="ghost"
								size="small"
								label="Закрыть помощник"
								onClick={() => {
									setExpanded(false);
									if (requested) void navigate({ to: "/", hash: "" });
								}}
							>
								<X size={16} />
							</IconButton>
						</div>
					</header>
					<p className="px-4 pb-3 text-xs leading-5 text-muted">
						Подготовьте, переведите или проверьте ответ клиенту. Результат можно
						скопировать в чат.
					</p>
					<nav className="flex overflow-auto px-2" aria-label="Режим помощника">
						{modes.map(([id, label]) => (
							<button
								type="button"
								key={id}
								disabled={id === "translate" && !can(access, "translator.use")}
								className="space-tab"
								aria-pressed={activeMode === id}
								onClick={() => {
									setMode(id);
									if (requested)
										void navigate({ to: "/", hash: `composer-${id}` });
								}}
							>
								{label}
							</button>
						))}
					</nav>
					<div className="supportos-scroll min-h-0 min-w-0 flex-1 overflow-auto p-4 space-y-3 [overflow-wrap:anywhere]">
						<label
							htmlFor={`${controlId}-project`}
							className="composer-setting block text-sm"
						>
							Проект
							<Select
								id={`${controlId}-project`}
								className="max-w-full bg-background"
								value={projectId ?? ""}
								onChange={(e) =>
									useBonusStore
										.getState()
										.setActiveProject(e.target.value || undefined)
								}
							>
								<option value="">Все проекты</option>
								{projects.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</Select>
						</label>
						<AssistantSettingsPanel
							language={language}
							onLanguageChange={setLanguage}
							tone={tone}
							onToneChange={setTone}
							intent={intent}
							onIntentChange={setIntent}
							aiEnabled={aiEnabled}
							onAIEnabledChange={updateAIEnabled}
							aiStatus={aiStatusLabel}
							showIntegrationSettings={can(access, "technical")}
						/>
						<p className="text-xs text-muted">
							{project?.name ?? "Проект не выбран"} · выбранных материалов:{" "}
							{selectedSources.length}
						</p>
						{activeMode === "sources" ? (
							<div>
								<div className="ui-actions">
									<Button
										type="button"
										disabled={
											!activeTab ||
											selectedSourceIds.includes(activeTab) ||
											selectedSourceIds.length >= 5
										}
										className="w-full"
										onClick={() => activeTab && addSource(activeTab)}
									>
										Использовать открытый материал
									</Button>
								</div>
								<div className="mt-3 rounded-lg border border-border p-3">
									<div className="ui-actions justify-between">
										<h3 className="min-w-0 flex-1 text-sm font-semibold">
											Выбранные материалы ({selectedSources.length}/5)
										</h3>
										<Button
											type="button"
											size="small"
											variant="ghost"
											disabled={!selectedSources.length}
											onClick={() => setSelectedSourceIds([])}
										>
											Очистить
										</Button>
									</div>
									{selectedSources.length ? (
										<ul className="mt-2 space-y-2">
											{selectedSources.map((bind) => (
												<li
													key={bind.id}
													className="ui-actions justify-between text-sm"
												>
													<span className="min-w-0 flex-1 truncate">
														{getBindTitle(bind, bindLanguage)}
													</span>
													<Button
														type="button"
														size="small"
														variant="ghost"
														aria-label={`Убрать ${getBindTitle(bind, bindLanguage)}`}
														onClick={() => removeSource(bind.id)}
													>
														Убрать
													</Button>
												</li>
											))}
										</ul>
									) : (
										<p className="mt-2 text-sm text-muted">
											Добавьте до пяти материалов. Открытый материал и
											рекомендации не используются автоматически.
										</p>
									)}
								</div>
								<h3 className="mt-4 text-sm font-semibold">
									Подходящие материалы
								</h3>
								{suggestions.length ? (
									suggestions.map((b) => (
										<div
											key={b.id}
											className="ui-actions justify-between border-b border-border py-3 text-sm"
										>
											<div className="min-w-0 flex-1">
												<p className="break-words font-medium">
													{getBindTitle(b, bindLanguage)}
												</p>
												<p className="break-words text-xs text-muted">
													{getBindLocation(b, categories, folders) ||
														"Без папки"}
												</p>
											</div>
											<Button
												type="button"
												size="small"
												aria-label={`Использовать ${getBindTitle(b, bindLanguage)}`}
												disabled={
													selectedSourceIds.includes(b.id) ||
													selectedSourceIds.length >= 5
												}
												onClick={() => addSource(b.id)}
											>
												Использовать
											</Button>
										</div>
									))
								) : (
									<p className="py-3 text-sm text-muted">
										Введите вопрос клиента для поиска источников.
									</p>
								)}
							</div>
						) : (
							<>
								<label
									htmlFor={`${controlId}-input`}
									className="composer-setting block text-sm"
								>
									{activeMode === "answer"
										? "Сообщение клиента"
										: "Исходный текст"}
									<Textarea
										id={`${controlId}-input`}
										className="mt-2 w-full min-h-32 bg-background"
										value={input}
										onChange={(e) => setInput(e.target.value)}
									/>
								</label>
								{activeMode === "translate" && (
									<div className="space-y-2">
										<label
											htmlFor={`${controlId}-source-language`}
											className="flex min-w-0 items-center justify-between gap-2 text-sm"
										>
											Исходный язык
											<Input
												id={`${controlId}-source-language`}
												aria-label="Исходный язык"
												className="w-24 shrink-0 bg-background"
												value={fromLanguage}
												onChange={(e) => setFromLanguage(e.target.value)}
												list="composer-languages"
											/>
										</label>
										<label className="flex items-center gap-2 text-sm">
											<input
												type="checkbox"
												checked={liveTranslate}
												onChange={(e) => setLiveTranslate(e.target.checked)}
											/>
											Автоперевод
										</label>
										<div className="ui-actions">
											<Button
												type="button"
												variant="secondary"
												disabled={!output}
												onClick={() => {
													setInput(output);
													setOutput(input);
													setFromLanguage(language);
													setLanguage(
														fromLanguage === "auto" ? "ru" : fromLanguage,
													);
												}}
											>
												Поменять местами
											</Button>
										</div>
									</div>
								)}
								<div className="ui-actions">
									<Button
										type="button"
										disabled={
											busy ||
											!(
												input.trim() ||
												(activeMode === "check" && output.trim())
											)
										}
										loading={busy}
										onClick={() => void run()}
										variant="primary"
										className="w-full"
									>
										{busy
											? "Подготовка…"
											: activeMode === "check"
												? "Проверить ответ"
												: activeMode === "translate"
													? "Перевести"
													: activeMode === "rewrite"
														? "Переписать"
														: "Подготовить ответ"}
									</Button>
								</div>
								{error && (
									<p role="alert" className="text-sm text-red-400">
										{error}
									</p>
								)}
								<label
									htmlFor={`${controlId}-output`}
									className="composer-setting block text-sm"
								>
									Ответ
									<Textarea
										id={`${controlId}-output`}
										value={output}
										onChange={(e) => setOutput(e.target.value)}
										className="mt-2 w-full min-h-40 bg-background"
									/>
								</label>
								{answerSources.length > 0 && (
									<section
										className="rounded-lg border border-border p-3"
										aria-label="Источники ответа"
									>
										<h3 className="text-sm font-semibold">Источники ответа</h3>
										<ul className="mt-2 space-y-2 text-sm">
											{answerSources.map((source) => (
												<li key={`${source.type}:${source.id}`}>
													<strong>{source.title}</strong>
													<p className="text-xs text-muted">
														{sourceTypeLabel[source.type]}
														{source.project ? ` · ${source.project}` : ""}
														{source.version
															? ` · Версия публикации: ${source.version}`
															: ""}
														{source.ref ? ` · ${source.ref}` : ""}
													</p>
												</li>
											))}
										</ul>
									</section>
								)}
								<div className="ui-actions">
									<Button
										type="button"
										disabled={!output.trim()}
										className="w-full"
										onClick={async () =>
											showToast(
												(await copyToClipboard(output))
													? "Ответ скопирован"
													: "Не удалось скопировать",
											)
										}
									>
										Копировать
									</Button>
								</div>
								{checked && (
									<section
										className="space-y-3"
										aria-label="Результат проверки"
									>
										{checkGroups.map((group) => {
											const grouped = issues.filter(
												(issue) => issue.severity === group.severity,
											);
											if (!grouped.length) return null;
											return (
												<div key={group.severity}>
													<h3 className="mb-2 text-sm font-semibold">
														{group.title}
													</h3>
													{grouped.map((issue) => (
														<div
															key={issue.id}
															className={`border-l-2 pl-3 text-sm ${group.className}`}
														>
															<strong>{issue.title}</strong>
															<p>{issue.detail}</p>
														</div>
													))}
												</div>
											);
										})}
									</section>
								)}
								{output && (
									<AIFeedback
										key={`${output}:${projectId}`}
										project={projectId}
										language={language}
										answer={output}
										sourceIds={answerSources.map((source) => source.id)}
									/>
								)}

								{!checked &&
									issues.map((i) => (
										<div
											className="border-l-2 border-accent pl-3 text-sm"
											key={i.id}
										>
											<strong>{i.title}</strong>
											<p>{i.detail}</p>
										</div>
									))}
							</>
						)}
					</div>
				</aside>
			)}
		</>
	);
}
