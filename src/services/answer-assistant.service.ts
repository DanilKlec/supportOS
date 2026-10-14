import { authenticatedFetch } from "@/services/authenticated-fetch";
import { getTeamGlossary } from "@/services/team-glossary.service";
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
	projectId?: string;
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
	aiEnabled: boolean;
	/** @deprecated Read only while migrating settings saved before AI providers. */
	geminiEnabled?: boolean;
}

export interface StoredAssistantData {
	settings: AssistantSettings;
	glossary: GlossaryTerm[];
	memory: TranslationMemoryEntry[];
}

export interface GenerateAnswerRequest {
	purpose?: "composer";
	project?: string;
	customerMessage: string;
	context: string;
	referenceAnswer?: string;
	agentInstructions?: string;
	responseStyle?: "standard" | "expanded-bind";
	settings: AssistantSettings;
	glossary: GlossaryTerm[];
	memory: TranslationMemoryEntry[];
	sources?: AnswerSource[];
}

export interface AnswerSource {
	id: string;
	title: string;
	type: "material" | "rule" | "project_instruction" | "glossary";
	project?: string;
	version?: string;
	ref?: string;
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
	mode: "openai" | "gemini" | "free";
	warning?: string;
	sources: AnswerSource[];
}

interface AIGenerateResponse {
	text?: string;
	model?: string;
	provider?: "openai" | "gemini";
	error?: string;
	sources?: unknown;
}
interface AIStatusResponse {
	configured?: boolean;
	model?: string;
	provider?: "openai" | "gemini";
	error?: string;
}

class AIGenerateError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "AIGenerateError";
	}
}

const STORAGE_KEY = "supportos:answer-assistant:v1";

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
	language: "auto",
	product: "SupportOS",
	tone: "friendly",
	intent: "general",
	aiEnabled: true,
};

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

function isAnswerSourceMetadata(
	value: unknown,
	allowedTypes: ReadonlySet<AnswerSource["type"]>,
): value is Record<string, unknown> &
	Pick<AnswerSource, "id" | "title" | "type"> {
	const candidate = value as Record<string, unknown>;
	return (
		Boolean(value) &&
		typeof value === "object" &&
		typeof candidate.id === "string" &&
		typeof candidate.title === "string" &&
		allowedTypes.has(candidate.type as AnswerSource["type"])
	);
}

