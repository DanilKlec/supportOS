export type WorkspaceSearchDestination =
	| { archiveEmail: string }
	| { mailboxId: string };

declare module "@tanstack/history" {
	interface HistoryState {
		workspaceSearch?: WorkspaceSearchDestination;
	}
}
