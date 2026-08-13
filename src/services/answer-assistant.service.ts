import { translatorService } from "@/services/translator.service";

export type AnswerIntent =
	| "general"
	| "deposit"
	| "withdrawal"
	| "bonus"
	| "verification"
	| "technical"
	| "sports-betting";

export type AnswerTone = "friendly" | "neutral" | "formal" | "concise";

export interface GlossaryTerm {
	id: string;
	source: string;
	target: string;
	language: string;
	note?: string;
}

export interface TranslationMemoryEntry {
	id: string;
	source: string;
	target: string;
	sourceLanguage: string;
	targetLanguage: string;
	createdAt: string;
}

export interface AssistantSettings {
	language: string;
	product: string;
	tone: AnswerTone;
	intent: AnswerIntent;
	geminiEnabled: boolean;
}

export interface StoredAssistantData {
	settings: AssistantSettings;
	glossary: GlossaryTerm[];
	memory: TranslationMemoryEntry[];
}

export interface GenerateAnswerRequest {
	customerMessage: string;
	context: string;
	settings: AssistantSettings;
	glossary: GlossaryTerm[];
	memory: TranslationMemoryEntry[];
}

export interface CheckIssue {
	id: string;
	severity: "ok" | "warning" | "error";
	title: string;
	detail: string;
}

export interface ReadyAnswerResult {
	answer: string;
	language: string;
	issues: CheckIssue[];
	mode: "gemini" | "free";
	warning?: string;
}

interface GeminiGenerateResponse {
	text?: string;
	model?: string;
	error?: string;
}

const STORAGE_KEY = "supportos:answer-assistant:v1";

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
	language: "auto",
	product: "SupportOS",
	tone: "friendly",
	intent: "general",
	geminiEnabled: true,
};

const DEFAULT_GLOSSARY: GlossaryTerm[] = [
	{
		id: "glossary-wager",
		source: "wager",
		target: "wager",
		language: "en",
		note: "Keep as betting/bonus turnover term.",
	},
	{
		id: "glossary-kyc",
		source: "KYC",
		target: "KYC",
		language: "en",
		note: "Do not translate the abbreviation.",
	},
	{
		id: "glossary-self-exclusion",
		source: "self-exclusion",
		target: "self-exclusion",
		language: "en",
		note: "Responsible gambling term.",
	},
];

function createId(prefix: string) {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;

	return `${prefix}-${random}`;
}

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\u0400-\u04ff\u0370-\u03ff]+/g, " ")
		.trim();
}

function getTokens(value: string) {
	return normalizeText(value)
		.split(/\s+/)
		.filter((token) => token.length > 2);
}

function getSimilarity(first: string, second: string) {
	const firstTokens = new Set(getTokens(first));
	const secondTokens = new Set(getTokens(second));

	if (firstTokens.size === 0 || secondTokens.size === 0) return 0;

	let overlap = 0;

	for (const token of firstTokens) {
		if (secondTokens.has(token)) overlap += 1;
	}

	return overlap / Math.max(firstTokens.size, secondTokens.size);
}

function getToneInstruction(tone: AnswerTone) {
	const instructions: Record<AnswerTone, string> = {
		friendly: "Warm, simple, and reassuring.",
		neutral: "Clear, calm, and direct.",
		formal: "Professional, precise, and slightly more structured.",
		concise: "Short, direct, and no extra explanation.",
	};

	return instructions[tone];
}

function getRelevantGlossary(
	glossary: GlossaryTerm[],
	text: string,
	language: string,
) {
	const haystack = normalizeText(text);

	return glossary.filter((term) => {
		const matchesLanguage =
			term.language.toLowerCase() === language.toLowerCase() ||
			term.language.toLowerCase() === "any";
		const source = normalizeText(term.source);

		return matchesLanguage && source && haystack.includes(source);
	});
}