function normalizeAnswerSources(value: unknown): AnswerSource[] {
	if (!Array.isArray(value)) return [];

	const allowedTypes = new Set<AnswerSource["type"]>([
		"material",
		"rule",
		"project_instruction",
		"glossary",
	]);
	const seen = new Set<string>();

	return value.flatMap((item: unknown) => {
		if (!isAnswerSourceMetadata(item, allowedTypes)) return [];
		const candidate = item;

		const source: AnswerSource = {
			id: candidate.id.slice(0, 160),
			title: candidate.title.slice(0, 240),
			type: candidate.type,
			...(typeof candidate.project === "string"
				? { project: candidate.project.slice(0, 160) }
				: {}),
			...(typeof candidate.version === "string"
				? { version: candidate.version.slice(0, 160) }
				: {}),
			...(typeof candidate.ref === "string"
				? { ref: candidate.ref.slice(0, 160) }
				: {}),
			...(typeof candidate.ref === "string"
				? { ref: candidate.ref.slice(0, 160) }
				: {}),
		};
		const identity = `${source.type}:${source.id}`;
		if (!source.id || !source.title || seen.has(identity)) return [];
		seen.add(identity);
		return [source];
	});
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

function getExpandedEmpathy(intent: AnswerIntent, locale: "ru" | "en") {
	if (locale === "ru") {
		const values: Record<AnswerIntent, string> = {
			general:
				"Понимаю вашу ситуацию и постараюсь объяснить всё максимально понятно.",
			deposit:
				"Понимаю, что ситуация с депозитом может вызывать беспокойство, особенно когда хочется быстрее увидеть результат на балансе.",
			withdrawal:
				"Понимаю, что ожидание вывода средств может быть неприятным, особенно если хочется заранее понимать сроки и дальнейшие шаги.",
			bonus:
				"Понимаю, что по бонусам важно получить понятный ответ, чтобы не возникало сомнений по условиям и дальнейшим действиям.",
			verification:
				"Понимаю, что проверка аккаунта может занимать время и из-за этого ситуация выглядит не самой удобной.",
			technical:
				"Понимаю, что техническая ошибка может мешать нормально пользоваться аккаунтом, и это действительно неприятно.",
			"sports-betting":
				"Понимаю, что по ставке важно получить точную информацию без лишнего ожидания.",
		};

		return values[intent];
	}

	const values: Record<AnswerIntent, string> = {
		general:
			"I understand the situation and will explain everything as clearly as possible.",
		deposit:
			"I understand that deposit issues can be worrying, especially when you expect the funds to appear quickly.",
		withdrawal:
			"I understand that waiting for a withdrawal update can be frustrating, especially when you need clarity on the next steps.",
		bonus:
			"I understand that bonus details need to be clear, so there are no doubts about the conditions or what to do next.",
		verification:
			"I understand that account verification can take time and may feel inconvenient.",
		technical:
			"I understand that a technical issue can prevent you from using your account normally, and that is unpleasant.",
		"sports-betting":
			"I understand that bet-related questions require accurate information without unnecessary delays.",
	};

	return values[intent];
}

function getExpandedBridge(locale: "ru" | "en") {
	return locale === "ru"
		? "Сейчас ориентируемся на следующую информацию:"
		: "At the moment, we are guided by the following information:";
}

function getExpandedSupportClosing(locale: "ru" | "en") {
	return locale === "ru"
		? "Если после этого у вас останутся вопросы или появятся дополнительные детали, пожалуйста, напишите нам. Мы постараемся помочь и проверить всё настолько внимательно, насколько это возможно."
		: "If you still have any questions after this or have additional details to share, please let us know. We will do our best to help and check everything as carefully as possible.";
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
	referenceAnswer,
	responseStyle,
	settings,
}: GenerateAnswerRequest) {
	const factsSource = context.trim()
		? context
		: looksLikeAgentBrief(customerMessage)
			? customerMessage
			: "";
	const facts = splitIntoShortFacts(factsSource);
	const locale = getReplyLocale(settings.language);
	const reference = referenceAnswer?.trim();

	if (reference) {
		const factParagraph = buildFactParagraph(facts, locale);
		const expanded =
			responseStyle === "expanded-bind" && settings.tone !== "concise";
		const parts =
			locale === "ru"
				? expanded
					? [
							"Здравствуйте!",
							getExpandedEmpathy(settings.intent, locale),
							factParagraph,
							getExpandedBridge(locale),
							reference,
							getExpandedSupportClosing(locale),
						]
					: [
							"Здравствуйте!",
							getIntentAcknowledgement(settings.intent, locale),
							factParagraph,
							reference,
							getClosing(settings.tone, locale),
						]
				: expanded
					? [
							"Hello!",
							getExpandedEmpathy(settings.intent, locale),
							factParagraph,
							getExpandedBridge(locale),
							reference,
							getExpandedSupportClosing(locale),
						]
					: [
							"Hello!",
							getIntentAcknowledgement(settings.intent, locale),
							factParagraph,
							reference,
							getClosing(settings.tone, locale),
						];

		return parts.filter(Boolean).join("\n\n");
	}

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

async function generateWithAI(request: GenerateAnswerRequest) {
	let response: Response;
	try {
		response = await authenticatedFetch("/api/ai/generate", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				project: request.project,
				purpose: request.purpose,
				customerMessage: request.customerMessage,
				context: request.context,
				referenceAnswer: request.referenceAnswer ?? "",
				responseStyle: request.responseStyle ?? "standard",
				language: request.settings.language,
				product: request.settings.product,
				intent: request.settings.intent,
				agentInstructions: request.agentInstructions,
				tone: getToneInstruction(request.settings.tone),
			}),
		});
	} catch {
		throw new AIGenerateError("AI provider is unavailable", 503);
	}
	const data = (await response.json().catch(() => ({}))) as AIGenerateResponse;

	if (!response.ok || data.error) {
		throw new AIGenerateError(
			response.status === 429
				? "AI request limit has been reached"
				: data.error || "AI request failed",
			response.status,
		);
	}

	if (!data.text?.trim()) {
		throw new AIGenerateError("AI provider returned an empty response", 502);
	}

	return {
		answer: trimAnswer(data.text),
		provider: data.provider ?? "gemini",
		sources: normalizeAnswerSources(data.sources),
	};
}

function shouldUseRuleBasedFallback(error: unknown) {
	if (error instanceof AIGenerateError)
		return error.status !== undefined && error.status >= 500;

	return false;
}

