import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
	WorkspaceLayoutSettings,
	WorkspaceMode,
} from "@/entities/workspace";

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayoutSettings = {
	sidebarWidth: "standard",
	contentWidth: "standard",
	showTopbar: true,
	showSidebar: true,
	showTabs: true,
	showTranslatorWidget: true,
	showSidebarFavorites: true,
	showSidebarRecentFolders: true,
	showSidebarTools: true,
};

interface WorkspaceState {
	mode: WorkspaceMode;

	layout: WorkspaceLayoutSettings;

	selectedCategory?: string;

	selectedFolder?: string;

	openedBind?: string;

	setMode: (mode: WorkspaceMode) => void;

	setLayout: (patch: Partial<WorkspaceLayoutSettings>) => void;

	resetLayout: () => void;

	setCategory: (id?: string) => void;

	setFolder: (id?: string) => void;

	openBind: (id?: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
	persist(
		(set) => ({
			mode: "knowledge",

			layout: DEFAULT_WORKSPACE_LAYOUT,

			selectedCategory: undefined,

			selectedFolder: undefined,

			openedBind: undefined,

			setMode: (mode) =>
				set({
					mode,
				}),

			setLayout: (patch) =>
				set((state) => ({
					layout: {
						...state.layout,
						...patch,
					},
				})),

			resetLayout: () =>
				set({
					layout: DEFAULT_WORKSPACE_LAYOUT,
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
		}),
		{
			name: "supportos:workspace-layout:v1",
			partialize: (state) => ({
				layout: state.layout,
			}),
		},
	),
);
