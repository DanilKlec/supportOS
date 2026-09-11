import { useKnowledgeStore, useWorkspaceStore } from "@/store";
import { BindViewer } from "./BindViewer";
import { EmptyWorkspace } from "./EmptyWorkspace";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { WorkspaceSharedBindViewer } from "@/features/shared-binds/WorkspaceSharedBinds";

export function BindWorkspace() {
	const activeTab = useKnowledgeStore((s) => s.activeTab);
	const showTabs = useWorkspaceStore((s) => s.layout.showTabs);
	const remote = useKnowledgeStore((s) =>
		s.remoteBinds.find((b) => b.id === activeTab),
	);

	return (
		<main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
			{showTabs && <WorkspaceTabs />}

			{activeTab ? (
				remote ? (
					<WorkspaceSharedBindViewer
						key={activeTab}
						id={remote.sourceBindId ?? remote.id}
					/>
				) : (
					<BindViewer />
				)
			) : (
				<EmptyWorkspace />
			)}
		</main>
	);
}
