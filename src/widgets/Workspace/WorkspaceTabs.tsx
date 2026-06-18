import { FileText, Pin, X } from "lucide-react";

import type { Bind } from "@/entities/bind";
import { useKnowledgeStore } from "@/store";

function getBindTitle(bind: Bind, language: string) {
	return (
		bind.translations.find((translation) => translation.language === language)
			?.title ??
		bind.translations.find((translation) => translation.language === "ru")
			?.title ??
		bind.translations.find((translation) => translation.language === "en")
			?.title ??
		bind.slug
	);
}

export function WorkspaceTabs() {
	const openedTabs = useKnowledgeStore((s) => s.openedTabs);
	const pinnedTabs = useKnowledgeStore((s) => s.pinnedTabs);
	const activeTab = useKnowledgeStore((s) => s.activeTab);
	const language = useKnowledgeStore((s) => s.language);
	const getBind = useKnowledgeStore((s) => s.getBind);
	const setActiveTab = useKnowledgeStore((s) => s.setActiveTab);
	const closeTab = useKnowledgeStore((s) => s.closeTab);
	const togglePinnedTab = useKnowledgeStore((s) => s.togglePinnedTab);
	const orderedTabIds = [
		...pinnedTabs.filter((id) => openedTabs.includes(id)),
		...openedTabs.filter((id) => !pinnedTabs.includes(id)),
	];
	const tabs = orderedTabIds
		.map((id) => getBind(id))
		.filter((bind): bind is Bind => Boolean(bind));

	return (
		<div className="min-h-11 border-b border-border bg-surface">
			{tabs.length > 0 ? (
				<div className="flex min-w-0 flex-wrap content-start gap-1 px-2 py-2">
					{tabs.map((bind) => {
						const active = bind.id === activeTab;
						const pinned = pinnedTabs.includes(bind.id);

						return (
							<div
								key={bind.id}
								className={`group flex h-9 max-w-64 basis-52 items-center gap-1.5 rounded-md border px-2 text-sm transition ${
									active
										? "border-accent/60 bg-background text-foreground"
										: pinned
											? "border-accent/30 bg-accent/10 text-foreground hover:bg-accent/15"
											: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
								}`}
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
									aria-label={pinned ? "Unpin tab" : "Pin tab"}
									title={pinned ? "Unpin" : "Pin"}
									onClick={() => togglePinnedTab(bind.id)}
									className={`rounded p-0.5 hover:bg-surface ${
										pinned
											? "text-accent opacity-100"
											: "opacity-50 group-hover:opacity-100"
									}`}
								>
									<Pin size={13} fill={pinned ? "currentColor" : "none"} />
								</button>

								{!pinned && (
									<button
										type="button"
										aria-label="Close tab"
										onClick={() => closeTab(bind.id)}
										className="rounded p-0.5 opacity-50 hover:bg-surface hover:opacity-100"
									>
										<X size={14} />
									</button>
								)}
							</div>
						);
					})}
				</div>
			) : (
				<span className="block px-4 py-3 text-sm text-muted">
					No bind opened
				</span>
			)}
		</div>
	);
}
