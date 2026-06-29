import { Link, useNavigate } from "@tanstack/react-router";
import {
	Archive,
	Check,
	Contact,
	Download,
	FileText,
	Folder,
	Gift,
	HeartPulse,
	Pin,
	Plus,
	Search,
	Star,
	Tag,
	Trophy,
	Wrench,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Bind } from "@/entities/bind";
import type { KnowledgeFolder, KnowledgeTreeNode } from "@/entities/knowledge";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { scoreTextSearch } from "@/shared/lib/bind-search";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore, useWorkspaceStore } from "@/store";

import { Tree } from "./Tree";

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

function getNodeSearchText(node: KnowledgeTreeNode) {
	return [
		node.name,
		node.bind?.slug,
		node.bind?.tags.join(" "),
		node.bind?.translations
			.map((translation) => `${translation.title} ${translation.content}`)
			.join(" "),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function getNodeSearchParts(node: KnowledgeTreeNode) {
	return [
		node.name,
		node.bind?.slug,
		node.bind?.tags.join(" "),
		node.bind?.translations
			.map((translation) => `${translation.title} ${translation.content}`)
			.join(" "),
	].filter(Boolean) as string[];
}

function nodeMatchesTag(node: KnowledgeTreeNode, tag: string) {
	return node.bind?.tags.includes(tag) ?? false;
}

function filterTree(
	nodes: KnowledgeTreeNode[],
	query: string,
	tag: string,
): KnowledgeTreeNode[] {
	const normalizedQuery = query.trim().toLowerCase();

	if (!normalizedQuery && !tag) return nodes;

	return nodes
		.map((node) => {
			const children = filterTree(node.children, normalizedQuery, tag);
			const queryMatches =
				!normalizedQuery ||
				getNodeSearchText(node).includes(normalizedQuery) ||
				scoreTextSearch(normalizedQuery, getNodeSearchParts(node)) > 0;
			const tagMatches = !tag || nodeMatchesTag(node, tag);

			if ((queryMatches && tagMatches) || children.length > 0) {
				return {
					...node,
					children,
				};
			}

			return undefined;
		})
		.filter((node): node is KnowledgeTreeNode => Boolean(node));
}

const sidebarWidthClass = {
	narrow: "w-64",
	standard: "w-72",
	wide: "w-80",
};

export function Sidebar() {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const layout = useWorkspaceStore((s) => s.layout);
	const tree = useKnowledgeStore((s) => s.tree);
	const binds = useKnowledgeStore((s) => s.binds);
	const categories = useKnowledgeStore((s) => s.categories);
	const favorites = useKnowledgeStore((s) => s.favorites);
	const favoriteFolders = useKnowledgeStore((s) => s.favoriteFolders);
	const recentFolders = useKnowledgeStore((s) => s.recentFolders);
	const folders = useKnowledgeStore((s) => s.folders);
	const language = useKnowledgeStore((s) => s.language);
	const openBind = useKnowledgeStore((s) => s.openBind);
	const selectFolder = useKnowledgeStore((s) => s.selectFolder);
	const [treeSearch, setTreeSearch] = useState("");
	const [selectedTag, setSelectedTag] = useState("");
	const [selectedBindIds, setSelectedBindIds] = useState<string[]>([]);
	const [bulkTag, setBulkTag] = useState("");
	const [bulkTagOpen, setBulkTagOpen] = useState(false);
	const tags = useMemo(
		() =>
			Array.from(new Set(binds.flatMap((bind) => bind.tags)))
				.filter(Boolean)
				.sort((a, b) => a.localeCompare(b)),
		[binds],
	);
	const filteredTree = useMemo(
		() => filterTree(tree, treeSearch, selectedTag),
		[tree, treeSearch, selectedTag],
	);
	const treeSearchActive = treeSearch.trim().length > 0 || Boolean(selectedTag);

	const favoriteBinds = favorites
		.map((id) => binds.find((bind) => bind.id === id))
		.filter((bind): bind is Bind => Boolean(bind));
	const favoriteFolderItems = favoriteFolders
		.map((id) => folders.find((folder) => folder.id === id))
		.filter((folder): folder is KnowledgeFolder => Boolean(folder));
	const recentFolderItems = recentFolders
		.map((id) => folders.find((folder) => folder.id === id))
		.filter((folder): folder is KnowledgeFolder => Boolean(folder));
	const selectedBinds = selectedBindIds
		.map((id) => binds.find((bind) => bind.id === id))
		.filter((bind): bind is Bind => Boolean(bind));
	const allSelectedFavorite =
		selectedBinds.length > 0 && selectedBinds.every((bind) => bind.favorite);
	const allSelectedPinned =
		selectedBinds.length > 0 && selectedBinds.every((bind) => bind.pinned);
	const createCategory = () => {
		modalManager.open("createCategory");
	};
	const toggleSelectedBind = (id: string) => {
		setSelectedBindIds((ids) =>
			ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
		);
	};
	const setSelectedFavorite = () => {
		if (selectedBindIds.length === 0) return;

		const favorite = !allSelectedFavorite;
		const changed = knowledgeService.updateManyBinds(selectedBindIds, {
			favorite,
		});

		showToast(
			favorite
				? `${changed.length} bind(s) added to favorites`
				: `${changed.length} bind(s) removed from favorites`,
		);
	};
	const setSelectedPinned = () => {
		if (selectedBindIds.length === 0) return;

		const pinned = !allSelectedPinned;
		const changed = knowledgeService.updateManyBinds(selectedBindIds, {
			pinned,
		});

		showToast(
			pinned
				? `${changed.length} bind(s) pinned`
				: `${changed.length} bind(s) unpinned`,
		);
	};
	const archiveSelected = () => {
		if (selectedBindIds.length === 0) return;

		const ids = [...selectedBindIds];
		const archived = knowledgeService.archiveManyBinds(ids);

		setSelectedBindIds([]);
		showToast(`${archived.length} bind(s) archived`, {
			action: {
				label: "Undo",
				onClick: () => {
					knowledgeService.updateManyBinds(ids, { archived: false });
					showToast("Archive undone");
				},
			},
			duration: 7000,
		});
	};
	const addTagToSelected = () => {
		if (selectedBindIds.length === 0 || !bulkTag.trim()) return;

		const changed = knowledgeService.addTagToBinds(selectedBindIds, bulkTag);

		setBulkTag("");
		setBulkTagOpen(false);
		showToast(`${changed.length} bind(s) tagged`);
	};
	const exportSelected = () => {
		if (selectedBinds.length === 0) return;

		const selectedFolderIds = new Set(
			selectedBinds
				.map((bind) => bind.folderId)
				.filter((id): id is string => Boolean(id)),
		);
		let changed = true;

		while (changed) {
			changed = false;

			for (const folder of folders) {
				if (
					folder.parentId &&
					selectedFolderIds.has(folder.id) &&
					!selectedFolderIds.has(folder.parentId)
				) {
					selectedFolderIds.add(folder.parentId);
					changed = true;
				}
			}
		}

		const exportedFolders = folders.filter((folder) =>
			selectedFolderIds.has(folder.id),
		);
		const selectedCategoryIds = new Set([
			...selectedBinds.map((bind) => bind.categoryId),
			...exportedFolders.map((folder) => folder.categoryId),
		]);
		const blob = new Blob(
			[
				JSON.stringify(
					{
						categories: categories.filter((category) =>
							selectedCategoryIds.has(category.id),
						),
						folders: exportedFolders,
						binds: selectedBinds,
					},
					null,
					2,
				),
			],
			{ type: "application/json" },
		);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");

		anchor.href = url;
		anchor.download = `supportos-selected-${new Date().toISOString().slice(0, 10)}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		showToast("Selected binds exported");
	};

	const renderBindShortcut = (bind: Bind) => (
		<button
			key={bind.id}
			type="button"
			onClick={() => {
				openBind(bind.id);
				void navigate({ to: "/" });
			}}
			className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-accent/10 hover:text-foreground"
		>
			<FileText size={14} className="shrink-0" />
			<span className="truncate">{getBindTitle(bind, language)}</span>
		</button>
	);
	const renderFolderShortcut = (folder: KnowledgeFolder) => (
		<button
			key={folder.id}
			type="button"
			onClick={() => {
				selectFolder(folder.id);
				void navigate({ to: "/" });
			}}
			className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-accent/10 hover:text-foreground"
		>
			<Folder size={14} className="shrink-0" />
			<span className="truncate">{folder.name}</span>
		</button>
	);

	return (
		<aside
			className={`flex h-full ${sidebarWidthClass[layout.sidebarWidth]} flex-col border-r border-border bg-surface`}
		>
			{layout.showSidebarFavorites && (
				<div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
						<Star size={13} />
						Favorites
					</div>

					{favoriteFolderItems.length > 0 && (
						<div className="mb-2 space-y-0.5">
							{favoriteFolderItems.map(renderFolderShortcut)}
						</div>
					)}

					{favoriteBinds.length > 0 ? (
						<div className="space-y-0.5">
							{favoriteBinds.map(renderBindShortcut)}
						</div>
					) : favoriteFolderItems.length === 0 ? (
						<div className="px-2 text-xs text-muted">No favorites yet</div>
					) : null}
				</div>
			)}

			{layout.showSidebarRecentFolders && (
				<div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
						Recent folders
					</div>

					{recentFolderItems.length > 0 ? (
						<div className="space-y-0.5">
							{recentFolderItems.map(renderFolderShortcut)}
						</div>
					) : (
						<div className="px-2 text-xs text-muted">No folders opened yet</div>
					)}
				</div>
			)}

			{/* <div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
						<Clock3 size={13} />
						Recent
					</div>

					{recentBinds.length > 0 ? (
						<div className="space-y-0.5">
							{recentBinds.map(renderBindShortcut)}
						</div>
					) : (
						<div className="px-2 text-xs text-muted">Nothing opened yet</div>
					)}
				</div> */}

			{layout.showSidebarTools && (
				<div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
						Tools
					</div>

					<div className="space-y-0.5">
						{/* <Link
							to="/translator"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Languages size={14} />
							<span>Translator</span>
						</Link> */}

						{/* <Link
							to="/settings/translator"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Settings size={14} />
							<span>Translator Settings</span>
						</Link> */}

						<Link
							to="/bonuses"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Gift size={14} />
							<span>Deposit Bonuses</span>
						</Link>

						<Link
							to="/bonus-tools"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Wrench size={14} />
							<span>Bonus Tools</span>
						</Link>

						<Link
							to="/sports-betting"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Trophy size={14} />
							<span>Sports Betting</span>
						</Link>

						<Link
							to="/project-emails"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Contact size={14} />
							<span>Project Emails</span>
						</Link>

						<Link
							to="/health"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<HeartPulse size={14} />
							<span>Knowledge Health</span>
						</Link>

						<Link
							to="/archive"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Archive size={14} />
							<span>Archive</span>
						</Link>
					</div>
				</div>
			)}

			{/* <div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
						AI
					</div>

					<div className="space-y-0.5">
						<Link
							to="/ai/assistant"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Bot size={14} />
							<span>AI Assistant</span>
						</Link>

						<Link
							to="/ai/knowledge"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<BrainCircuit size={14} />
							<span>AI Knowledge</span>
						</Link>
					</div>
				</div> */}

			<div className="flex min-h-0 flex-1 flex-col">
				<div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-3 flex items-center justify-between px-2">
						<div className="text-xs font-semibold uppercase tracking-wider text-muted">
							Categories
						</div>

						<button
							type="button"
							title="New category"
							onClick={createCategory}
							className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<Plus size={15} />
						</button>
					</div>

					<div className="relative">
						<Search
							size={14}
							className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
						/>
						<input
							type="search"
							value={treeSearch}
							onChange={(event) => setTreeSearch(event.target.value)}
							placeholder="Search tree"
							className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-8 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
						/>
						{treeSearchActive && (
							<button
								type="button"
								title="Clear search"
								onClick={() => {
									setTreeSearch("");
									setSelectedTag("");
								}}
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								<X size={14} />
							</button>
						)}
					</div>

					{tags.length > 0 && (
						<div className="mt-3 flex flex-wrap gap-1.5">
							{tags.map((tag) => (
								<button
									key={tag}
									type="button"
									onClick={() =>
										setSelectedTag((current) => (current === tag ? "" : tag))
									}
									className={`max-w-full rounded-full border px-2 py-1 text-xs transition ${
										selectedTag === tag
											? "border-accent bg-accent text-accent-foreground"
											: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
									}`}
								>
									<span className="break-all">#{tag}</span>
								</button>
							))}
						</div>
					)}

					{selectedBindIds.length > 0 && (
						<div className="mt-3 rounded-md border border-accent/30 bg-accent/10 p-2 text-xs text-muted">
							<div className="mb-2 flex items-center justify-between gap-2">
								<span>
									<span className="font-semibold text-foreground">
										{selectedBindIds.length}
									</span>{" "}
									selected - drag or use actions
								</span>
								<button
									type="button"
									onClick={() => setSelectedBindIds([])}
									className="rounded p-1 text-foreground hover:bg-accent/15"
									title="Clear selection"
								>
									<X size={13} />
								</button>
							</div>

							<div className="flex flex-wrap gap-1">
								<button
									type="button"
									onClick={setSelectedFavorite}
									className="rounded-md border border-accent/30 bg-background/40 p-1.5 text-foreground hover:bg-accent/15"
									title={
										allSelectedFavorite
											? "Remove from favorites"
											: "Add to favorites"
									}
								>
									<Star
										size={14}
										fill={allSelectedFavorite ? "currentColor" : "none"}
									/>
								</button>
								<button
									type="button"
									onClick={setSelectedPinned}
									className="rounded-md border border-accent/30 bg-background/40 p-1.5 text-foreground hover:bg-accent/15"
									title={allSelectedPinned ? "Unpin selected" : "Pin selected"}
								>
									<Pin
										size={14}
										fill={allSelectedPinned ? "currentColor" : "none"}
									/>
								</button>
								<button
									type="button"
									onClick={() => setBulkTagOpen((value) => !value)}
									className="rounded-md border border-accent/30 bg-background/40 p-1.5 text-foreground hover:bg-accent/15"
									title="Add tag"
								>
									<Tag size={14} />
								</button>
								<button
									type="button"
									onClick={exportSelected}
									className="rounded-md border border-accent/30 bg-background/40 p-1.5 text-foreground hover:bg-accent/15"
									title="Export selected"
								>
									<Download size={14} />
								</button>
								<button
									type="button"
									onClick={archiveSelected}
									className="rounded-md border border-red-500/30 bg-background/40 p-1.5 text-red-300 hover:bg-red-500/10"
									title="Archive selected"
								>
									<Archive size={14} />
								</button>
							</div>

							{bulkTagOpen && (
								<div className="mt-2 flex gap-1">
									<input
										value={bulkTag}
										onChange={(event) => setBulkTag(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												addTagToSelected();
											}
										}}
										placeholder="Tag"
										className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-accent"
									/>
									<button
										type="button"
										onClick={addTagToSelected}
										className="rounded-md border border-accent/30 bg-accent px-2 text-accent-foreground"
										title="Apply tag"
									>
										<Check size={14} />
									</button>
								</div>
							)}
						</div>
					)}
				</div>

				<div className="supportos-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
					<Tree
						nodes={filteredTree}
						forceExpanded={treeSearchActive}
						selectedBindIds={selectedBindIds}
						onToggleBindSelection={toggleSelectedBind}
						onClearBindSelection={() => setSelectedBindIds([])}
					/>
				</div>
			</div>
		</aside>
	);
}
