import { searchBinds, getBindTitle } from "@/shared/lib/bind-search";
import { useState, useEffect, useRef } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useKnowledgeStore, useWorkspaceStore } from "@/store";
import { useBonusStore } from "@/store/bonus.store";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import {
	answerAssistantService,
	type CheckIssue,
} from "@/services/answer-assistant.service";
import { translatorService } from "@/services/translator.service";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useToast } from "@/shared/hooks/useToast";
import { AnswerAssistantPage } from "@/features/ai/AnswerAssistantPage";
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
	const showLauncher = useWorkspaceStore((s) => s.layout.showTranslatorWidget);
	const access = useAuthStore((s) => s.session?.user.access);
	const [expanded, setExpanded] = useState(false);
	const [mode, setMode] = useState("answer");
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");
	const [language, setLanguage] = useState("en");
	const [fromLanguage, setFromLanguage] = useState("auto");
	const [liveTranslate, setLiveTranslate] = useState(false);
	const liveSignature = useRef("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [issues, setIssues] = useState<CheckIssue[]>([]);
	const [checked, setChecked] = useState(false);
	const [advanced, setAdvanced] = useState(false);
	const {
		binds,
		remoteBinds,
		activeTab,
		language: bindLanguage,
	} = useKnowledgeStore();
	const project = useBonusStore((s) =>
		s.projects.find((p) => p.id === s.activeProjectId),
	);
	const bind = [...binds, ...remoteBinds].find((b) => b.id === activeTab);
	const translation =
		bind?.translations.find((t) => t.language === bindLanguage) ??
		bind?.translations[0];
	const { showToast } = useToast();
	useEffect(() => {
		const close = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setExpanded(false);
				if (hash.startsWith("composer")) void navigate({ to: "/", hash: "" });
			}
		};
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [hash, navigate]);
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
	async function run() {
		setBusy(true);
		setError("");
		setIssues([]);
		setChecked(false);
		try {
			const data = answerAssistantService.load();
			if (activeMode === "translate") {
				const result = await translatorService.translate({
					text: input,
					fromLanguage,
					toLanguage: language,
				});
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
					customerMessage:
						activeMode === "rewrite"
							? "Перепиши исходный ответ яснее, сохраняя факты и ограничения."
							: input,
					context,
					referenceAnswer:
						activeMode === "rewrite" ? input : translation?.content,
					responseStyle: activeMode === "rewrite" ? "expanded-bind" : undefined,
					settings: {
						...data.settings,
						language,
						aiEnabled:
							activeMode === "rewrite" ? true : data.settings.aiEnabled,
					},
					glossary: data.glossary,
					memory: data.memory,
				});
				setOutput(result.answer);
				setIssues(result.issues);
				if (result.warning) setError(result.warning);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Не удалось подготовить ответ");
		} finally {
			setBusy(false);
		}
	}
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
			void run();
		}, 500);
		return () => clearTimeout(timer);
	}, [liveTranslate, input, language, fromLanguage, activeMode, pathname]);
	if (pathname !== "/" || !can(access, "tools")) return null;
	return (
		<>
			{showLauncher && (
				<button
					type="button"
					className="absolute right-3 top-2 z-20 rounded-xl bg-surface border border-border px-3 py-2 text-sm"
					onClick={() => setExpanded(true)}
				>
					Support Composer
				</button>
			)}
			{open && (
				<aside
					aria-label="Support Composer"
					className="composer-panel absolute inset-0 z-30 flex min-h-0 flex-col border-l border-border bg-surface shadow-xl lg:relative lg:inset-auto lg:w-[420px] lg:shrink-0"
				>
					<header className="flex items-center justify-between p-3">
						<h2 className="font-semibold">Support Composer</h2>
						<button
							className="min-h-10 px-3"
							aria-label="Закрыть Composer"
							onClick={() => {
								setExpanded(false);
								if (requested) void navigate({ to: "/", hash: "" });
							}}
						>
							✕
						</button>
					</header>
					<nav className="flex overflow-auto px-2" aria-label="Режим Composer">
						{modes.map(([id, label]) => (
							<button
								key={id}
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
						<p className="text-xs text-muted">
							{project?.name ?? "Проект не выбран"} ·{" "}
							{translation?.title ?? "Материал не выбран"}
						</p>
						{activeMode === "sources" ? (
							<div>
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
											key={b.id}
											className="block w-full border-b border-border py-3 text-left text-sm"
											onClick={() =>
												useKnowledgeStore.getState().openBind(b.id)
											}
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
								<label className="block text-sm">
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
								<label className="block text-sm">
									Ответ
									<textarea
										value={output}
										onChange={(e) => setOutput(e.target.value)}
										className="mt-2 w-full min-h-40 rounded-lg border border-border bg-background p-3"
									/>
								</label>
								<button
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
									<p role="status" className="text-sm text-muted">
										Проверка завершена: известных проблем не обнаружено.
									</p>
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
