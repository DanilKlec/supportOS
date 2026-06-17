import { useTranslatorStore } from "@/store/translator.store";
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

const LANGUAGE_ALIASES = new Map(
	Object.entries({
		auto: "auto",
		automatic: "auto",
		russian: "ru",
		русский: "ru",
		english: "en",
		английский: "en",
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
];

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
		const response = await this.request(`${endpoint}/languages`, {
			method: "GET",
		});

		const data = (await response.json()) as LibreTranslateLanguage[];

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
		const sourceText = text.trim();
		const sourceLanguage = this.normalizeLanguage(fromLanguage, true);
		const targetLanguage = this.normalizeLanguage(toLanguage, false);

		if (!sourceText) {
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

		const { apiKey } = useTranslatorStore.getState();
		const endpoint = this.getEndpoint();
		const formData = new FormData();

		formData.set("q", sourceText);
		formData.set("source", sourceLanguage);
		formData.set("target", targetLanguage);
		formData.set("format", "text");

		if (apiKey.trim()) {
			formData.set("api_key", apiKey.trim());
		}

		const response = await this.request(`${endpoint}/translate`, {
			method: "POST",
			body: formData,
		});
		const data = (await response.json()) as LibreTranslateResponse;
		const translatedText = data.translatedText ?? data.translated_text;

		if (typeof translatedText !== "string") {
			throw new TranslatorServiceError(
				data.error ?? data.message ?? "Translator returned an empty response",
				response.status,
			);
		}

		return {
			text: translatedText,
			fromLanguage: sourceLanguage,
			toLanguage: targetLanguage,
			model: "LibreTranslate",
		};
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
					? "Translator server is unavailable. Check that LibreTranslate is running and CORS is allowed."
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

	private async readError(response: Response) {
		try {
			return (await response.json()) as LibreTranslateResponse;
		} catch {
			return {};
		}
	}
}

export const translatorService = new TranslatorService();
