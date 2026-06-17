import { FileText, X } from "lucide-react";

import type { Bind } from "@/entities/bind";
import { useKnowledgeStore } from "@/store";

function getBindTitle(bind: Bind, language: string) {
  return (
    bind.translations.find(
      (translation) => translation.language === language,
    )?.title ??
    bind.translations.find(
      (translation) => translation.language === "ru",
    )?.title ??
    bind.translations.find(
      (translation) => translation.language === "en",
    )?.title ??
    bind.slug
  );
}

export function WorkspaceTabs() {
  const openedTabs = useKnowledgeStore((s) => s.openedTabs);
  const activeTab = useKnowledgeStore((s) => s.activeTab);
  const language = useKnowledgeStore((s) => s.language);
  const getBind = useKnowledgeStore((s) => s.getBind);
  const setActiveTab = useKnowledgeStore((s) => s.setActiveTab);
  const closeTab = useKnowledgeStore((s) => s.closeTab);

  const tabs = openedTabs
    .map((id) => getBind(id))
    .filter((bind): bind is Bind => Boolean(bind));

  return (
    <div className="flex h-11 items-center border-b border-border bg-surface">
      {tabs.length > 0 ? (
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((bind) => {
            const active = bind.id === activeTab;

            return (
              <div
                key={bind.id}
                className={`
                  group
                  flex
                  h-11
                  max-w-56
                  items-center
                  gap-2
                  border-r
                  border-border
                  px-3
                  text-sm
                  transition
                  ${
                    active
                      ? "bg-background text-foreground"
                      : "text-muted hover:bg-surface-elevated hover:text-foreground"
                  }
                `}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(bind.id)}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <FileText size={15} className="shrink-0" />

                  <span className="truncate">
                    {getBindTitle(bind, language)}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label="Close tab"
                  onClick={() => closeTab(bind.id)}
                  className="rounded p-0.5 opacity-60 hover:bg-surface hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="px-4 text-sm text-muted">
          No bind opened
        </span>
      )}
    </div>
  );
}
