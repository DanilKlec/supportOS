import { create } from "zustand";

interface LanguageState {
  current: string;

  setLanguage: (code: string) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  current: "en",

  setLanguage: (current) =>
    set({
      current,
    }),
}));