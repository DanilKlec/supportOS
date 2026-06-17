import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TranslatorState {
	endpoint: string;
	apiKey: string;
	setEndpoint: (endpoint: string) => void;
	setApiKey: (apiKey: string) => void;
}

export const useTranslatorStore = create<TranslatorState>()(
	persist(
		(set) => ({
			endpoint: "http://localhost:5000",
			apiKey: "",
			setEndpoint: (endpoint) => set({ endpoint: endpoint.trim() }),
			setApiKey: (apiKey) => set({ apiKey }),
		}),
		{
			name: "supportos:translator-settings:v1",
		},
	),
);
