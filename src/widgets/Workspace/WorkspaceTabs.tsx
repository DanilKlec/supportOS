import { FileText, MoreHorizontal, Pin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Bind } from "@/entities/bind";
import { useKnowledgeStore } from "@/store";

const MAX_VISIBLE_UNPINNED_TABS = 15;

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

function getVisibleUnpinnedTabIds(tabIds: string[], activeTab?: string) {
	if (tabIds.length <= MAX_VISIBLE_UNPINNED_TABS) return tabIds;

	const visibleTabIds = tabIds.slice(0, MAX_VISIBLE_UNPINNED_TABS);

	if (
		!activeTab ||
		visibleTabIds.includes(activeTab) ||
		!tabIds.includes(activeTab)
	) {
		return visibleTabIds;
	}

	return [...visibleTabIds.slice(0, MAX_VISIBLE_UNPINNED_TABS - 1), activeTab];
}

export function WorkspaceTabs() {
	const [overflowOpen, setOverflowOpen] = useState(false);
	const overflowRef = useRef<HTMLDivElement>(null);
	const openedTabs = useKnowledgeStore((s) => s.openedTabs);
	const pinnedTabs = useKnowledgeStore((s) => s.pinnedTabs);
	const activeTab = useKnowledgeStore((s) => s.activeTab);
	const language = useKnowledgeStore((s) => s.language);
	const getBind = useKnowledgeStore((s) => s.getBind);
	const setActiveTab = useKnowledgeStore((s) => s.setActiveTab);
	const closeTab = useKnowledgeStore((s) => s.closeTab);
	const togglePinnedTab = useKnowledgeStore((s) => s.togglePinnedTab);
	const pinnedTabIds = pinnedTabs.filter((id) => openedTabs.includes(id));
	const unpinnedTabIds = openedTabs.filter((id) => !pinnedTabs.includes(id));
	const visibleUnpinnedTabIds = getVisibleUnpinnedTabIds(
		unpinnedTabIds,
		activeTab,
	);
	const overflowTabIds = unpinnedTabIds.filter(
		(id) => !visibleUnpinnedTabIds.includes(id),
	);
	const visibleTabIds = [...pinnedTabIds, ...visibleUnpinnedTabIds];
	const visibleTabs = visibleTabIds
		.map((id) => getBind(id))
		.filter((bind): bind is Bind => Boolean(bind));
	const overflowTabs = overflowTabIds
		.map((id) => getBind(id))
		.filter((bind): bind is Bind => Boolean(bind));

	useEffect(() => {
		if (!overflowOpen) return undefined;

		const closeOnOutsideClick = (event: PointerEvent) => {
			if (overflowRef.current?.contains(event.target as Node)) return;

			setOverflowOpen(false);
		};

		window.addEventListener("pointerdown", closeOnOutsideClick);

		return () => {
			window.removeEventListener("pointerdown", closeOnOutsideClick);
		};
	}, [overflowOpen]);

	const activateTab = (id: string) => {
		setActiveTab(id);
		setOverflowOpen(false);
	};

	const pinTab = (id: string) => {
		togglePinnedTab(id);
		setOverflowOpen(false);
	};

	const removeTab = (id: string) => {
		closeTab(id);
		setOverflowOpen(false);
	};

	return (
		<div className="min-h-11 border-b border-border bg-surface">
			{visibleTabs.length > 0 || overflowTabs.length > 0 ? (
				<div className="flex min-w-0 flex-wrap content-start gap-1 px-2 py-2">
					{visibleTabs.map((bind) => {
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
									onClick={() => activateTab(bind.id)}
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
									onClick={() => pinTab(bind.id)}
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
										onClick={() => removeTab(bind.id)}
										className="rounded p-0.5 opacity-50 hover:bg-surface hover:opacity-100"
									>
										<X size={14} />
									</button>
								)}
							</div>
						);
					})}

					{overflowTabs.length > 0 && (
						<div ref={overflowRef} className="relative shrink-0">
							<button
								type="button"
								aria-label="More tabs"
								aria-expanded={overflowOpen}
								title="More tabs"
								onClick={() => setOverflowOpen((open) => !open)}
								className="flex h-9 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-muted transition hover:bg-surface-elevated hover:text-foreground"
							>
								<MoreHorizontal size={16} />
								<span className="min-w-4 text-xs">{overflowTabs.length}</span>
							</button>

							{overflowOpen && (
								<div className="absolute right-0 top-10 z-30 w-72 overflow-hidden rounded-md border border-border bg-surface shadow-2xl">
									<div className="max-h-80 overflow-y-auto py-1">
										{overflowTabs.map((bind) => {
											const active = bind.id === activeTab;
											const pinned = pinnedTabs.includes(bind.id);

											return (
												<div
													key={bind.id}
													className={`group flex h-10 items-center gap-2 px-2 text-sm ${
														active
															? "bg-accent/15 text-foreground"
															: "text-muted hover:bg-surface-elevated hover:text-foreground"
													}`}
												>
													<button
														type="button"
														onClick={() => activateTab(bind.id)}
														className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
														onClick={() => pinTab(bind.id)}
														className={`rounded p-0.5 hover:bg-background ${
															pinned
																? "text-accent opacity-100"
																: "opacity-60 group-hover:opacity-100"
														}`}
													>
														<Pin
															size={13}
															fill={pinned ? "currentColor" : "none"}
														/>
													</button>

													{!pinned && (
														<button
															type="button"
															aria-label="Close tab"
															onClick={() => removeTab(bind.id)}
															className="rounded p-0.5 opacity-60 hover:bg-background hover:opacity-100"
														>
															<X size={14} />
														</button>
													)}
												</div>
											);
										})}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			) : (
				<span className="block px-4 py-3 text-sm text-muted">
					No bind opened
				</span>
			)}
		</div>
	);
}
