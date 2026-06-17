import { create } from "zustand";

interface SearchState {
  query: string;

  opened: boolean;

  setQuery: (query: string) => void;

  open: () => void;

  close: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",

  opened: false,

  setQuery: (query) =>
    set({
      query,
    }),

  open: () =>
    set({
      opened: true,
    }),

  close: () =>
    set({
      opened: false,
      query: "",
    }),
}));