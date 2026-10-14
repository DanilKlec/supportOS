import { Link } from "@tanstack/react-router";
import {
	Bot,
	Copy,
	Languages,
	Loader2,
	RefreshCw,
	Settings2,
	Sparkles,
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
import { useTeamGlossary } from "@/services/team-glossary.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";

const LANGUAGES = [
	{ code: "auto", label: "Как у клиента" },
	{ code: "ru", label: "Русский" },
	{ code: "en", label: "Английский" },
	{ code: "el", label: "Греческий" },
	{ code: "de", label: "Немецкий" },
	{ code: "uk", label: "Украинский" },
	{ code: "pt", label: "Португальский" },
	{ code: "es", label: "Испанский" },
	{ code: "fr", label: "Французский" },
	{ code: "it", label: "Итальянский" },
	{ code: "tr", label: "Турецкий" },
	{ code: "pl", label: "Польский" },
	{ code: "ar", label: "Арабский" },
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

export function AnswerAssistantPage({
	settingsOnly = false,
}: {
	settingsOnly?: boolean;
} = {}) {
	const { showToast } = useToast();
	const glossary = useTeamGlossary();
	const access = useAuthStore((state) => state.session?.user.access);
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

	const checkAI = async () => {
		setAIChecking(true);

		try {
			const status = await answerAssistantService.testAI();
			setAIOnline(true);
			setAIModel(status.model);
			setAIProvider(status.provider);
			showToast(
				`${status.provider === "openai" ? "OpenAI" : "Gemini"} настроен`,
			);
		} catch (error) {
			setAIOnline(false);
			setAIModel("");
			setAIProvider("");
			showToast(error instanceof Error ? error.message : "AI не настроен");
		} finally {
			setAIChecking(false);
		}
	};

	return (
		<div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
			<div className="supportos-page-scroll flex min-h-0 w-full flex-1 flex-col gap-4 overflow-auto py-4 sm:py-6">
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
						className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border bg-surface text-muted hover:bg-surface-elevated hover:text-foreground"
					>
						<RefreshCw size={15} />
						Новый ответ
					</button>
				</header>

				<form
					data-settings-only={settingsOnly}
					onSubmit={generate}
					className="grid min-h-0 min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(18rem,22rem)]"
				>
					<section
						hidden={settingsOnly}
						className="flex min-h-[34rem] min-w-0 flex-col rounded-xl border border-border bg-surface"
					>
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
									className="ui-input supportos-scroll min-h-48 flex-1 resize-none border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
									className="ui-input supportos-scroll min-h-28 resize-y border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									placeholder="Срок: до 3 рабочих дней. Обещать точное время нельзя. Нужно попросить дождаться обновления."
								/>
							</label>

							<div className="grid gap-3 sm:grid-cols-2">
								<label className="ui-field ">
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
										className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									>
										{LANGUAGES.map((language) => (
											<option key={language.code} value={language.code}>
												{language.label}
											</option>
										))}
									</select>
								</label>

								<label className="ui-field ">
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
										className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
								<label className="ui-field ">
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
										className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									/>
								</label>
							)}

							<button
								type="submit"
								disabled={loading || !customerMessage.trim()}
								className="ui-button ui-button--primary inline-flex w-full items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
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

					<section
						hidden={settingsOnly}
						className="flex min-h-[34rem] min-w-0 flex-col rounded-xl border border-border bg-surface"
					>
						<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
							<div className="min-w-0">
								<div className="text-sm font-semibold">Готовый ответ</div>
								<div className="mt-1 text-xs text-muted">
									{answer
										? `${resultLanguage.toUpperCase()} / ${getModeLabel(mode)}`
										: "Здесь появится текст для отправки клиенту."}
								</div>
							</div>
							<div className="ui-actions items-center flex  gap-2">
								<button
									type="button"
									onClick={() => void copyAnswer()}
									disabled={!answer.trim()}
									className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
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
								className="ui-input supportos-scroll min-h-80 flex-1 resize-none border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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

					<aside className="min-w-0 space-y-3 xl:sticky xl:top-0 xl:self-start">
						<section className="rounded-xl border border-border bg-surface">
							<div className="flex items-center gap-2 border-b border-border px-4 py-3">
								<Settings2 size={17} />
								<div className="font-semibold">Параметры</div>
							</div>
							<div className="space-y-3 p-4">
								<label className="ui-field ">
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
										className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									>
										{INTENTS.map((intent) => (
											<option key={intent.value} value={intent.value}>
												{intent.label}
											</option>
										))}
									</select>
								</label>

								<label className="ui-field ">
									<span className="text-xs font-semibold uppercase text-muted">
										Проект
									</span>
									<input
										value={settings.product}
										onChange={(event) =>
											updateSettings({ product: event.target.value })
										}
										className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
										className="ui-button ui-button--secondary mt-3 inline-flex w-full items-center justify-center gap-2 border border-border hover:bg-surface-elevated disabled:opacity-60"
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
							<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
								<div className="flex items-center gap-2 font-semibold">
									<Languages size={17} /> Командный глоссарий
								</div>
								{canAccessPage(access, "/qc", "glossary") && (
									<Link to="/qc" hash="glossary" className="ui-button">
										Управлять
									</Link>
								)}
							</div>
							<div className="supportos-scroll max-h-56 space-y-1 overflow-auto p-4 text-xs">
								{glossary.isPending ? (
									<p>Загрузка…</p>
								) : glossary.error ? (
									<p role="alert">{glossary.error.message}</p>
								) : glossary.data?.length ? (
									glossary.data.map((term) => (
										<div
											key={term.id}
											className="rounded-lg bg-background px-3 py-2"
										>
											{term.source} → {term.target}
										</div>
									))
								) : (
									<p className="text-muted">Опубликованных терминов пока нет</p>
								)}
							</div>
						</section>
					</aside>
				</form>
			</div>
		</div>
	);
}
