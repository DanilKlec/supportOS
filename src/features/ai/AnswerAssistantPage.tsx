import {
	Bot,
	CheckCircle2,
	ChevronDown,
	Copy,
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
	{ code: "auto", label: "Как у клиента (автоматически)" },
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
	{ code: "custom", label: "Другой язык…" },
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

export function AnswerAssistantPage() {
	const { showToast } = useToast();
	const [data, setData] = useState(() => answerAssistantService.load());
	const [customerMessage, setCustomerMessage] = useState("");
	const [facts, setFacts] = useState("");
	const [answer, setAnswer] = useState("");
	const [issues, setIssues] = useState<CheckIssue[]>([]);
	const [resultLanguage, setResultLanguage] = useState("");
	const [mode, setMode] = useState<"ollama" | "free">("free");
	const [warning, setWarning] = useState("");
	const [loading, setLoading] = useState(false);
	const [ollamaChecking, setOllamaChecking] = useState(false);
	const [ollamaOnline, setOllamaOnline] = useState<boolean>();
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

	const checkOllama = async () => {
		setOllamaChecking(true);

		try {
			await answerAssistantService.testOllama(settings);
			setOllamaOnline(true);
			showToast("Ollama подключена");
		} catch (error) {
			setOllamaOnline(false);
			showToast(error instanceof Error ? error.message : "Ollama недоступна");
		} finally {
			setOllamaChecking(false);
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

	return (
		<div className="supportos-scroll h-full overflow-auto bg-background">
			<div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
				<header className="mb-5 flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="mb-2 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
							<Sparkles size={14} />
							Помощник оператора
						</div>
						<h1 className="text-2xl font-bold">Создание ответа клиенту</h1>
						<p className="mt-1 text-sm text-muted">
							Вставьте сообщение, укажите известные факты и получите готовый
							ответ на языке клиента.
						</p>
					</div>

					<button
						type="button"
						onClick={reset}
						className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface hover:text-foreground"
					>
						<RefreshCw size={15} />
						Новый ответ
					</button>
				</header>

				<form onSubmit={generate} className="grid gap-5 lg:grid-cols-2">
					<section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
						<div className="flex items-center gap-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">
								1
							</div>
							<div>
								<h2 className="font-semibold">Что написал клиент?</h2>
								<p className="text-xs text-muted">
									Можно вставить сообщение на любом языке.
								</p>
							</div>
						</div>

						<textarea
							value={customerMessage}
							onChange={(event) => setCustomerMessage(event.target.value)}
							className="supportos-scroll min-h-52 w-full resize-y rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="Например: клиент спрашивает, почему вывод всё ещё обрабатывается…"
						/>

						<div>
							<label
								htmlFor="answer-facts"
								className="mb-2 block text-sm font-semibold"
							>
								Что нужно сообщить в ответе?
							</label>
							<textarea
								id="answer-facts"
								value={facts}
								onChange={(event) => setFacts(event.target.value)}
								className="supportos-scroll min-h-32 w-full resize-y rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								placeholder="Кратко: запрос проверяется финансовым отделом, срок — до 3 рабочих дней, результат обещать нельзя."
							/>
							<p className="mt-2 text-xs text-muted">
								Помощник не должен придумывать статусы, правила или сроки —
								укажите только подтверждённые факты.
							</p>
						</div>

						<div className="grid gap-3 sm:grid-cols-2">
							<label className="space-y-1.5">
								<span className="text-xs font-semibold uppercase tracking-wide text-muted">
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
									className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
								>
									{LANGUAGES.map((language) => (
										<option key={language.code} value={language.code}>
											{language.label}
										</option>
									))}
								</select>
							</label>

							<label className="space-y-1.5">
								<span className="text-xs font-semibold uppercase tracking-wide text-muted">
									Тон
								</span>
								<select
									value={settings.tone}
									onChange={(event) =>
										updateSettings({
											tone: event.target.value as AnswerTone,
										})
									}
									className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
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
							<label className="block space-y-1.5">
								<span className="text-xs font-semibold uppercase tracking-wide text-muted">
									Код языка
								</span>
								<input
									value={customLanguage}
									onChange={(event) => {
										setCustomLanguage(event.target.value);
										updateSettings({ language: event.target.value });
									}}
									placeholder="Например: ro, bg, ka"
									className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent"
								/>
							</label>
						)}

						<button
							type="submit"
							disabled={loading || !customerMessage.trim()}
							className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-bold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{loading ? (
								<Loader2 size={18} className="animate-spin" />
							) : (
								<Sparkles size={18} />
							)}
							{loading ? "Создаю ответ…" : "Создать готовый ответ"}
						</button>
					</section>

					<section className="flex min-h-[32rem] flex-col rounded-xl border border-border bg-surface p-4 sm:p-5">
						<div className="mb-4 flex items-center gap-3">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">
								2
							</div>
							<div>
								<h2 className="font-semibold">Готовый ответ</h2>
								<p className="text-xs text-muted">
									{answer
										? `${resultLanguage.toUpperCase()} · ${
												mode === "ollama" ? "Ollama" : "Бесплатный режим"
											}`
										: "Здесь появится текст для отправки клиенту."}
								</p>
							</div>
						</div>

						<textarea
							value={answer}
							onChange={(event) => setAnswer(event.target.value)}
							className="supportos-scroll min-h-72 flex-1 resize-none rounded-lg border border-border bg-background px-4 py-4 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="Ответ ещё не создан."
						/>

						{warning && (
							<div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
								{warning}
							</div>
						)}

						{issues.length > 0 && answer && (
							<div className="mt-3 space-y-2">
								{issues.map((issue) => (
									<div
										key={issue.id}
										className={`rounded-md border px-3 py-2 text-xs ${issueColor(
											issue.severity,
										)}`}
									>
										<div className="font-semibold">{issue.title}</div>
										<div className="mt-0.5 text-muted">{issue.detail}</div>
									</div>
								))}
							</div>
						)}

						<div className="mt-4 grid gap-2 sm:grid-cols-2">
							<button
								type="button"
								onClick={saveAnswer}
								disabled={!answer.trim()}
								className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-surface-elevated disabled:opacity-50"
							>
								<Save size={16} />
								Запомнить ответ
							</button>
							<button
								type="button"
								onClick={() => void copyAnswer()}
								disabled={!answer.trim()}
								className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
							>
								<Copy size={16} />
								Скопировать
							</button>
						</div>
					</section>
				</form>

				<details className="group mt-5 rounded-xl border border-border bg-surface">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
						<div className="flex items-center gap-3">
							<Settings2 size={18} />
							<div>
								<div className="font-semibold">Дополнительные настройки</div>
								<div className="text-xs text-muted">
									Тип вопроса, Ollama, словарь и память ответов
								</div>
							</div>
						</div>
						<ChevronDown
							size={18}
							className="transition group-open:rotate-180"
						/>
					</summary>

					<div className="grid gap-5 border-t border-border p-4 lg:grid-cols-2">
						<div className="space-y-4">
							<label className="block space-y-1.5">
								<span className="text-sm font-semibold">Тип вопроса</span>
								<select
									value={settings.intent}
									onChange={(event) =>
										updateSettings({
											intent: event.target.value as AnswerIntent,
										})
									}
									className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
								>
									{INTENTS.map((intent) => (
										<option key={intent.value} value={intent.value}>
											{intent.label}
										</option>
									))}
								</select>
							</label>

							<label className="block space-y-1.5">
								<span className="text-sm font-semibold">Проект</span>
								<input
									value={settings.product}
									onChange={(event) =>
										updateSettings({ product: event.target.value })
									}
									className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
									placeholder="SupportOS"
								/>
							</label>

							<div className="rounded-lg border border-border bg-background p-4">
								<div className="mb-3 flex items-center justify-between gap-3">
									<div className="flex items-center gap-2 font-semibold">
										<Bot size={17} />
										Локальный ИИ Ollama
									</div>
									<button
										type="button"
										onClick={() =>
											updateSettings({
												ollamaEnabled: !settings.ollamaEnabled,
											})
										}
										className={`rounded-full border px-3 py-1 text-xs font-semibold ${
											settings.ollamaEnabled
												? "border-accent bg-accent/10 text-accent"
												: "border-border text-muted"
										}`}
									>
										{settings.ollamaEnabled ? "Включена" : "Выключена"}
									</button>
								</div>

								<div className="space-y-2">
									<input
										value={settings.ollamaEndpoint}
										onChange={(event) =>
											updateSettings({ ollamaEndpoint: event.target.value })
										}
										className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
										placeholder="http://localhost:11434"
									/>
									<input
										value={settings.ollamaModel}
										onChange={(event) =>
											updateSettings({ ollamaModel: event.target.value })
										}
										className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
										placeholder="llama3.1:8b"
									/>
									<button
										type="button"
										onClick={() => void checkOllama()}
										disabled={ollamaChecking}
										className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border text-sm hover:bg-surface-elevated"
									>
										{ollamaChecking ? (
											<Loader2 size={15} className="animate-spin" />
										) : ollamaOnline ? (
											<Wifi size={15} />
										) : (
											<WifiOff size={15} />
										)}
										Проверить подключение
									</button>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="rounded-lg border border-border bg-background p-4">
								<div className="mb-3 font-semibold">Словарь терминов</div>
								<div className="grid gap-2 sm:grid-cols-2">
									<input
										value={glossarySource}
										onChange={(event) => setGlossarySource(event.target.value)}
										placeholder="Исходный термин"
										className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
									/>
									<input
										value={glossaryTarget}
										onChange={(event) => setGlossaryTarget(event.target.value)}
										placeholder="Как писать в ответе"
										className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
									/>
								</div>
								<button
									type="button"
									onClick={addGlossaryTerm}
									className="mt-2 h-10 w-full rounded-md border border-border text-sm hover:bg-surface-elevated"
								>
									Добавить термин
								</button>
								<div className="supportos-scroll mt-3 max-h-44 space-y-2 overflow-auto">
									{data.glossary.map((term) => (
										<div
											key={term.id}
											className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-xs"
										>
											<span className="min-w-0 truncate">
												{term.source} → {term.target}
											</span>
											<button
												type="button"
												onClick={() =>
													setData((current) => ({
														...current,
														glossary: current.glossary.filter(
															(item) => item.id !== term.id,
														),
													}))
												}
												className="text-muted hover:text-red-300"
											>
												<Trash2 size={14} />
											</button>
										</div>
									))}
								</div>
							</div>

							<div className="rounded-lg border border-border bg-background p-4">
								<div className="flex items-center justify-between gap-3">
									<div>
										<div className="font-semibold">Память ответов</div>
										<div className="text-xs text-muted">
											Сохранено: {data.memory.length}
										</div>
									</div>
									<CheckCircle2 size={18} className="text-emerald-400" />
								</div>
								{data.memory.length > 0 && (
									<div className="supportos-scroll mt-3 max-h-44 space-y-2 overflow-auto">
										{data.memory.slice(0, 10).map((entry) => (
											<div
												key={entry.id}
												className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-xs"
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
													onClick={() =>
														setData((current) => ({
															...current,
															memory: current.memory.filter(
																(item) => item.id !== entry.id,
															),
														}))
													}
													className="shrink-0 text-muted hover:text-red-300"
												>
													<Trash2 size={14} />
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				</details>
			</div>
		</div>
	);
}
