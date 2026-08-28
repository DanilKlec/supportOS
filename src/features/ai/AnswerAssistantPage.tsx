import {
	Bot,
	CheckCircle2,
	Copy,
	Languages,
	Loader2,
	RefreshCw,
	Save,
	Settings2,
	Sparkles,
	Trash2,
	Wifi,
	WifiOff,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import {
	type AnswerIntent,
	type AnswerTone,
	type AssistantSettings,
	answerAssistantService,
	type CheckIssue,
} from "@/services/answer-assistant.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";

const LANGUAGES = [
	{ code: "auto", label: "Как у клиента" },
	{ code: "ru", label: "Русский" },
	{ code: "en", label: "English" },
	{ code: "el", label: "Ελληνικά" },
	{ code: "de", label: "Deutsch" },
	{ code: "uk", label: "Українська" },
	{ code: "pt", label: "Português" },
	{ code: "es", label: "Español" },
	{ code: "fr", label: "Français" },
	{ code: "it", label: "Italiano" },
	{ code: "tr", label: "Türkçe" },
	{ code: "pl", label: "Polski" },
	{ code: "ar", label: "العربية" },
	{ code: "custom", label: "Другой язык" },
];

const INTENTS: Array<{ value: AnswerIntent; label: string }> = [
	{ value: "general", label: "Общий вопрос" },
	{ value: "deposit", label: "Депозит" },
	{ value: "withdrawal", label: "Вывод средств" },
	{ value: "bonus", label: "Бонус" },
	{ value: "verification", label: "Верификация" },
	{ value: "technical", label: "Техническая проблема" },
	{ value: "sports-betting", label: "Спортивная ставка" },
];

const TONES: Array<{ value: AnswerTone; label: string }> = [
	{ value: "friendly", label: "Мягко и с эмпатией" },
	{ value: "neutral", label: "Нейтрально" },
	{ value: "formal", label: "Формально" },
	{ value: "concise", label: "Кратко" },
];

function issueColor(severity: CheckIssue["severity"]) {
	if (severity === "error") return "border-red-500/30 bg-red-500/10";
	if (severity === "warning") return "border-amber-500/30 bg-amber-500/10";
	return "border-emerald-500/30 bg-emerald-500/10";
}

function getModeLabel(mode: "openai" | "gemini" | "free") {
	if (mode === "openai") return "OpenAI";
	if (mode === "gemini") return "Gemini";
	return "Бесплатный режим";
}

export function AnswerAssistantPage() {
	const { showToast } = useToast();
	const [data, setData] = useState(() => answerAssistantService.load());
	const [customerMessage, setCustomerMessage] = useState("");
	const [facts, setFacts] = useState("");
	const [answer, setAnswer] = useState("");
	const [issues, setIssues] = useState<CheckIssue[]>([]);
	const [resultLanguage, setResultLanguage] = useState("");
	const [mode, setMode] = useState<"openai" | "gemini" | "free">("free");
	const [warning, setWarning] = useState("");
	const [loading, setLoading] = useState(false);
	const [aiChecking, setAIChecking] = useState(false);
	const [aiOnline, setAIOnline] = useState<boolean>();
	const [aiModel, setAIModel] = useState("");
	const [aiProvider, setAIProvider] = useState("");
	const [customLanguage, setCustomLanguage] = useState("");
	const [glossarySource, setGlossarySource] = useState("");
	const [glossaryTarget, setGlossaryTarget] = useState("");
	const settings = data.settings;
	const languageIsPreset = LANGUAGES.some(
		(item) => item.code !== "custom" && item.code === settings.language,
	);

	useEffect(() => {
		answerAssistantService.save(data);
	}, [data]);

	useEffect(() => {
		if (!languageIsPreset && settings.language && !customLanguage) {
			setCustomLanguage(settings.language);
		}
	}, [customLanguage, languageIsPreset, settings.language]);

	const updateSettings = (patch: Partial<AssistantSettings>) => {
		setData((current) => ({
			...current,
			settings: { ...current.settings, ...patch },
		}));
	};

	const generate = async (event?: FormEvent) => {
		event?.preventDefault();
		if (!customerMessage.trim()) return;

		setLoading(true);
		setWarning("");
		setIssues([]);

		try {
			const result = await answerAssistantService.generateReadyAnswer({
				customerMessage,
				context: facts,
				settings,
				glossary: data.glossary,
				memory: data.memory,
			});

			setAnswer(result.answer);
			setIssues(result.issues);
			setResultLanguage(result.language);
			setMode(result.mode);
			setWarning(result.warning ?? "");
			showToast("Ответ готов");
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Не удалось создать ответ",
			);
		} finally {
			setLoading(false);
		}
	};

	const copyAnswer = async () => {
		const copied = await copyToClipboard(answer);
		showToast(copied ? "Ответ скопирован" : "Не удалось скопировать");
	};

	const reset = () => {
		setCustomerMessage("");
		setFacts("");
		setAnswer("");
		setIssues([]);
		setWarning("");
		setResultLanguage("");
	};

	const saveAnswer = () => {
		if (!customerMessage.trim() || !answer.trim()) return;

		const entry = answerAssistantService.createMemoryEntry({
			source: customerMessage.trim(),
			target: answer.trim(),
			sourceLanguage: "auto",
			targetLanguage: resultLanguage || settings.language,
		});

		setData((current) => ({
			...current,
			memory: [entry, ...current.memory].slice(0, 200),
		}));
		showToast("Ответ сохранён в память");
	};

	const checkAI = async () => {
		setAIChecking(true);

		try {
			const status = await answerAssistantService.testAI();
			setAIOnline(true);
			setAIModel(status.model);
			setAIProvider(status.provider);
			showToast(`${status.provider === "openai" ? "OpenAI" : "Gemini"} настроен`);
		} catch (error) {
			setAIOnline(false);
			setAIModel("");
			setAIProvider("");
			showToast(error instanceof Error ? error.message : "AI не настроен");
		} finally {
			setAIChecking(false);
		}
	};

	const addGlossaryTerm = () => {
		if (!glossarySource.trim() || !glossaryTarget.trim()) return;

		const term = answerAssistantService.createGlossaryTerm({
			source: glossarySource.trim(),
			target: glossaryTarget.trim(),
			language: settings.language === "auto" ? "any" : settings.language,
		});

		setData((current) => ({
			...current,
			glossary: [term, ...current.glossary],
		}));
		setGlossarySource("");
		setGlossaryTarget("");
		showToast("Термин добавлен");
	};

	const removeGlossaryTerm = (id: string) => {
		setData((current) => ({
			...current,
			glossary: current.glossary.filter((term) => term.id !== id),
		}));
	};

	const removeMemoryEntry = (id: string) => {
		setData((current) => ({
			...current,
			memory: current.memory.filter((entry) => entry.id !== id),
		}));
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<div className="supportos-scroll mx-auto flex h-full w-full max-w-7xl flex-col gap-4 overflow-auto p-4 sm:p-6">
				<header className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold uppercase text-muted">
							<Sparkles size={14} />
							AI Assistant
						</div>
						<h1 className="mt-2 text-xl font-semibold sm:text-2xl">
							Готовый ответ клиенту
						</h1>
						<p className="mt-1 max-w-2xl text-sm text-muted">
							Дай краткое описание ситуации, а ассистент соберёт аккуратный
							полный ответ с правильным тоном и проверкой перед отправкой.
						</p>
					</div>

					<button
						type="button"
						onClick={reset}
						className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
					>
						<RefreshCw size={15} />
						Новый ответ
					</button>
				</header>

				<form
					onSubmit={generate}
					className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(18rem,22rem)]"
				>
					<section className="flex min-h-[34rem] flex-col rounded-xl border border-border bg-surface">
						<div className="border-b border-border px-4 py-3">
							<div className="text-sm font-semibold">Краткое описание</div>
							<div className="mt-1 text-xs text-muted">
								Можно писать коротко: что случилось и что нужно сообщить.
							</div>
						</div>

						<div className="flex flex-1 flex-col gap-3 p-4">
							<label className="flex flex-1 flex-col gap-2">
								<span className="text-xs font-semibold uppercase text-muted">
									Сообщение или задача
								</span>
								<textarea
									value={customerMessage}
									onChange={(event) => setCustomerMessage(event.target.value)}
									className="supportos-scroll min-h-48 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									placeholder="Например: клиент спрашивает, почему вывод ещё в обработке. Нужно объяснить, что заявка проверяется финансовым отделом."
								/>
							</label>

							<label className="flex flex-col gap-2">
								<span className="text-xs font-semibold uppercase text-muted">
									Проверенные факты
								</span>
								<textarea
									value={facts}
									onChange={(event) => setFacts(event.target.value)}
									className="supportos-scroll min-h-28 resize-y rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									placeholder="Срок: до 3 рабочих дней. Обещать точное время нельзя. Нужно попросить дождаться обновления."
								/>
							</label>

							<div className="grid gap-3 sm:grid-cols-2">
								<label className="space-y-1.5">
									<span className="text-xs font-semibold uppercase text-muted">
										Язык ответа
									</span>
									<select
										value={languageIsPreset ? settings.language : "custom"}
										onChange={(event) => {
											if (event.target.value === "custom") {
												updateSettings({ language: customLanguage || "" });
												return;
											}
											updateSettings({ language: event.target.value });
										}}
										className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									>
										{LANGUAGES.map((language) => (
											<option key={language.code} value={language.code}>
												{language.label}
											</option>
										))}
									</select>
								</label>

								<label className="space-y-1.5">
									<span className="text-xs font-semibold uppercase text-muted">
										Тон
									</span>
									<select
										value={settings.tone}
										onChange={(event) =>
											updateSettings({
												tone: event.target.value as AnswerTone,
											})
										}
										className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									>
										{TONES.map((tone) => (
											<option key={tone.value} value={tone.value}>
												{tone.label}
											</option>
										))}
									</select>
								</label>
							</div>

							{!languageIsPreset && (
								<label className="space-y-1.5">
									<span className="text-xs font-semibold uppercase text-muted">
										Код языка
									</span>
									<input
										value={customLanguage}
										onChange={(event) => {
											setCustomLanguage(event.target.value);
											updateSettings({ language: event.target.value });
										}}
										placeholder="Например: ro, bg, ka"
										className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									/>
								</label>
							)}

							<button
								type="submit"
								disabled={loading || !customerMessage.trim()}
								className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{loading ? (
									<Loader2 size={18} className="animate-spin" />
								) : (
									<Sparkles size={18} />
								)}
								{loading ? "Создаю ответ..." : "Создать готовый ответ"}
							</button>
						</div>
					</section>

					<section className="flex min-h-[34rem] flex-col rounded-xl border border-border bg-surface">
						<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
							<div className="min-w-0">
								<div className="text-sm font-semibold">Готовый ответ</div>
								<div className="mt-1 text-xs text-muted">
									{answer
										? `${resultLanguage.toUpperCase()} / ${getModeLabel(mode)}`
										: "Здесь появится текст для отправки клиенту."}
								</div>
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={saveAnswer}
									disabled={!answer.trim()}
									className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
									aria-label="Сохранить ответ в память"
								>
									<Save size={16} />
								</button>
								<button
									type="button"
									onClick={() => void copyAnswer()}
									disabled={!answer.trim()}
									className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
								>
									<Copy size={16} />
									Копировать
								</button>
							</div>
						</div>

						<div className="flex flex-1 flex-col p-4">
							<textarea
								value={answer}
								onChange={(event) => setAnswer(event.target.value)}
								className="supportos-scroll min-h-80 flex-1 resize-none rounded-lg border border-border bg-background px-4 py-4 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
								placeholder="Ответ ещё не создан."
							/>

							{warning && (
								<div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
									{warning}
								</div>
							)}

							{issues.length > 0 && answer && (
								<div className="mt-3 grid gap-2">
									{issues.map((issue) => (
										<div
											key={issue.id}
											className={`rounded-lg border px-3 py-2 text-xs ${issueColor(
												issue.severity,
											)}`}
										>
											<div className="font-semibold">{issue.title}</div>
											<div className="mt-0.5 text-muted">{issue.detail}</div>
										</div>
									))}
								</div>
							)}
						</div>
					</section>

					<aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
						<section className="rounded-xl border border-border bg-surface">
							<div className="flex items-center gap-2 border-b border-border px-4 py-3">
								<Settings2 size={17} />
								<div className="font-semibold">Параметры</div>
							</div>
							<div className="space-y-3 p-4">
								<label className="block space-y-1.5">
									<span className="text-xs font-semibold uppercase text-muted">
										Тип вопроса
									</span>
									<select
										value={settings.intent}
										onChange={(event) =>
											updateSettings({
												intent: event.target.value as AnswerIntent,
											})
										}
										className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									>
										{INTENTS.map((intent) => (
											<option key={intent.value} value={intent.value}>
												{intent.label}
											</option>
										))}
									</select>
								</label>

								<label className="block space-y-1.5">
									<span className="text-xs font-semibold uppercase text-muted">
										Проект
									</span>
									<input
										value={settings.product}
										onChange={(event) =>
											updateSettings({ product: event.target.value })
										}
										className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
										placeholder="SupportOS"
									/>
								</label>

								<div className="rounded-lg bg-background p-3">
									<div className="mb-3 flex items-center justify-between gap-3">
										<div className="flex items-center gap-2 text-sm font-semibold">
											<Bot size={16} />
											AI provider
										</div>
										<button
											type="button"
											onClick={() =>
												updateSettings({
													aiEnabled: !settings.aiEnabled,
												})
											}
											className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
											settings.aiEnabled
													? "border-accent bg-accent/10 text-accent"
													: "border-border text-muted"
											}`}
										>
										{settings.aiEnabled ? "Включён" : "Выключен"}
										</button>
									</div>

									<div className="text-xs leading-5 text-muted">
										Без ключа ассистент использует бесплатный локальный шаблон.
										{aiModel
											? ` ${aiProvider === "openai" ? "OpenAI" : "Gemini"}: ${aiModel}.`
											: ""}
									</div>
									<button
										type="button"
									onClick={() => void checkAI()}
									disabled={aiChecking}
										className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm hover:bg-surface-elevated disabled:opacity-60"
									>
									{aiChecking ? (
											<Loader2 size={15} className="animate-spin" />
									) : aiOnline ? (
											<Wifi size={15} />
										) : (
											<WifiOff size={15} />
										)}
										Проверить
									</button>
								</div>
							</div>
						</section>

						<section className="rounded-xl border border-border bg-surface">
							<div className="flex items-center gap-2 border-b border-border px-4 py-3">
								<Languages size={17} />
								<div className="font-semibold">Словарь</div>
							</div>
							<div className="space-y-3 p-4">
								<div className="grid gap-2">
									<input
										value={glossarySource}
										onChange={(event) => setGlossarySource(event.target.value)}
										placeholder="Термин"
										className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									/>
									<input
										value={glossaryTarget}
										onChange={(event) => setGlossaryTarget(event.target.value)}
										placeholder="Как писать в ответе"
										className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									/>
								</div>
								<button
									type="button"
									onClick={addGlossaryTerm}
									className="h-10 w-full rounded-lg border border-border text-sm hover:bg-surface-elevated"
								>
									Добавить термин
								</button>

								<div className="supportos-scroll max-h-44 space-y-1 overflow-auto">
									{data.glossary.length > 0 ? (
										data.glossary.map((term) => (
											<div
												key={term.id}
												className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-xs"
											>
												<span className="min-w-0 truncate">
													{term.source} → {term.target}
												</span>
												<button
													type="button"
													onClick={() => removeGlossaryTerm(term.id)}
													className="shrink-0 text-muted hover:text-red-300"
													aria-label="Удалить термин"
												>
													<Trash2 size={14} />
												</button>
											</div>
										))
									) : (
										<div className="py-4 text-center text-xs text-muted">
											Словарь пуст
										</div>
									)}
								</div>
							</div>
						</section>

						<section className="rounded-xl border border-border bg-surface">
							<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
								<div>
									<div className="font-semibold">Память ответов</div>
									<div className="text-xs text-muted">
										Сохранено: {data.memory.length}
									</div>
								</div>
								<CheckCircle2 size={18} className="text-emerald-400" />
							</div>

							<div className="supportos-scroll max-h-56 space-y-1 overflow-auto p-4">
								{data.memory.length > 0 ? (
									data.memory.slice(0, 10).map((entry) => (
										<div
											key={entry.id}
											className="flex items-start justify-between gap-3 rounded-lg bg-background px-3 py-2 text-xs"
										>
											<div className="min-w-0">
												<div className="truncate font-medium">
													{entry.source}
												</div>
												<div className="mt-1 truncate text-muted">
													{entry.target}
												</div>
											</div>
											<button
												type="button"
												onClick={() => removeMemoryEntry(entry.id)}
												className="shrink-0 text-muted hover:text-red-300"
												aria-label="Удалить сохранённый ответ"
											>
												<Trash2 size={14} />
											</button>
										</div>
									))
								) : (
									<div className="py-4 text-center text-xs text-muted">
										Пока нет сохранённых ответов
									</div>
								)}
							</div>
						</section>
					</aside>
				</form>
			</div>
		</div>
	);
}
