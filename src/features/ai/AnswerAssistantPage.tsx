import {
	Bot,
	Copy,
	Database,
	Globe2,
	Languages,
	Loader2,
	Plus,
	RefreshCw,
	Save,
	Search,
	ShieldCheck,
	Trash2,
	Wand2,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
	type AnswerIntent,
	type AnswerTone,
	type AssistantSettings,
	answerAssistantService,
	type CheckIssue,
	findMemoryMatches,
} from "@/services/answer-assistant.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";

const INTENTS: Array<{ value: AnswerIntent; label: string }> = [
	{ value: "general", label: "General" },
	{ value: "deposit", label: "Deposit" },
	{ value: "withdrawal", label: "Withdrawal" },
	{ value: "bonus", label: "Bonus" },
	{ value: "verification", label: "Verification" },
	{ value: "technical", label: "Technical" },
	{ value: "sports-betting", label: "Sports betting" },
];

const TONES: Array<{ value: AnswerTone; label: string }> = [
	{ value: "friendly", label: "Friendly" },
	{ value: "neutral", label: "Neutral" },
	{ value: "formal", label: "Formal" },
	{ value: "concise", label: "Concise" },
];

const LANGUAGE_PRESETS = [
	{ code: "en", label: "English" },
	{ code: "ru", label: "Russian" },
	{ code: "de", label: "German" },
	{ code: "pt", label: "Portuguese" },
	{ code: "el", label: "Greek" },
	{ code: "es", label: "Spanish" },
	{ code: "fr", label: "French" },
	{ code: "it", label: "Italian" },
	{ code: "tr", label: "Turkish" },
	{ code: "pl", label: "Polish" },
	{ code: "uk", label: "Ukrainian" },
	{ code: "ar", label: "Arabic" },
];

const EMPTY_GLOSSARY_DRAFT = {
	source: "",
	target: "",
	language: "en",
	note: "",
};