function trimAnswer(value: string) {
	return value
		.replace(/^(answer|reply|response)\s*:\s*/i, "")
		.replace(/^["']|["']$/g, "")
		.trim();
}

function normalizeWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

function splitIntoShortFacts(value: string) {
	return value
		.split(/\n+|[;•]+/g)
		.map((line) =>
			normalizeWhitespace(
				line
					.replace(/^[-–—*]\s*/, "")
					.replace(/^(что|that)\s+/i, "")
					.replace(
						/^(напиши|напишите|сказать|сообщить|ответить|объяснить|tell|say|reply|explain)\s+/i,
						"",
					)
					.replace(/^(клиенту|пользователю|customer|user)\s+/i, ""),
			),
		)
		.filter(Boolean)
		.slice(0, 5);
}

function looksLikeAgentBrief(value: string) {
	return /\b(напиши|напишите|скажи|сказать|сообщить|ответить|объяснить|клиенту|пользователю|tell|say|reply|explain|customer|user)\b/i.test(
		value,
	);
}

function ensureSentence(value: string) {
	const trimmed = normalizeWhitespace(value);

	if (!trimmed) return "";
	if (/[.!?。！？]$/.test(trimmed)) return trimmed;

	return `${trimmed}.`;
}

function getReplyLocale(language: string) {
	const normalized = language.trim().toLowerCase();

	if (normalized.startsWith("ru") || normalized.startsWith("uk")) return "ru";

	return "en";
}

function getIntentAcknowledgement(intent: AnswerIntent, locale: "ru" | "en") {
	const ru: Record<AnswerIntent, string> = {
		general: "Спасибо за обращение.",
		deposit: "Понимаю, что вопрос с депозитом важно решить как можно быстрее.",
		withdrawal: "Понимаю, что ожидание вывода средств может беспокоить.",
		bonus: "Понимаю, что по бонусу важно получить точную информацию.",
		verification:
			"Понимаю, что проверка аккаунта и документов может занимать время.",
		technical:
			"Понимаю, что техническая ошибка мешает нормально пользоваться сервисом.",
		"sports-betting":
			"Понимаю, что по спортивной ставке важно быстро получить точную информацию.",
	};
	const en: Record<AnswerIntent, string> = {
		general: "Thank you for reaching out.",
		deposit: "I understand that deposit questions need to be resolved quickly.",
		withdrawal:
			"I understand that waiting for a withdrawal update can be frustrating.",
		bonus:
			"I understand that bonus details need to be clear before you proceed.",
		verification:
			"I understand that account and document checks can take time.",
		technical:
			"I understand that a technical issue can prevent you from using the service normally.",
		"sports-betting":
			"I understand that sports-betting questions need a quick and accurate update.",
	};

	return locale === "ru" ? ru[intent] : en[intent];
}

function getClarificationQuestion(intent: AnswerIntent, locale: "ru" | "en") {
	const ru: Record<AnswerIntent, string> = {
		general:
			"Уточните, пожалуйста, несколько деталей по ситуации, чтобы мы могли проверить вопрос точнее.",
		deposit:
			"Уточните, пожалуйста, сумму, способ оплаты и примерное время депозита.",
		withdrawal:
			"Уточните, пожалуйста, сумму, метод вывода и номер заявки, если он есть.",
		bonus:
			"Уточните, пожалуйста, название бонуса и проект, по которому нужен ответ.",
		verification:
			"Уточните, пожалуйста, какие документы были загружены и когда это произошло.",
		technical:
			"Уточните, пожалуйста, устройство, браузер или приложение и что именно происходит на экране.",
		"sports-betting":
			"Уточните, пожалуйста, событие, рынок ставки и номер купона, если он есть.",
	};
	const en: Record<AnswerIntent, string> = {
		general:
			"Please share a few more details so we can check the situation more accurately.",
		deposit:
			"Please share the amount, payment method, and approximate deposit time.",
		withdrawal:
			"Please share the amount, withdrawal method, and request ID if you have one.",
		bonus:
			"Please share the bonus name and project so we can check the details.",
		verification:
			"Please clarify which documents were uploaded and when this was done.",
		technical:
			"Please share your device, browser or app, and what exactly happens on the screen.",
		"sports-betting":
			"Please share the event, bet market, and bet slip ID if available.",
	};

	return locale === "ru" ? ru[intent] : en[intent];
}

function buildFactParagraph(facts: string[], locale: "ru" | "en") {
	if (facts.length === 0) return "";

	const sentences = facts.map(ensureSentence).filter(Boolean);

	if (sentences.length === 0) return "";

	if (locale === "ru") {
		return `По вашему вопросу: ${sentences.join(" ")}`;
	}

	return `Regarding your request: ${sentences.join(" ")}`;
}

function getClosing(tone: AnswerTone, locale: "ru" | "en") {
	if (tone === "concise") return "";

	if (locale === "ru") {
		return "Спасибо за понимание.";
	}

	return "Thank you for your understanding.";
}

function buildRuleBasedAnswer({
	customerMessage,
	context,
	memory,
	settings,
}: GenerateAnswerRequest) {
	const matchedMemory = findMemoryMatches(customerMessage, memory).at(0);

	if (matchedMemory && matchedMemory.score >= 0.75) {
		return matchedMemory.entry.target;
	}

	const factsSource = context.trim()
		? context
		: looksLikeAgentBrief(customerMessage)
			? customerMessage
			: "";
	const facts = splitIntoShortFacts(factsSource);
	const locale = getReplyLocale(settings.language);

	if (facts.length > 0) {
		const parts =
			locale === "ru"
				? [
						"Здравствуйте!",
						getIntentAcknowledgement(settings.intent, locale),
						buildFactParagraph(facts, locale),
						getClosing(settings.tone, locale),
					]
				: [
						"Hello!",
						getIntentAcknowledgement(settings.intent, locale),
						buildFactParagraph(facts, locale),
						getClosing(settings.tone, locale),
					];

		return parts.filter(Boolean).join("\n\n");
	}

	const clarification = getClarificationQuestion(settings.intent, locale);

	return locale === "ru"
		? [
				"Здравствуйте!",
				getIntentAcknowledgement(settings.intent, locale),
				clarification,
			]
				.filter(Boolean)
				.join("\n\n")
		: [
				"Hello!",
				getIntentAcknowledgement(settings.intent, locale),
				clarification,
			]
				.filter(Boolean)
				.join("\n\n");
}

async function generateWithGemini(request: GenerateAnswerRequest) {
	const memoryMatches = findMemoryMatches(
		request.customerMessage,
		request.memory,
	)
		.slice(0, 3)
		.map((match) => match.entry);
	const glossary = getRelevantGlossary(
		request.glossary,
		`${request.customerMessage} ${request.context}`,
		request.settings.language,
	);
	const response = await fetch("/api/ai/generate", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			customerMessage: request.customerMessage,
			context: request.context,
			language: request.settings.language,
			product: request.settings.product,
			intent: request.settings.intent,
			tone: getToneInstruction(request.settings.tone),
			glossary,
			memory: memoryMatches,
		}),
	});
	const data = (await response
		.json()
		.catch(() => ({}))) as GeminiGenerateResponse;

	if (!response.ok || data.error) {
		if (response.status === 429) {
			throw new Error("Gemini free request limit has been reached");
		}

		throw new Error(data.error || "Gemini request failed");
	}

	if (!data.text?.trim()) {
		throw new Error("Gemini returned an empty response");
	}

	return trimAnswer(data.text);
}

