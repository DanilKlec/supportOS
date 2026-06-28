import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_TRANSLATOR_ENDPOINT = "/api/translator";
export const DEFAULT_LINGVA_ENDPOINT = "https://lingva.ml";
export const DEFAULT_TRANSLATOR_PROVIDER = "lingva";

const LEGACY_DEFAULT_ENDPOINTS = new Set([
	"http://localhost:5000",
	"http://localhost:5000/",
	"http://127.0.0.1:5000",
	"http://127.0.0.1:5000/",
]);

export type TranslatorProvider = "mymemory" | "libretranslate" | "lingva";

interface TranslatorState {
	provider: TranslatorProvider;
	endpoint: string;
	lingvaEndpoint: string;
	apiKey: string;
	email: string;
	setProvider: (provider: TranslatorProvider) => void;
	setEndpoint: (endpoint: string) => void;
	setLingvaEndpoint: (endpoint: string) => void;
	setApiKey: (apiKey: string) => void;
	setEmail: (email: string) => void;
	useBuiltInEndpoint: () => void;
	useDefaultLingvaEndpoint: () => void;
}

function migrateTranslatorState(persistedState: unknown) {
	const state =
		persistedState && typeof persistedState === "object"
			? (persistedState as Partial<TranslatorState>)
			: {};
	const endpoint =
		typeof state.endpoint === "string" ? state.endpoint.trim() : "";
	const lingvaEndpoint =
		typeof state.lingvaEndpoint === "string" ? state.lingvaEndpoint.trim() : "";
	const provider =
		state.provider === "libretranslate" || state.provider === "lingva"
			? state.provider
			: DEFAULT_TRANSLATOR_PROVIDER;

	return {
		provider,
		endpoint:
			endpoint && !LEGACY_DEFAULT_ENDPOINTS.has(endpoint)
				? endpoint
				: DEFAULT_TRANSLATOR_ENDPOINT,
		lingvaEndpoint: lingvaEndpoint || DEFAULT_LINGVA_ENDPOINT,
		apiKey: typeof state.apiKey === "string" ? state.apiKey : "",
		email: typeof state.email === "string" ? state.email : "",
	};
}

export const useTranslatorStore = create<TranslatorState>()(
	persist(
		(set) => ({
			provider: DEFAULT_TRANSLATOR_PROVIDER,
			endpoint: DEFAULT_TRANSLATOR_ENDPOINT,
			lingvaEndpoint: DEFAULT_LINGVA_ENDPOINT,
			apiKey: "",
			email: "",
			setProvider: (provider) => set({ provider }),
			setEndpoint: (endpoint) => set({ endpoint: endpoint.trim() }),
			setLingvaEndpoint: (endpoint) => set({ lingvaEndpoint: endpoint.trim() }),
			setApiKey: (apiKey) => set({ apiKey }),
			setEmail: (email) => set({ email: email.trim() }),
			useBuiltInEndpoint: () => set({ endpoint: DEFAULT_TRANSLATOR_ENDPOINT }),
			useDefaultLingvaEndpoint: () =>
				set({ lingvaEndpoint: DEFAULT_LINGVA_ENDPOINT }),
		}),
		{
			name: "supportos:translator-settings:v1",
			version: 4,
			migrate: migrateTranslatorState,
		},
	),
);
