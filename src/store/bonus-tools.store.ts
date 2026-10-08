import { create } from "zustand";

import type { BonusToolsData } from "@/services/bonus-tools.service";

export const BONUS_TOOLS_LEGACY_STORAGE_KEY = "supportos:bonus-tools:v1";

export function clearLegacyBonusToolsRecords() {
	if (typeof window === "undefined") return;

	window.localStorage.removeItem(BONUS_TOOLS_LEGACY_STORAGE_KEY);
}

interface BonusToolsState {
	data?: BonusToolsData;
	setData: (data?: BonusToolsData) => void;
}

export const useBonusToolsStore = create<BonusToolsState>()((set) => ({
	data: undefined,
	setData: (data) => set({ data }),
}));
