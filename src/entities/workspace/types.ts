export type WorkspaceMode = "knowledge" | "favorites" | "recent";

export type WorkspaceSidebarWidth = "narrow" | "standard" | "wide";

export type WorkspaceContentWidth = "standard" | "wide" | "full";

export interface WorkspaceLayoutSettings {
	sidebarWidth: WorkspaceSidebarWidth;
	contentWidth: WorkspaceContentWidth;
	showTopbar: boolean;
	showSidebar: boolean;
	showTabs: boolean;
	showTranslatorWidget: boolean;
	showSidebarFavorites: boolean;
	showSidebarRecentFolders: boolean;
	showSidebarTools: boolean;
}