class AnswerAssistantService {
	load(): StoredAssistantData {
		if (!isBrowser()) {
			return {
				settings: DEFAULT_ASSISTANT_SETTINGS,
				glossary: [],
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
					aiEnabled:
						typeof parsed.settings?.aiEnabled === "boolean"
							? parsed.settings.aiEnabled
							: (parsed.settings?.geminiEnabled ?? true),
				},
				glossary: [],
				memory: [],
			};
		} catch {
			return {
				settings: DEFAULT_ASSISTANT_SETTINGS,
				glossary: [],
				memory: [],
			};
		}
	}

	save(data: StoredAssistantData) {
		if (!isBrowser()) return;

		try {
			const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ ...existing, settings: data.settings }),
			);
		} catch {
			// Preserve unreadable legacy data for an explicit recovery/import decision.
		}
	}

	readLegacyGlossary(): GlossaryTerm[] {
		if (!isBrowser()) return [];
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
			return Array.isArray(parsed.glossary)
				? parsed.glossary.filter(
						(term: Partial<GlossaryTerm>) =>
							Boolean(term) &&
							typeof term.source === "string" &&
							typeof term.target === "string" &&
							Boolean(term.source.trim() && term.target.trim()),
					)
				: [];
		} catch {
			return [];
		}
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

		// Keep the older convenience method, but route it through the same
		// authoritative server-glossary path as the Composer.
		return (await this.generateReadyAnswer(request)).answer;
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
			glossary: (await getTeamGlossary()).filter(
				(term) => !term.projectId || term.projectId === request.project,
			),
			memory: [],
			settings: {
				...request.settings,
				language,
			},
		};

		let answer = "";
		let mode: ReadyAnswerResult["mode"] = "free";
		let warning: string | undefined;
		let generatedSources: AnswerSource[] = [];

		if (resolvedRequest.settings.aiEnabled) {
			try {
				const generated = await generateWithAI(resolvedRequest);
				answer = generated.answer;
				mode = generated.provider;
				generatedSources = generated.sources;
			} catch (error) {
				if (!shouldUseRuleBasedFallback(error)) throw error;
				answer = buildRuleBasedAnswer(resolvedRequest);
				mode = "free";
				warning = "AI недоступен. Подготовлен ответ по доступным материалам.";
			}
		}

		if (!answer) {
			answer = buildRuleBasedAnswer(resolvedRequest);
		}

		// AI already received the authoritative server glossary. Local replacements
		// must not overwrite published terminology after generation.
		if (mode === "free")
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
			sources: normalizeAnswerSources([
				...(request.sources ?? []),
				...generatedSources,
			]),
		};
	}

	async testAI() {
		const response = await authenticatedFetch("/api/ai/status", {
			method: "GET",
			headers: { Accept: "application/json" },
		});
		const data = (await response.json().catch(() => ({}))) as AIStatusResponse;

		if (!response.ok) {
			throw new Error(
				data.error || `AI provider returned HTTP ${response.status}`,
			);
		}

		if (!data.configured) {
			throw new Error("Configure OPENAI_API_KEY or GEMINI_API_KEY in Vercel");
		}

		return {
			model: data.model ?? "unknown",
			provider: data.provider ?? "gemini",
		};
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
					title: "Ответ пустой",
					detail: "Напишите или сгенерируйте ответ перед проверкой.",
				},
			];
		}
		if (trimmedAnswer.length < 12) {
			issues.push({
				id: "too-short",
				severity: "warning",
				title: "Ответ слишком короткий",
				detail: "Проверьте, хватает ли клиенту контекста и следующего шага.",
			});
		}

		if (/\{\{[^}]+\}\}|\[[^\]]*(name|amount|date|id)[^\]]*\]/i.test(answer)) {
			issues.push({
				id: "placeholders",
				severity: "error",
				title: "Не заполнен placeholder",
				detail: "Замените шаблонные значения перед отправкой.",
			});
		}

		if (
			/\b(guarantee|guaranteed|definitely|100%|always approved|will definitely|we promise)\b|(гарантируем|гарантированно|точно|обязательно|всегда\s+(?:одобр|зачисл|верн))/i.test(
				answer,
			)
		) {
			issues.push({
				id: "promise",
				severity: "warning",
				title: "Категоричное обещание",
				detail:
					"Не обещайте результат, если он не подтверждён правилами или данными аккаунта.",
			});
		}

		if (
			/\b(?:within|in|by)\s+\d+\s*(?:minutes?|hours?|days?)\b|(?:до|через|в\s+течение)\s+\d+\s*(?:минут(?:ы|у)?|час(?:а|ов)?|дн(?:я|ей)?)|\b\d{1,2}:\d{2}\b/i.test(
				answer,
			)
		) {
			issues.push({
				id: "exact-timing",
				severity: "warning",
				title: "Слишком точный срок",
				detail:
					"Проверьте, что точный срок подтверждён актуальными правилами или данными аккаунта.",
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
				title: "Терминология не совпадает",
				detail: `Проверьте терминологию: ${missingTerms
					.map((term) => term.target)
					.join(", ")}.`,
			});
		}

		if (issues.length === 0) {
			issues.push({
				id: "ok",
				severity: "ok",
				title: "Всё хорошо",
				detail:
					"Не найдено placeholders, категоричных обещаний, точных сроков или расхождений терминологии.",
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
