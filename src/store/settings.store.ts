import { create } from "zustand";

interface SettingsState {
  theme: "dark" | "light";

  compactMode: boolean;

  toggleTheme: () => void;

  toggleCompact: () => void;
}

export const useSettingsStore =
  create<SettingsState>((set) => ({
    theme: "dark",

    compactMode: false,

    toggleTheme: () =>
      set((state) => ({
        theme:
          state.theme === "dark"
            ? "light"
            : "dark",
      })),

    toggleCompact: () =>
      set((state) => ({
        compactMode: !state.compactMode,
      })),
  }));