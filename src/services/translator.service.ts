import {
	DEFAULT_LINGVA_ENDPOINT,
	DEFAULT_TRANSLATOR_ENDPOINT,
	useTranslatorStore,
} from "@/store/translator.store";
import type { TranslateRequest, TranslateResult } from "@/types/ai";

export interface TranslatorLanguage {
	code: string;
	name: string;
	targets?: string[];
}

interface LibreTranslateLanguage {
	code?: string;
	name?: string;
	targets?: string[];
}

interface LibreTranslateResponse {
	translatedText?: string;
	translated_text?: string;
	error?: string;
	message?: string;
}

interface MyMemoryResponse {
	responseData?: {
		translatedText?: string;
		match?: number;
	};
	responseStatus?: number;
	responseDetails?: string;
	matches?: Array<{
		translation?: string;
		match?: number;
	}>;
}

interface LingvaLanguage {
	code?: string;
	name?: string;
}

interface LingvaLanguagesResponse {
	languages?: LingvaLanguage[];
}

interface LingvaTranslateResponse {
	translation?: string;
	info?: {
		pronunciation?: {
			query?: string;
			translation?: string;
		};
	};
	error?: string;
	message?: string;
}

interface ProtectedSegment {
	token: string;
	value: string;
}

const LANGUAGE_ALIASES = new Map(
	Object.entries({
		auto: "auto",
		automatic: "auto",
		english: "en",
		russian: "ru",
		german: "de",
		portuguese: "pt",
		greek: "el",
		spanish: "es",
		french: "fr",
		italian: "it",
		turkish: "tr",
		polish: "pl",
		ukrainian: "uk",
		japanese: "ja",
		chinese: "zh",
		korean: "ko",
		arabic: "ar",
		dutch: "nl",
		czech: "cs",
		hindi: "hi",
	}),
);

const FALLBACK_LANGUAGES: TranslatorLanguage[] = [
	{ code: "auto", name: "Auto" },
	{ code: "ru", name: "Russian" },
	{ code: "en", name: "English" },
	{ code: "de", name: "German" },
	{ code: "pt", name: "Portuguese" },
	{ code: "el", name: "Greek" },
	{ code: "es", name: "Spanish" },
	{ code: "fr", name: "French" },
	{ code: "it", name: "Italian" },
	{ code: "tr", name: "Turkish" },
	{ code: "pl", name: "Polish" },
	{ code: "uk", name: "Ukrainian" },
	{ code: "ja", name: "Japanese" },
	{ code: "zh", name: "Chinese" },
	{ code: "ko", name: "Korean" },
	{ code: "ar", name: "Arabic" },
	{ code: "nl", name: "Dutch" },
	{ code: "cs", name: "Czech" },
	{ code: "hi", name: "Hindi" },
];