class AnswerAssistantService {
	load(): StoredAssistantData {
		if (!isBrowser()) {
			return {
				settings: DEFAULT_ASSISTANT_SETTINGS,
				glossary: DEFAULT_GLOSSARY,
				memory: [],
			};
		}

		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const parsed = raw
				? (JSON.parse(raw) as Partial<StoredAssistantData>)
				: {};

			return {
				settings: {
					...DEFAULT_ASSISTANT_SETTINGS,
					...(parsed.settings ?? {}),
					geminiEnabled:
						typeof parsed.settings?.geminiEnabled === "boolean"
							? parsed.settings.geminiEnabled
							: true,
				},
				glossary: parsed.glossary?.length ? parsed.glossary : DEFAULT_GLOSSARY,
				memory: parsed.memory ?? [],
			};
		} catch {
			return {
				settings: DEFAULT_ASSISTANT_SETTINGS,
				glossary: DEFAULT_GLOSSARY,
				memory: [],
			};
		}
	}

	save(data: StoredAssistantData) {
		if (!isBrowser()) return;

		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}

	createGlossaryTerm(term: Omit<GlossaryTerm, "id">): GlossaryTerm {
		return {
			...term,
			id: createId("glossary"),
		};
	}

	createMemoryEntry(
		entry: Omit<TranslationMemoryEntry, "id" | "createdAt">,
	): TranslationMemoryEntry {
		return {
			...entry,
			id: createId("tm"),
			createdAt: new Date().toISOString(),
		};
	}

	async generateAnswer(request: GenerateAnswerRequest) {
		if (!request.customerMessage.trim()) {
			throw new Error("Customer message is required");
		}

		if (request.settings.geminiEnabled) {
			return generateWithGemini(request);
		}

		return buildRuleBasedAnswer(request);
	}

	async generateReadyAnswer(
		request: GenerateAnswerRequest,
	): Promise<ReadyAnswerResult> {
		if (!request.customerMessage.trim()) {
			throw new Error("Customer message is required");
		}

		const language =
			request.settings.language.trim().toLowerCase() === "auto"
				? translatorService.detectLanguage(request.customerMessage)
				: request.settings.language.trim().toLowerCase();
		const resolvedRequest: GenerateAnswerRequest = {
			...request,
			settings: {
				...request.settings,
				language,
			},
		};

		let answer = "";
		let mode: ReadyAnswerResult["mode"] = "free";
		let warning: string | undefined;

		if (resolvedRequest.settings.geminiEnabled) {
			answer = await generateWithGemini(resolvedRequest);
			mode = "gemini";
		}

		if (!answer) {
			answer = buildRuleBasedAnswer(resolvedRequest);
		}

		answer = applyGlossary(answer, resolvedRequest.glossary, language);

		const issues = this.checkAnswer({
			answer,
			customerMessage: resolvedRequest.customerMessage,
			glossary: resolvedRequest.glossary,
			language,
		});

		return {
			answer,
			language,
			issues,
			mode,
			warning,
		};
	}

	async testGemini() {
		const response = await fetch("/api/ai/status", {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		const data = (await response.json().catch(() => ({}))) as {
			configured?: boolean;
			model?: string;
			error?: string;
		};

		if (!response.ok) {
			throw new Error(data.error || `Gemini returned HTTP ${response.status}`);
		}

		if (!data.configured) {
			throw new Error("Add GEMINI_API_KEY in Vercel and redeploy the project");
		}

		return data.model ?? "gemini-2.5-flash-lite";
	}

	async translateAnswer({
		text,
		toLanguage,
		glossary,
	}: {
		text: string;
		toLanguage: string;
		glossary: GlossaryTerm[];
	}) {
		if (!text.trim()) {
			throw new Error("Answer text is required");
		}

		const result = await translatorService.translate({
			text,
			fromLanguage: "auto",
			toLanguage,
		});

		return applyGlossary(result.text, glossary, toLanguage);
	}

	checkAnswer({
		answer,
		customerMessage,
		glossary,
		language,
	}: {
		answer: string;
		customerMessage: string;
		glossary: GlossaryTerm[];
		language: string;
	}): CheckIssue[] {
		const issues: CheckIssue[] = [];
		const trimmedAnswer = answer.trim();
		const lowerAnswer = trimmedAnswer.toLowerCase();

		if (!trimmedAnswer) {
			return [
				{
					id: "empty",
					severity: "error",
					title: "Answer is empty",
					detail: "Generate or write an answer before checking it.",
				},
			];
		}

		if (/\{\{[^}]+\}\}|\[[^\]]*(name|amount|date|id)[^\]]*\]/i.test(answer)) {
			issues.push({
				id: "placeholders",
				severity: "error",
				title: "Unresolved placeholder",
				detail: "Replace template placeholders before sending the answer.",
			});
		}

		if (
			/\b(guarantee|guaranteed|definitely|100%|always approved)\b/i.test(answer)
		) {
			issues.push({
				id: "promise",
				severity: "warning",
				title: "Risky promise",
				detail:
					"Avoid guarantees unless the policy or account data confirms them.",
			});
		}

		if (trimmedAnswer.length > 900) {
			issues.push({
				id: "length",
				severity: "warning",
				title: "Long answer",
				detail: "Consider shortening the reply for support chat readability.",
			});
		}

		if (!/[?!.]$/.test(trimmedAnswer)) {
			issues.push({
				id: "punctuation",
				severity: "warning",
				title: "Missing final punctuation",
				detail: "The answer should end cleanly before sending.",
			});
		}

		if (
			!/\b(thank|thanks|hello|hi|please|sorry|appreciate)\b|здравствуйте|добрый|спасибо|пожалуйста|понимаю|извин|сожале|благодар/i.test(
				answer,
			)
		) {
			issues.push({
				id: "tone",
				severity: "warning",
				title: "Tone may be too dry",
				detail:
					"Add a greeting, thanks, apology, or polite next step when appropriate.",
			});
		}

		const glossaryTerms = getRelevantGlossary(
			glossary,
			`${customerMessage} ${answer}`,
			language,
		);
		const missingTerms = glossaryTerms.filter(
			(term) =>
				!lowerAnswer.includes(term.target.toLowerCase()) &&
				!lowerAnswer.includes(term.source.toLowerCase()),
		);

		if (missingTerms.length > 0) {
			issues.push({
				id: "glossary",
				severity: "warning",
				title: "Glossary term missing",
				detail: `Review terminology: ${missingTerms
					.map((term) => term.target)
					.join(", ")}.`,
			});
		}

		if (issues.length === 0) {
			issues.push({
				id: "ok",
				severity: "ok",
				title: "Ready to review",
				detail:
					"No obvious placeholders, risky promises, or glossary issues found.",
			});
		}

		return issues;
	}
}

export function findMemoryMatches(
	source: string,
	memory: TranslationMemoryEntry[],
) {
	return memory
		.map((entry) => ({
			entry,
			score: getSimilarity(source, entry.source),
		}))
		.filter((match) => match.score > 0.15)
		.sort((first, second) => second.score - first.score);
}

export function applyGlossary(
	text: string,
	glossary: GlossaryTerm[],
	language: string,
) {
	let nextText = text;

	for (const term of glossary) {
		if (
			term.language.toLowerCase() !== language.toLowerCase() &&
			term.language.toLowerCase() !== "any"
		) {
			continue;
		}

		if (!term.source.trim() || !term.target.trim()) continue;

		const pattern = new RegExp(`\\b${escapeRegExp(term.source)}\\b`, "gi");

		nextText = nextText.replace(pattern, term.target);
	}

	return nextText;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const answerAssistantService = new AnswerAssistantService();
