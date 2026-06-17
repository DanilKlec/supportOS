import { create } from "zustand";
import type { WorkspaceMode } from "@/entities/workspace";

interface WorkspaceState {
  mode: WorkspaceMode;

  selectedCategory?: string;

  selectedFolder?: string;

  openedBind?: string;

  setMode: (mode: WorkspaceMode) => void;

  setCategory: (id?: string) => void;

  setFolder: (id?: string) => void;

  openBind: (id?: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  mode: "knowledge",

  selectedCategory: undefined,

  selectedFolder: undefined,

  openedBind: undefined,

  setMode: (mode) =>
    set({
      mode,
    }),

  setCategory: (selectedCategory) =>
    set({
      selectedCategory,
    }),

  setFolder: (selectedFolder) =>
    set({
      selectedFolder,
    }),

  openBind: (openedBind) =>
    set({
      openedBind,
    }),
}));