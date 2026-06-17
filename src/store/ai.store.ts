import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AIState {
	apiKey: string;
	model: string;
	setApiKey: (apiKey: string) => void;
	setModel: (model: string) => void;
}

export const useAIStore = create<AIState>()(
	persist(
		(set) => ({
			apiKey: "",
			model: "gpt-5-mini",
			setApiKey: (apiKey) => set({ apiKey }),
			setModel: (model) => set({ model: model.trim() || "gpt-5-mini" }),
		}),
		{
			name: "supportos:ai-settings:v1",
		},
	),
);
