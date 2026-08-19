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
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOverflowOpen(false);
			}
		};

		window.addEventListener("pointerdown", closeOnOutsideClick);
		window.addEventListener("keydown", closeOnEscape);

		return () => {
			window.removeEventListener("pointerdown", closeOnOutsideClick);
			window.removeEventListener("keydown", closeOnEscape);
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

	if (visibleTabs.length === 0 && overflowTabs.length === 0) {
		return (
			<div className="flex h-10 shrink-0 items-center border-b border-border bg-surface px-4 text-sm text-muted">
				No material opened
			</div>
		);
	}

	return (
		<div
			ref={overflowRef}
			className="relative h-10 shrink-0 border-b border-border bg-surface"
		>
			<div className="supportos-scroll flex h-full min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden px-2">
				{visibleTabs.map((bind) => {
					const active = bind.id === activeTab;
					const pinned = pinnedTabs.includes(bind.id);

					return (
						<div
							key={bind.id}
							className={`group flex h-8 max-w-[13rem] shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm transition ${
								active
									? "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--color-border)]"
									: pinned
										? "bg-accent/10 text-foreground hover:bg-accent/15"
										: "text-muted hover:bg-surface-elevated hover:text-foreground"
							}`}
						>
							<button
								type="button"
								onClick={() => activateTab(bind.id)}
								className="flex min-w-0 flex-1 items-center gap-2 focus-visible:outline-none"
								title={getBindTitle(bind, language)}
							>
								{pinned ? (
									<Pin
										size={13}
										className="shrink-0 text-accent"
										fill="currentColor"
									/>
								) : (
									<FileText size={14} className="shrink-0" />
								)}

								<span className="truncate">{getBindTitle(bind, language)}</span>
							</button>

							<button
								type="button"
								aria-label={pinned ? "Unpin tab" : "Pin tab"}
								title={pinned ? "Unpin" : "Pin"}
								onClick={() => pinTab(bind.id)}
								className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface ${
									pinned
										? "text-accent opacity-100"
										: "opacity-50 group-hover:opacity-100 group-focus-within:opacity-100"
								}`}
							>
								<Pin size={13} fill={pinned ? "currentColor" : "none"} />
							</button>

							{!pinned && (
								<button
									type="button"
									aria-label="Close tab"
									title="Close"
									onClick={() => removeTab(bind.id)}
									className="flex h-6 w-6 items-center justify-center rounded-md opacity-60 hover:bg-surface hover:opacity-100 group-focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
								>
									<X size={14} />
								</button>
							)}
						</div>
					);
				})}

				{overflowTabs.length > 0 && (
					<div className="shrink-0">
						<button
							type="button"
							aria-label="More tabs"
							aria-expanded={overflowOpen}
							title="More tabs"
							onClick={() => setOverflowOpen((open) => !open)}
							className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted transition hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
						>
							<MoreHorizontal size={16} />
							<span className="min-w-4 text-xs">{overflowTabs.length}</span>
						</button>
					</div>
				)}
			</div>

			{overflowOpen && (
				<div className="absolute right-2 top-9 z-30 w-72 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-2xl">
					<div className="supportos-scroll max-h-80 overflow-y-auto">
						{overflowTabs.map((bind) => {
							const active = bind.id === activeTab;
							const pinned = pinnedTabs.includes(bind.id);

							return (
								<div
									key={bind.id}
									className={`group flex min-h-10 items-center gap-2 px-2 text-sm ${
										active
											? "bg-accent/10 text-foreground"
											: "text-muted hover:bg-surface-elevated hover:text-foreground"
									}`}
								>
									<button
										type="button"
										onClick={() => activateTab(bind.id)}
										className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left focus-visible:outline-none"
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
										className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-background ${
											pinned
												? "text-accent opacity-100"
												: "opacity-60 group-hover:opacity-100"
										}`}
									>
										<Pin size={13} fill={pinned ? "currentColor" : "none"} />
									</button>

									{!pinned && (
										<button
											type="button"
											aria-label="Close tab"
											onClick={() => removeTab(bind.id)}
											className="flex h-7 w-7 items-center justify-center rounded-md opacity-60 hover:bg-background hover:opacity-100"
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
	);
}
