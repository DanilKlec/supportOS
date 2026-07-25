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
	ollamaEnabled: boolean;
	ollamaEndpoint: string;
	ollamaModel: string;
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
	mode: "ollama" | "free";
	warning?: string;
}

interface OllamaGenerateResponse {
	response?: string;
	error?: string;
}

const STORAGE_KEY = "supportos:answer-assistant:v1";
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.1:8b";

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
	language: "auto",
	product: "SupportOS",
	tone: "friendly",
	intent: "general",
	ollamaEnabled: false,
	ollamaEndpoint: DEFAULT_OLLAMA_ENDPOINT,
	ollamaModel: DEFAULT_OLLAMA_MODEL,
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

function getIntentInstruction(intent: AnswerIntent) {
	const instructions: Record<AnswerIntent, string> = {
		general:
			"Acknowledge the request, give a clear next step, and keep the reply helpful.",
		deposit:
			"Explain deposit status carefully, mention payment provider checks, and avoid promising exact processing times unless given.",
		withdrawal:
			"Explain withdrawal review, KYC/payment checks, and ask for patience without blaming the customer.",
		bonus:
			"Explain bonus eligibility, wagering, expiry, max win, and excluded games only when relevant.",
		verification:
			"Ask for required verification documents politely and explain that review protects the account.",
		technical:
			"Give practical troubleshooting steps and ask for device, browser, screenshot, or error code if needed.",
		"sports-betting":
			"Explain odds, bet settlement, void rules, or event status neutrally. Do not guarantee betting outcomes.",
	};

	return instructions[intent];
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

function formatGlossary(glossary: GlossaryTerm[]) {
	if (glossary.length === 0) return "No matching glossary terms.";

	return glossary
		.map(
			(term) =>
				`- ${term.source} -> ${term.target}${term.note ? ` (${term.note})` : ""}`,
		)
		.join("\n");
}

function formatMemory(memory: TranslationMemoryEntry[]) {
	if (memory.length === 0) return "No close Translation Memory matches.";

	return memory
		.slice(0, 3)
		.map((entry) => `Source: ${entry.source}\nApproved: ${entry.target}`)
		.join("\n\n");
}

function trimAnswer(value: string) {
	return value
		.replace(/^(answer|reply|response)\s*:\s*/i, "")
		.replace(/^["']|["']$/g, "")
		.trim();
}

function buildRuleBasedAnswer({
	customerMessage,
	context,
	settings,
	glossary,
	memory,
}: GenerateAnswerRequest) {
	const matchedMemory = findMemoryMatches(customerMessage, memory).at(0);

	if (matchedMemory && matchedMemory.score >= 0.75) {
		return matchedMemory.entry.target;
	}

	const greeting =
		settings.tone === "formal"
			? "Hello,"
			: settings.tone === "concise"
				? ""
				: "Hi,";
	const productText = settings.product.trim() || "our team";
	const contextLine = context.trim()
		? `I checked the available details: ${context.trim()}`
		: "";
	const intentLine = getIntentInstruction(settings.intent);
	const glossaryTerms = getRelevantGlossary(
		glossary,
		`${customerMessage} ${context}`,
		settings.language,
	);
	const glossaryLine = glossaryTerms.length
		? `I will keep the key terms consistent: ${glossaryTerms
				.map((term) => term.target)
				.join(", ")}.`
		: "";
	const nextStep =
		settings.intent === "technical"
			? "Please send us the error text, device, browser, and a screenshot so we can check it faster."
			: settings.intent === "verification"
				? "Please upload the requested document from your account so the review team can continue the check."
				: settings.intent === "sports-betting"
					? "Please share the bet ID or event name if you want us to check the exact settlement rule."
					: "Please send any missing details so we can check this for you as quickly as possible.";
	const closing =
		settings.tone === "concise"
			? ""
			: `Thank you for your patience,\n${productText} Support`;

	return [
		greeting,
		`Thanks for contacting ${productText}.`,
		contextLine,
		intentLine,
		glossaryLine,
		nextStep,
		closing,
	]
		.filter(Boolean)
		.join("\n\n");
}

async function generateWithOllama(request: GenerateAnswerRequest) {
	const endpoint = request.settings.ollamaEndpoint.trim().replace(/\/+$/, "");
	const model = request.settings.ollamaModel.trim() || DEFAULT_OLLAMA_MODEL;

	if (!endpoint) {
		throw new Error("Ollama endpoint is required");
	}

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
	const prompt = [
		"You are a support reply generator.",
		"Write one ready-to-send customer support answer.",
		"Do not invent account facts, transaction IDs, dates, or policies.",
		"Use the requested language if possible.",
		`Language: ${request.settings.language}`,
		`Product: ${request.settings.product || "SupportOS"}`,
		`Intent: ${request.settings.intent}`,
		`Tone: ${getToneInstruction(request.settings.tone)}`,
		`Intent guidance: ${getIntentInstruction(request.settings.intent)}`,
		"",
		"Translation Memory:",
		formatMemory(memoryMatches),
		"",
		"Glossary:",
		formatGlossary(glossary),
		"",
		"Customer message:",
		request.customerMessage,
		"",
		"Internal context:",
		request.context || "No extra context.",
	].join("\n");

	const response = await fetch(`${endpoint}/api/generate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			prompt,
			stream: false,
			options: {
				temperature: 0.3,
				num_predict: 420,
			},
		}),
	});
	const data = (await response
		.json()
		.catch(() => ({}))) as OllamaGenerateResponse;

	if (!response.ok || data.error) {
		throw new Error(data.error || "Ollama request failed");
	}

	if (!data.response?.trim()) {
		throw new Error("Ollama returned an empty response");
	}

	return trimAnswer(data.response);
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

		if (request.settings.ollamaEnabled) {
			return generateWithOllama(request);
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

		if (resolvedRequest.settings.ollamaEnabled) {
			try {
				answer = await generateWithOllama(resolvedRequest);
				mode = "ollama";
			} catch (error) {
				warning = `Ollama is unavailable, so the free mode was used: ${
					error instanceof Error ? error.message : "connection failed"
				}`;
			}
		}

		if (!answer) {
			answer = buildRuleBasedAnswer({
				...resolvedRequest,
				settings: {
					...resolvedRequest.settings,
					language: "en",
				},
			});

			if (language !== "en") {
				try {
					answer = await this.translateAnswer({
						text: answer,
						toLanguage: language,
						glossary: resolvedRequest.glossary,
					});
				} catch (error) {
					const translationWarning = `Automatic translation is unavailable: ${
						error instanceof Error ? error.message : "translation failed"
					}`;

					warning = warning
						? `${warning}. ${translationWarning}`
						: translationWarning;
				}
			}
		}

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

	async testOllama(settings: AssistantSettings) {
		const endpoint = settings.ollamaEndpoint.trim().replace(/\/+$/, "");

		if (!endpoint) {
			throw new Error("Ollama endpoint is required");
		}

		const response = await fetch(`${endpoint}/api/tags`);

		if (!response.ok) {
			throw new Error(`Ollama returned HTTP ${response.status}`);
		}

		return true;
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

		if (!/\b(thank|thanks|hello|hi|please|sorry|appreciate)\b/i.test(answer)) {
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