const PROTECTED_PATTERNS = [
	{ prefix: "FENCE", pattern: /```[\s\S]*?```/g },
	{ prefix: "TILDE", pattern: /~~~[\s\S]*?~~~/g },
	{ prefix: "INLINE", pattern: /`[^`\n]+`/g },
	{ prefix: "URL", pattern: /https?:\/\/[^\s<)]+/g },
];

const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";
const MYMEMORY_MAX_CHUNK_BYTES = 450;
const LINGVA_MAX_CHUNK_BYTES = 1400;

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getByteLength(value: string) {
	return new TextEncoder().encode(value).length;
}

function inferSourceLanguage(text: string) {
	if (/[\u0400-\u04ff]/.test(text)) return "ru";
	if (/[\u0370-\u03ff]/.test(text)) return "el";
	if (/[\u3040-\u30ff]/.test(text)) return "ja";
	if (/[\u4e00-\u9fff]/.test(text)) return "zh";
	if (/[\uac00-\ud7af]/.test(text)) return "ko";
	if (/[\u0600-\u06ff]/.test(text)) return "ar";

	return "en";
}

function splitTextByByteLimit(text: string, maxBytes: number) {
	if (getByteLength(text) <= maxBytes) return [text];

	const chunks: string[] = [];
	let chunk = "";

	for (const char of Array.from(text)) {
		if (chunk && getByteLength(`${chunk}${char}`) > maxBytes) {
			chunks.push(chunk);
			chunk = "";
		}

		chunk += char;
	}

	if (chunk) {
		chunks.push(chunk);
	}

	return chunks;
}

function protectStaticSegments(input: string) {
	let text = input;
	const segments: ProtectedSegment[] = [];

	for (const { prefix, pattern } of PROTECTED_PATTERNS) {
		text = text.replace(pattern, (value) => {
			const token = `ZXQ${prefix}${segments.length}ZXQ`;

			segments.push({ token, value });

			return token;
		});
	}

	return {
		text,
		restore(output: string) {
			let restored = output;

			for (const segment of segments) {
				restored = restored.replace(
					new RegExp(escapeRegExp(segment.token), "gi"),
					segment.value,
				);
			}

			return restored;
		},
	};
}

export class TranslatorServiceError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "TranslatorServiceError";
	}
}

class TranslatorService {
	getFallbackLanguages() {
		return FALLBACK_LANGUAGES;
	}

	async getLanguages(): Promise<TranslatorLanguage[]> {
		const provider = useTranslatorStore.getState().provider;

		if (provider === "mymemory") {
			return FALLBACK_LANGUAGES;
		}

		if (provider === "lingva") {
			const endpoint = this.getLingvaEndpoint();
			const response = await this.request(
				this.createUrl(endpoint, "/api/v1/languages/target"),
				{
					method: "GET",
				},
			);
			const data = await this.readJson<
				LingvaLanguagesResponse | LingvaLanguage[]
			>(response, "Lingva returned an invalid language list");
			const languageItems = Array.isArray(data) ? data : (data.languages ?? []);
			const languages = languageItems
				.map((language) => ({
					code: String(language.code ?? "").trim(),
					name: String(language.name ?? language.code ?? "").trim(),
				}))
				.filter((language) => language.code && language.name);

			return languages.length > 0 ? languages : FALLBACK_LANGUAGES;
		}

		const endpoint = this.getEndpoint();
		const response = await this.request(
			this.createUrl(endpoint, "/languages"),
			{
				method: "GET",
			},
		);
		const data = await this.readJson<LibreTranslateLanguage[]>(
			response,
			"Translator returned an invalid language list",
		);

		if (!Array.isArray(data)) {
			throw new TranslatorServiceError(
				"Translator returned an invalid language list",
			);
		}

		const languages = data
			.map((language) => ({
				code: String(language.code ?? "").trim(),
				name: String(language.name ?? language.code ?? "").trim(),
				targets: language.targets,
			}))
			.filter((language) => language.code && language.name);

		if (languages.length === 0) {
			throw new TranslatorServiceError(
				"Translator returned an empty language list",
			);
		}

		return languages;
	}

	async testConnection() {
		const provider = useTranslatorStore.getState().provider;

		if (provider === "mymemory" || provider === "lingva") {
			await this.translate({
				text: "Hello",
				fromLanguage: "en",
				toLanguage: "ru",
			});

			return true;
		}

		await this.getLanguages();
		return true;
	}

	async translate({
		text,
		fromLanguage,
		toLanguage,
	}: TranslateRequest): Promise<TranslateResult> {
		const sourceText = text;
		const sourceLanguage = this.normalizeLanguage(fromLanguage, true);
		const targetLanguage = this.normalizeLanguage(toLanguage, false);

		if (!sourceText.trim()) {
			throw new TranslatorServiceError("Text is required");
		}

		if (!sourceLanguage) {
			throw new TranslatorServiceError("Source language is required");
		}

		if (!targetLanguage) {
			throw new TranslatorServiceError("Target language is required");
		}

		if (targetLanguage === "auto") {
			throw new TranslatorServiceError("Target language cannot be Auto");
		}

		const { provider } = useTranslatorStore.getState();
		const endpoint = provider === "libretranslate" ? this.getEndpoint() : "";
		const effectiveSourceLanguage =
			provider === "mymemory" && sourceLanguage === "auto"
				? inferSourceLanguage(sourceText)
				: sourceLanguage;
		const protectedSource = protectStaticSegments(sourceText);
		const translatedText =
			provider === "mymemory"
				? await this.translateWithMyMemory({
						text: protectedSource.text,
						sourceLanguage: effectiveSourceLanguage,
						targetLanguage,
					})
				: provider === "lingva"
					? await this.translateWithLingva({
							text: protectedSource.text,
							sourceLanguage: effectiveSourceLanguage,
							targetLanguage,
						})
					: await this.translateWithLibreTranslate({
							endpoint,
							text: protectedSource.text,
							sourceLanguage: effectiveSourceLanguage,
							targetLanguage,
						});

		return {
			text: protectedSource.restore(translatedText),
			fromLanguage: effectiveSourceLanguage,
			toLanguage: targetLanguage,
			model:
				provider === "mymemory"
					? "MyMemory"
					: provider === "lingva"
						? "Lingva Free"
						: this.isBuiltInEndpoint(endpoint)
							? "LibreTranslate Built-In"
							: "LibreTranslate",
		};
	}

	private async translateWithMyMemory({
		text,
		sourceLanguage,
		targetLanguage,
	}: {
		text: string;
		sourceLanguage: string;
		targetLanguage: string;
	}) {
		const { apiKey, email } = useTranslatorStore.getState();
		const chunks = splitTextByByteLimit(text, MYMEMORY_MAX_CHUNK_BYTES);
		const translatedChunks: string[] = [];

		for (const chunk of chunks) {
			if (!chunk.trim()) {
				translatedChunks.push(chunk);
				continue;
			}

			const url = new URL(MYMEMORY_ENDPOINT);

			url.searchParams.set("q", chunk);
			url.searchParams.set("langpair", `${sourceLanguage}|${targetLanguage}`);
			url.searchParams.set("mt", "1");

			if (email.trim()) {
				url.searchParams.set("de", email.trim());
			}

			if (apiKey.trim()) {
				url.searchParams.set("key", apiKey.trim());
			}

			const response = await this.request(url.toString(), {
				method: "GET",
			});
			const data = await this.readJson<MyMemoryResponse>(
				response,
				"MyMemory returned an invalid response",
			);
			const status = data.responseStatus ?? response.status;
			const translatedText =
				data.responseData?.translatedText ??
				data.matches?.find((match) => match.translation)?.translation;

			if (status >= 400 || typeof translatedText !== "string") {
				throw new TranslatorServiceError(
					data.responseDetails || "MyMemory translation failed",
					status,
				);
			}

			translatedChunks.push(translatedText);
		}

		return translatedChunks.join("");
	}

	private async translateWithLibreTranslate({
		endpoint,
		text,
		sourceLanguage,
		targetLanguage,
	}: {
		endpoint: string;
		text: string;
		sourceLanguage: string;
		targetLanguage: string;
	}) {
		const { apiKey } = useTranslatorStore.getState();

		if (this.isBuiltInEndpoint(endpoint)) {
			const response = await this.request(
				this.createUrl(endpoint, "/translate"),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						text,
						source: sourceLanguage,
						target: targetLanguage,
						format: "text",
						apiKey: apiKey.trim() || undefined,
					}),
				},
			);

			return this.readLibreTranslateText(response);
		}

		const formData = new FormData();

		formData.set("q", text);
		formData.set("source", sourceLanguage);
		formData.set("target", targetLanguage);
		formData.set("format", "text");

		if (apiKey.trim()) {
			formData.set("api_key", apiKey.trim());
		}

		const response = await this.request(
			this.createUrl(endpoint, "/translate"),
			{
				method: "POST",
				body: formData,
			},
		);

		return this.readLibreTranslateText(response);
	}

	private async translateWithLingva({
		text,
		sourceLanguage,
		targetLanguage,
	}: {
		text: string;
		sourceLanguage: string;
		targetLanguage: string;
	}) {
		const endpoint = this.getLingvaEndpoint();
		const chunks = splitTextByByteLimit(text, LINGVA_MAX_CHUNK_BYTES);
		const translatedChunks: string[] = [];

		for (const chunk of chunks) {
			if (!chunk.trim()) {
				translatedChunks.push(chunk);
				continue;
			}

			const response = await this.request(
				this.createUrl(
					endpoint,
					`/api/v1/${encodeURIComponent(sourceLanguage)}/${encodeURIComponent(
						targetLanguage,
					)}/${encodeURIComponent(chunk)}`,
				),
				{
					method: "GET",
				},
			);
			const data = await this.readJson<LingvaTranslateResponse>(
				response,
				"Lingva returned an invalid response",
			);

			if (typeof data.translation !== "string") {
				throw new TranslatorServiceError(
					data.error ?? data.message ?? "Lingva returned an empty response",
					response.status,
				);
			}

			translatedChunks.push(data.translation);
		}

		return translatedChunks.join("");
	}

	private async readLibreTranslateText(response: Response) {
		const data = await this.readJson<LibreTranslateResponse>(
			response,
			"Translator returned an invalid response",
		);
		const translatedText = data.translatedText ?? data.translated_text;

		if (typeof translatedText !== "string") {
			throw new TranslatorServiceError(
				data.error ?? data.message ?? "Translator returned an empty response",
				response.status,
			);
		}

		return translatedText;
	}

	private getEndpoint() {
		const endpoint = useTranslatorStore.getState().endpoint.trim();

		if (!endpoint) {
			throw new TranslatorServiceError(
				"LibreTranslate endpoint is not configured",
			);
		}

		return endpoint.replace(/\/+$/, "");
	}

	private getLingvaEndpoint() {
		const endpoint =
			useTranslatorStore.getState().lingvaEndpoint.trim() ||
			DEFAULT_LINGVA_ENDPOINT;

		return endpoint.replace(/\/+$/, "");
	}

	private createUrl(endpoint: string, path: string) {
		return `${endpoint}${path}`;
	}

	private isBuiltInEndpoint(endpoint: string) {
		return endpoint.replace(/\/+$/, "") === DEFAULT_TRANSLATOR_ENDPOINT;
	}

	private normalizeLanguage(language: string, allowAuto: boolean) {
		const value = language.trim();

		if (!value) return "";

		const normalized = value.toLowerCase();
		const alias = LANGUAGE_ALIASES.get(normalized) ?? normalized;

		if (alias === "auto") {
			return allowAuto ? "auto" : "";
		}

		return alias;
	}

	private async request(url: string, init: RequestInit) {
		let response: Response;

		try {
			response = await fetch(url, init);
		} catch (error) {
			throw new TranslatorServiceError(
				error instanceof Error ? error.message : "Unable to reach translator",
			);
		}

		if (!response.ok) {
			const data = await this.readError(response);

			if (response.status === 401 || response.status === 403) {
				throw new TranslatorServiceError(
					"Translator API key is required or invalid.",
					response.status,
				);
			}

			throw new TranslatorServiceError(
				data.error ??
					data.message ??
					data.responseDetails ??
					"Translation request failed",
				response.status,
			);
		}

		return response;
	}

	private async readJson<T>(response: Response, fallback: string) {
		try {
			return (await response.json()) as T;
		} catch {
			throw new TranslatorServiceError(fallback, response.status);
		}
	}

	private async readError(response: Response) {
		try {
			return (await response.json()) as LibreTranslateResponse &
				MyMemoryResponse;
		} catch {
			return {};
		}
	}
}

export const translatorService = new TranslatorService();
