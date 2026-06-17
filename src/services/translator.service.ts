import {
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

interface ProtectedSegment {
	token: string;
	value: string;
}

const LANGUAGE_ALIASES = new Map(
	Object.entries({
		auto: "auto",
		automatic: "auto",
		english: "en",
		английский: "en",
		russian: "ru",
		русский: "ru",
		german: "de",
		немецкий: "de",
		portuguese: "pt",
		португальский: "pt",
		greek: "el",
		греческий: "el",
		spanish: "es",
		испанский: "es",
		french: "fr",
		французский: "fr",
		italian: "it",
		итальянский: "it",
		turkish: "tr",
		турецкий: "tr",
		polish: "pl",
		польский: "pl",
		ukrainian: "uk",
		украинский: "uk",
		japanese: "ja",
		японский: "ja",
		chinese: "zh",
		китайский: "zh",
		korean: "ko",
		корейский: "ko",
		arabic: "ar",
		арабский: "ar",
		dutch: "nl",
		нидерландский: "nl",
		czech: "cs",
		чешский: "cs",
		hindi: "hi",
		хинди: "hi",
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

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

		const endpoint = this.getEndpoint();
		const protectedSource = protectStaticSegments(sourceText);
		const response = await this.sendTranslateRequest({
			endpoint,
			text: protectedSource.text,
			sourceLanguage,
			targetLanguage,
		});
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

		return {
			text: protectedSource.restore(translatedText),
			fromLanguage: sourceLanguage,
			toLanguage: targetLanguage,
			model: this.isBuiltInEndpoint(endpoint)
				? "LibreTranslate Built-In"
				: "LibreTranslate",
		};
	}

	private async sendTranslateRequest({
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
			return this.request(this.createUrl(endpoint, "/translate"), {
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
			});
		}

		const formData = new FormData();

		formData.set("q", text);
		formData.set("source", sourceLanguage);
		formData.set("target", targetLanguage);
		formData.set("format", "text");

		if (apiKey.trim()) {
			formData.set("api_key", apiKey.trim());
		}

		return this.request(this.createUrl(endpoint, "/translate"), {
			method: "POST",
			body: formData,
		});
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
				error instanceof TypeError
					? "Translator server is unavailable."
					: error instanceof Error
						? error.message
						: "Unable to reach translator server",
			);
		}

		if (!response.ok) {
			const data = await this.readError(response);

			if (response.status === 401 || response.status === 403) {
				throw new TranslatorServiceError(
					"LibreTranslate API key is required or invalid.",
					response.status,
				);
			}

			throw new TranslatorServiceError(
				data.error ?? data.message ?? "LibreTranslate request failed",
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
			return (await response.json()) as LibreTranslateResponse;
		} catch {
			return {};
		}
	}
}

export const translatorService = new TranslatorService();
