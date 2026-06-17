import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_TRANSLATOR_ENDPOINT = "/api/translator";

const LEGACY_DEFAULT_ENDPOINTS = new Set([
	"http://localhost:5000",
	"http://localhost:5000/",
	"http://127.0.0.1:5000",
	"http://127.0.0.1:5000/",
]);

interface TranslatorState {
	endpoint: string;
	apiKey: string;
	setEndpoint: (endpoint: string) => void;
	setApiKey: (apiKey: string) => void;
	useBuiltInEndpoint: () => void;
}

function migrateTranslatorState(persistedState: unknown) {
	const state =
		persistedState && typeof persistedState === "object"
			? (persistedState as Partial<TranslatorState>)
			: {};
	const endpoint =
		typeof state.endpoint === "string" ? state.endpoint.trim() : "";

	return {
		endpoint:
			endpoint && !LEGACY_DEFAULT_ENDPOINTS.has(endpoint)
				? endpoint
				: DEFAULT_TRANSLATOR_ENDPOINT,
		apiKey: typeof state.apiKey === "string" ? state.apiKey : "",
	};
}

export const useTranslatorStore = create<TranslatorState>()(
	persist(
		(set) => ({
			endpoint: DEFAULT_TRANSLATOR_ENDPOINT,
			apiKey: "",
			setEndpoint: (endpoint) => set({ endpoint: endpoint.trim() }),
			setApiKey: (apiKey) => set({ apiKey }),
			useBuiltInEndpoint: () => set({ endpoint: DEFAULT_TRANSLATOR_ENDPOINT }),
		}),
		{
			name: "supportos:translator-settings:v1",
			version: 2,
			migrate: migrateTranslatorState,
		},
	),
);