function getIssueClass(severity: CheckIssue["severity"]) {
	if (severity === "error")
		return "border-red-500/30 bg-red-500/10 text-red-200";
	if (severity === "warning") {
		return "border-amber-500/30 bg-amber-500/10 text-amber-100";
	}

	return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function formatScore(score: number) {
	return `${Math.round(score * 100)}%`;
}

function formatDate(value: string) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

export function AnswerAssistantPage() {
	const { showToast } = useToast();
	const [data, setData] = useState(() => answerAssistantService.load());
	const [customerMessage, setCustomerMessage] = useState("");
	const [context, setContext] = useState("");
	const [answer, setAnswer] = useState("");
	const [translatedAnswer, setTranslatedAnswer] = useState("");
	const [issues, setIssues] = useState<CheckIssue[]>([]);
	const [glossaryDraft, setGlossaryDraft] = useState(EMPTY_GLOSSARY_DRAFT);
	const [memorySearch, setMemorySearch] = useState("");
	const [glossarySearch, setGlossarySearch] = useState("");
	const [loading, setLoading] = useState<
		"generate" | "translate" | "check" | undefined
	>();
	const settings = data.settings;

	useEffect(() => {
		answerAssistantService.save(data);
	}, [data]);

	const updateSettings = (patch: Partial<AssistantSettings>) => {
		setData((current) => ({
			...current,
			settings: {
				...current.settings,
				...patch,
			},
		}));
	};

	const memoryMatches = useMemo(
		() => findMemoryMatches(customerMessage, data.memory).slice(0, 5),
		[customerMessage, data.memory],
	);
	const visibleMemory = useMemo(() => {
		const query = memorySearch.trim().toLowerCase();

		if (!query) return data.memory.slice(0, 8);

		return data.memory
			.filter((entry) =>
				`${entry.source} ${entry.target} ${entry.targetLanguage}`
					.toLowerCase()
					.includes(query),
			)
			.slice(0, 8);
	}, [data.memory, memorySearch]);
	const visibleGlossary = useMemo(() => {
		const query = glossarySearch.trim().toLowerCase();

		return data.glossary.filter((term) => {
			if (!query) return true;

			return `${term.source} ${term.target} ${term.language} ${term.note ?? ""}`
				.toLowerCase()
				.includes(query);
		});
	}, [data.glossary, glossarySearch]);

	const generateAnswer = async (event?: FormEvent) => {
		event?.preventDefault();
		setLoading("generate");
		setIssues([]);

		try {
			const nextAnswer = await answerAssistantService.generateAnswer({
				customerMessage,
				context,
				settings,
				glossary: data.glossary,
				memory: data.memory,
			});

			setAnswer(nextAnswer);
			setTranslatedAnswer("");
			showToast(
				settings.ollamaEnabled
					? "Answer generated with Ollama"
					: "Free draft generated",
			);
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Generation failed");
		} finally {
			setLoading(undefined);
		}
	};

	const translateAnswer = async () => {
		setLoading("translate");

		try {
			const result = await answerAssistantService.translateAnswer({
				text: answer,
				toLanguage: settings.language,
				glossary: data.glossary,
			});

			setTranslatedAnswer(result);
			showToast(`Translated to ${settings.language.toUpperCase()}`);
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Translation failed");
		} finally {
			setLoading(undefined);
		}
	};

	const checkAnswer = () => {
		setLoading("check");
		const nextIssues = answerAssistantService.checkAnswer({
			answer: translatedAnswer || answer,
			customerMessage,
			glossary: data.glossary,
			language: settings.language,
		});

		setIssues(nextIssues);
		setLoading(undefined);
		showToast("Answer checked");
	};

	const saveToMemory = () => {
		const target = translatedAnswer || answer;

		if (!customerMessage.trim() || !target.trim()) {
			showToast("Customer message and answer are required");
			return;
		}

		const entry = answerAssistantService.createMemoryEntry({
			source: customerMessage.trim(),
			target: target.trim(),
			sourceLanguage: "auto",
			targetLanguage: settings.language,
		});

		setData((current) => ({
			...current,
			memory: [entry, ...current.memory].slice(0, 200),
		}));
		showToast("Saved to Translation Memory");
	};

	const addGlossaryTerm = () => {
		const source = glossaryDraft.source.trim();
		const target = glossaryDraft.target.trim();

		if (!source || !target) {
			showToast("Glossary source and target are required");
			return;
		}

		const term = answerAssistantService.createGlossaryTerm({
			source,
			target,
			language: glossaryDraft.language.trim() || "any",
			note: glossaryDraft.note.trim(),
		});

		setData((current) => ({
			...current,
			glossary: [term, ...current.glossary],
		}));
		setGlossaryDraft(EMPTY_GLOSSARY_DRAFT);
		showToast("Glossary term added");
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

	const copyAnswer = async (value: string) => {
		if (!value.trim()) return;

		const copied = await copyToClipboard(value);
		showToast(copied ? "Answer copied" : "Copy failed");
	};

	return (
		<div className="supportos-scroll flex h-full flex-col overflow-auto bg-background">
			<form
				onSubmit={generateAnswer}
				className="mx-auto grid w-full max-w-7xl flex-1 gap-5 p-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)_minmax(18rem,24rem)]"
			>
				<section className="space-y-4">
					<div>
						<div className="mb-2 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
							<Bot size={14} />
							Local AI workspace
						</div>
						<h1 className="text-2xl font-bold">Answer Assistant</h1>
						<p className="mt-1 text-sm text-muted">
							Free drafts, translation, memory, glossary, checks, and optional
							Ollama.
						</p>
					</div>

					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
							<Wand2 size={16} />
							Generation
						</div>
						<div className="space-y-3">
							<label className="block space-y-1.5">
								<span className="text-xs font-semibold uppercase tracking-wide text-muted">
									Product
								</span>
								<input
									value={settings.product}
									onChange={(event) =>
										updateSettings({ product: event.target.value })
									}
									className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Project or brand"
								/>
							</label>

							<div className="grid gap-3 sm:grid-cols-2">
								<label className="block space-y-1.5">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted">
										Intent
									</span>
									<select
										value={settings.intent}
										onChange={(event) =>
											updateSettings({
												intent: event.target.value as AnswerIntent,
											})
										}
										className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									>
										{INTENTS.map((intent) => (
											<option key={intent.value} value={intent.value}>
												{intent.label}
											</option>
										))}
									</select>
								</label>

								<label className="block space-y-1.5">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted">
										Tone
									</span>
									<select
										value={settings.tone}
										onChange={(event) =>
											updateSettings({
												tone: event.target.value as AnswerTone,
											})
										}
										className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									>
										{TONES.map((tone) => (
											<option key={tone.value} value={tone.value}>
												{tone.label}
											</option>
										))}
									</select>
								</label>
							</div>

							<label className="block space-y-1.5">
								<span className="text-xs font-semibold uppercase tracking-wide text-muted">
									Answer language
								</span>
								<div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
									<select
										value={
											LANGUAGE_PRESETS.some(
												(language) => language.code === settings.language,
											)
												? settings.language
												: "__custom__"
										}
										onChange={(event) => {
											if (event.target.value !== "__custom__") {
												updateSettings({ language: event.target.value });
											}
										}}
										className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									>
										{LANGUAGE_PRESETS.map((language) => (
											<option key={language.code} value={language.code}>
												{language.label}
											</option>
										))}
										<option value="__custom__">Custom</option>
									</select>
									<input
										value={settings.language}
										onChange={(event) =>
											updateSettings({ language: event.target.value })
										}
										className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
										placeholder="en"
									/>
								</div>
							</label>
						</div>
					</div>

					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="mb-3 flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 text-sm font-semibold">
								<Bot size={16} />
								Ollama
							</div>
							<button
								type="button"
								onClick={() =>
									updateSettings({ ollamaEnabled: !settings.ollamaEnabled })
								}
								className={`rounded-md border px-2 py-1 text-xs font-semibold ${
									settings.ollamaEnabled
										? "border-accent bg-accent/10 text-accent"
										: "border-border text-muted"
								}`}
								aria-pressed={settings.ollamaEnabled}
							>
								{settings.ollamaEnabled ? "On" : "Off"}
							</button>
						</div>
						<div className="space-y-3">
							<input
								value={settings.ollamaEndpoint}
								onChange={(event) =>
									updateSettings({ ollamaEndpoint: event.target.value })
								}
								className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								placeholder="http://localhost:11434"
							/>
							<input
								value={settings.ollamaModel}
								onChange={(event) =>
									updateSettings({ ollamaModel: event.target.value })
								}
								className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								placeholder="llama3.1:8b"
							/>
							<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
								With Ollama off, generation uses the free local rule engine.
							</div>
						</div>
					</div>
				</section>

				<section className="flex min-h-0 flex-col gap-4">
					<div className="rounded-lg border border-border bg-surface">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
							<div className="font-semibold">Customer Input</div>
							<div className="text-xs text-muted">
								{memoryMatches.length} TM matches
							</div>
						</div>
						<div className="space-y-3 p-4">
							<textarea
								value={customerMessage}
								onChange={(event) => setCustomerMessage(event.target.value)}
								className="supportos-scroll min-h-36 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								placeholder="Paste the customer message..."
							/>
							<textarea
								value={context}
								onChange={(event) => setContext(event.target.value)}
								className="supportos-scroll min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								placeholder="Internal context: status, policy, known details..."
							/>
							<div className="flex flex-wrap justify-end gap-2">
								<button
									type="button"
									onClick={() => {
										setCustomerMessage("");
										setContext("");
										setAnswer("");
										setTranslatedAnswer("");
										setIssues([]);
									}}
									className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
								>
									<RefreshCw size={15} />
									Reset
								</button>
								<button
									type="submit"
									disabled={loading === "generate" || !customerMessage.trim()}
									className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{loading === "generate" ? (
										<Loader2 size={16} className="animate-spin" />
									) : (
										<Wand2 size={16} />
									)}
									Generate
								</button>
							</div>
						</div>
					</div>

					<div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
						<AnswerPanel
							title="Draft"
							value={answer}
							placeholder="Generated answer..."
							onChange={setAnswer}
							onCopy={() => void copyAnswer(answer)}
						/>
						<AnswerPanel
							title="Translated"
							value={translatedAnswer}
							placeholder="Translated answer..."
							onChange={setTranslatedAnswer}
							onCopy={() => void copyAnswer(translatedAnswer)}
						/>
					</div>

					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="flex flex-wrap justify-end gap-2">
							<button
								type="button"
								onClick={translateAnswer}
								disabled={loading === "translate" || !answer.trim()}
								className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
							>
								{loading === "translate" ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									<Languages size={16} />
								)}
								Translate
							</button>
							<button
								type="button"
								onClick={checkAnswer}
								disabled={
									loading === "check" ||
									(!answer.trim() && !translatedAnswer.trim())
								}
								className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
							>
								<ShieldCheck size={16} />
								Check
							</button>
							<button
								type="button"
								onClick={saveToMemory}
								disabled={
									!customerMessage.trim() ||
									(!answer.trim() && !translatedAnswer.trim())
								}
								className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<Save size={16} />
								Save TM
							</button>
						</div>

						{issues.length > 0 && (
							<div className="mt-4 grid gap-2 md:grid-cols-2">
								{issues.map((issue) => (
									<div
										key={issue.id}
										className={`rounded-md border px-3 py-2 text-sm ${getIssueClass(
											issue.severity,
										)}`}
									>
										<div className="font-semibold">{issue.title}</div>
										<div className="mt-1 text-xs opacity-85">
											{issue.detail}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</section>

				<section className="space-y-4">
					<div className="rounded-lg border border-border bg-surface">
						<div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
							<Database size={16} />
							Translation Memory
						</div>
						<div className="space-y-3 p-4">
							<div className="relative">
								<Search
									size={15}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
								/>
								<input
									value={memorySearch}
									onChange={(event) => setMemorySearch(event.target.value)}
									className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Search memory"
								/>
							</div>
							<div className="space-y-2">
								{memoryMatches.map((match) => (
									<button
										key={match.entry.id}
										type="button"
										onClick={() => setAnswer(match.entry.target)}
										className="w-full rounded-md border border-accent/30 bg-accent/10 p-2 text-left text-xs text-muted hover:bg-accent/15"
									>
										<div className="mb-1 font-semibold text-foreground">
											Match {formatScore(match.score)}
										</div>
										<div className="line-clamp-2">{match.entry.target}</div>
									</button>
								))}
							</div>
							<div className="max-h-72 space-y-2 overflow-auto pr-1">
								{visibleMemory.length > 0 ? (
									visibleMemory.map((entry) => (
										<div
											key={entry.id}
											className="rounded-md border border-border bg-background p-3 text-xs"
										>
											<div className="mb-2 flex items-center justify-between gap-2">
												<span className="text-muted">
													{entry.targetLanguage.toUpperCase()} -{" "}
													{formatDate(entry.createdAt)}
												</span>
												<button
													type="button"
													onClick={() => removeMemoryEntry(entry.id)}
													className="rounded p-1 text-muted hover:bg-surface-elevated hover:text-red-300"
													title="Remove memory entry"
												>
													<Trash2 size={13} />
												</button>
											</div>
											<div className="line-clamp-2 text-muted">
												{entry.source}
											</div>
											<div className="mt-2 line-clamp-3">{entry.target}</div>
										</div>
									))
								) : (
									<div className="rounded-md border border-border bg-background px-3 py-8 text-center text-sm text-muted">
										No memory entries yet
									</div>
								)}
							</div>
						</div>
					</div>

					<div className="rounded-lg border border-border bg-surface">
						<div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
							<Globe2 size={16} />
							Glossary
						</div>
						<div className="space-y-3 p-4">
							<div className="grid gap-2">
								<input
									value={glossaryDraft.source}
									onChange={(event) =>
										setGlossaryDraft((current) => ({
											...current,
											source: event.target.value,
										}))
									}
									className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Source term"
								/>
								<input
									value={glossaryDraft.target}
									onChange={(event) =>
										setGlossaryDraft((current) => ({
											...current,
											target: event.target.value,
										}))
									}
									className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Approved term"
								/>
								<div className="grid gap-2 sm:grid-cols-[5rem_1fr_auto]">
									<input
										value={glossaryDraft.language}
										onChange={(event) =>
											setGlossaryDraft((current) => ({
												...current,
												language: event.target.value,
											}))
										}
										className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
										placeholder="en"
									/>
									<input
										value={glossaryDraft.note}
										onChange={(event) =>
											setGlossaryDraft((current) => ({
												...current,
												note: event.target.value,
											}))
										}
										className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
										placeholder="Note"
									/>
									<button
										type="button"
										onClick={addGlossaryTerm}
										className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
									>
										<Plus size={15} />
										Add
									</button>
								</div>
							</div>

							<div className="relative">
								<Search
									size={15}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
								/>
								<input
									value={glossarySearch}
									onChange={(event) => setGlossarySearch(event.target.value)}
									className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Search glossary"
								/>
							</div>

							<div className="max-h-72 space-y-2 overflow-auto pr-1">
								{visibleGlossary.map((term) => (
									<div
										key={term.id}
										className="rounded-md border border-border bg-background p-3 text-xs"
									>
										<div className="flex items-start justify-between gap-2">
											<div>
												<div className="font-semibold">
													{term.source} {"->"} {term.target}
												</div>
												<div className="mt-1 text-muted">
													{term.language.toUpperCase()}
													{term.note ? ` - ${term.note}` : ""}
												</div>
											</div>
											<button
												type="button"
												onClick={() => removeGlossaryTerm(term.id)}
												className="rounded p-1 text-muted hover:bg-surface-elevated hover:text-red-300"
												title="Remove glossary term"
											>
												<Trash2 size={13} />
											</button>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</section>
			</form>
		</div>
	);
}

function AnswerPanel({
	title,
	value,
	placeholder,
	onChange,
	onCopy,
}: {
	title: string;
	value: string;
	placeholder: string;
	onChange: (value: string) => void;
	onCopy: () => void;
}) {
	return (
		<div className="flex min-h-80 flex-col rounded-lg border border-border bg-surface">
			<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
				<div className="text-sm font-semibold">{title}</div>
				<button
					type="button"
					onClick={onCopy}
					disabled={!value.trim()}
					className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Copy size={14} />
					Copy
				</button>
			</div>
			<textarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="supportos-scroll min-h-80 flex-1 resize-y bg-transparent p-4 text-sm leading-6 outline-none"
				placeholder={placeholder}
			/>
		</div>
	);
}
