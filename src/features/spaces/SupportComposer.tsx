import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AIFeedback } from "@/features/admin/AIFeedback";
import { AnswerAssistantPage } from "@/features/ai/AnswerAssistantPage";
import { usePreference } from "@/features/productivity/preferences";
import {
	answerAssistantService,
	type CheckIssue,
} from "@/services/answer-assistant.service";
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
export function SupportComposer() {
	const hash = useRouterState({ select: (s) => s.location.hash });
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const navigate = useNavigate();
	const access = useAuthStore((s) => s.session?.user.access);
	const projectId = useBonusStore((s) => s.activeProjectId);
	const projects = useBonusStore((s) => s.projects);
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
	const [checked, setChecked] = useState(false);
	const [advanced, setAdvanced] = useState(false);
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
		activeTab,
		language: bindLanguage,
	} = useKnowledgeStore();
	const project = useBonusStore((s) =>
		s.projects.find((p) => p.id === s.activeProjectId),
	);
	const [sourceId, setSourceId] = useViewState<string | undefined>(
		"composer",
		"source",
		undefined,
	);
	const bind = [...binds, ...remoteBinds].find(
		(b) => b.id === (sourceId ?? activeTab),
	);
	const translation =
		bind?.translations.find((t) => t.language === bindLanguage) ??
		bind?.translations[0];
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
	const activeMode = requested ? hash.split("-")[1] || mode : mode;
	const suggestions = input.trim()
		? searchBinds(
				[...binds, ...remoteBinds].filter((b) => !b.archived),
				input,
				{ language: bindLanguage },
			).slice(0, 4)
		: [];
	const context = [
		"Use the material and case notes as factual sources. Do not invent statuses, deadlines, payments or promises.",
		project?.name,
		translation?.title,
		translation?.content,
	]
		.filter(Boolean)
		.join("\n\n");
	// biome-ignore lint/correctness/useExhaustiveDependencies: all case inputs invalidate in-flight responses and checks.
	useEffect(() => {
		requestVersion.current++;
		setBusy(false);
		setChecked(false);
	}, [
		input,
		language,
		fromLanguage,
		activeMode,
		sourceId,
		activeTab,
		projectId,
		tone,
		intent,
		translation?.content,
		translation?.agentInstructions,
	]);
	async function run() {
		const version = ++requestVersion.current;
		setBusy(true);
		setError("");
		setIssues([]);
		setChecked(false);
		try {
			const data = answerAssistantService.load();
			if (activeMode === "translate") {
				if (!can(access, "translator.use"))
					throw new Error("Нет доступа к переводчику");
				const result = await translatorService.translate({
					text: input,
					fromLanguage,
					toLanguage: language,
				});
				if (version !== requestVersion.current) return;
				setOutput(result.text);
			} else if (activeMode === "check") {
				setChecked(true);
				setIssues(
					answerAssistantService.checkAnswer({
						answer: output || input,
						customerMessage: input,
						glossary: data.glossary,
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
					agentInstructions: translation?.agentInstructions,
					referenceAnswer:
						activeMode === "rewrite" ? input : translation?.content,
					responseStyle: activeMode === "rewrite" ? "expanded-bind" : undefined,
					settings: {
						...data.settings,
						intent,
						tone,
						language,
						aiEnabled:
							activeMode === "rewrite" ? true : data.settings.aiEnabled,
					},
					glossary: data.glossary,
					memory: data.memory,
				});
				if (version !== requestVersion.current) return;
				setOutput(result.answer);
				setIssues(result.issues);
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
					<header className="flex items-center justify-between p-3">
						<h2 className="font-semibold">Помощник ответа</h2>
						<button
							type="button"
							className="min-h-10 px-3 text-sm"
							onClick={() => {
								requestVersion.current++;
								setInput("");
								setSourceId("");
								setOutput("");
								setIssues([]);
								setError("");
								setChecked(false);
								setBusy(false);
								setLiveTranslate(false);
							}}
						>
							Новый кейс
						</button>
						<button
							type="button"
							className="min-h-10 px-3"
							aria-label="Закрыть помощник"
							onClick={() => {
								setExpanded(false);
								if (requested) void navigate({ to: "/", hash: "" });
							}}
						>
							✕
						</button>
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
										void navigate({ to: "/", hash: "composer-" + id });
								}}
							>
								{label}
							</button>
						))}
					</nav>
					<div className="supportos-scroll min-h-0 flex-1 overflow-auto p-4 space-y-3">
						<label className="composer-setting block text-sm">
							Проект
							<select
								className="ml-2 max-w-full rounded border border-border bg-background p-2"
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
							</select>
						</label>
						<label className="composer-setting block text-sm">
							Тема обращения
							<select
								className="ml-2 rounded border border-border bg-background p-2"
								value={intent}
								onChange={(event) =>
									setIntent(event.target.value as typeof intent)
								}
							>
								{[
									["general", "Общая"],
									["deposit", "Депозит"],
									["withdrawal", "Вывод"],
									["bonus", "Бонус"],
									["verification", "Верификация"],
									["technical", "Техническая проблема"],
									["sports-betting", "Спортивные ставки"],
								].map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</label>
						<label className="composer-setting block text-sm">
							Тон
							<select
								className="ml-2 rounded border border-border bg-background p-2"
								value={tone}
								onChange={(e) => setTone(e.target.value as typeof tone)}
							>
								<option value="neutral">Нейтральный</option>
								<option value="friendly">Дружелюбный</option>
								<option value="formal">Формальный</option>
								<option value="concise">Краткий</option>
							</select>
						</label>
						<p className="text-xs text-muted">
							{project?.name ?? "Проект не выбран"} ·{" "}
							{translation?.title ?? "Материал не выбран"}
						</p>
						{activeMode === "sources" ? (
							<div>
								<button
									type="button"
									disabled={!activeTab}
									className="min-h-10 px-3 text-sm"
									onClick={() => setSourceId(activeTab)}
								>
									Использовать открытый материал
								</button>
								<p className="whitespace-pre-wrap text-sm">
									{translation
										? context
										: "Откройте материал, чтобы использовать его как источник ответа."}
								</p>
								<h3 className="mt-4 text-sm font-semibold">
									Подходящие материалы
								</h3>
								{suggestions.length ? (
									suggestions.map((b) => (
										<button
											type="button"
											key={b.id}
											className="block w-full border-b border-border py-3 text-left text-sm"
											onClick={() => {
												setSourceId(b.id);
												useKnowledgeStore.getState().openBind(b.id);
											}}
										>
											{getBindTitle(b, bindLanguage)}
										</button>
									))
								) : (
									<p className="py-3 text-sm text-muted">
										Введите вопрос клиента для поиска источников.
									</p>
								)}
							</div>
						) : (
							<>
								<label className="composer-setting block text-sm">
									{activeMode === "answer"
										? "Сообщение клиента"
										: "Исходный текст"}
									<textarea
										className="mt-2 w-full min-h-32 rounded-lg border border-border bg-background p-3"
										value={input}
										onChange={(e) => setInput(e.target.value)}
									/>
								</label>
								<label className="flex items-center justify-between gap-2 text-sm">
									Язык ответа
									<input
										list="composer-languages"
										value={language}
										onChange={(e) => setLanguage(e.target.value)}
										className="w-24 rounded-lg border border-border bg-background p-2"
									/>
									<datalist id="composer-languages">
										{[
											"ru",
											"en",
											"uk",
											"de",
											"el",
											"es",
											"pt",
											"fr",
											"it",
											"tr",
											"pl",
											"ar",
										].map((l) => (
											<option key={l} value={l} />
										))}
									</datalist>
								</label>
								{activeMode === "translate" && (
									<div className="space-y-2">
										<label className="flex justify-between text-sm">
											Исходный язык
											<input
												aria-label="Исходный язык"
												className="w-24 rounded-lg border border-border bg-background p-2"
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
										<button
											type="button"
											className="space-tab"
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
										</button>
									</div>
								)}
								<button
									type="button"
									disabled={
										busy ||
										!(input.trim() || (activeMode === "check" && output.trim()))
									}
									onClick={() => void run()}
									className="min-h-11 w-full rounded-lg bg-accent text-accent-foreground disabled:opacity-50"
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
								</button>
								{error && (
									<p role="alert" className="text-sm text-red-400">
										{error}
									</p>
								)}
								<label className="composer-setting block text-sm">
									Ответ
									<textarea
										value={output}
										onChange={(e) => setOutput(e.target.value)}
										className="mt-2 w-full min-h-40 rounded-lg border border-border bg-background p-3"
									/>
								</label>
								<button
									type="button"
									disabled={!output.trim()}
									className="space-tab"
									onClick={async () =>
										showToast(
											(await copyToClipboard(output))
												? "Ответ скопирован"
												: "Не удалось скопировать",
										)
									}
								>
									Копировать
								</button>
								{checked && !issues.length && (
									<output className="text-sm text-muted">
										Проверка завершена: известных проблем не обнаружено.
									</output>
								)}
								{output && (
									<AIFeedback
										key={`${output}:${projectId}`}
										project={projectId}
										language={language}
									/>
								)}

								{issues.map((i) => (
									<div
										className="border-l-2 border-accent pl-3 text-sm"
										key={i.id}
									>
										<strong>{i.title}</strong>
										<p>{i.detail}</p>
									</div>
								))}
								<button
									type="button"
									className="text-xs underline"
									onClick={() => setAdvanced(!advanced)}
									aria-expanded={advanced}
								>
									Настройки ответа, глоссарий и память
								</button>
								{advanced && <AnswerAssistantPage settingsOnly />}
							</>
						)}
					</div>
				</aside>
			)}
		</>
	);
}
