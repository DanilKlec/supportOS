import { useKnowledgeStore } from "@/store";

import { WorkspaceTabs } from "./WorkspaceTabs";
import { BindViewer } from "./BindViewer";
import { EmptyWorkspace } from "./EmptyWorkspace";

export function BindWorkspace() {
  const activeTab = useKnowledgeStore((s) => s.activeTab);

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-background">

      <WorkspaceTabs />

      {activeTab ? (
        <BindViewer />
      ) : (
        <EmptyWorkspace />
      )}

    </main>
  );
}
