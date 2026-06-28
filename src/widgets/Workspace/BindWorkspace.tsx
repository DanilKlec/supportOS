import { useKnowledgeStore, useWorkspaceStore } from "@/store";
import { BindViewer } from "./BindViewer";
import { EmptyWorkspace } from "./EmptyWorkspace";
import { WorkspaceTabs } from "./WorkspaceTabs";

export function BindWorkspace() {
	const activeTab = useKnowledgeStore((s) => s.activeTab);
	const showTabs = useWorkspaceStore((s) => s.layout.showTabs);

	return (
		<main className="flex flex-1 flex-col overflow-hidden bg-background">
			{showTabs && <WorkspaceTabs />}

			{activeTab ? <BindViewer /> : <EmptyWorkspace />}
		</main>
	);
}
