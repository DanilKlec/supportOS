import { Link, useNavigate } from "@tanstack/react-router";
import {
	Contact,
	FileText,
	Gift,
	Plus,
	Search,
	Star,
	Wrench,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Bind } from "@/entities/bind";
import type { KnowledgeTreeNode } from "@/entities/knowledge";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

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
				!normalizedQuery || getNodeSearchText(node).includes(normalizedQuery);
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

export function Sidebar() {
	const navigate = useNavigate();
	const tree = useKnowledgeStore((s) => s.tree);
	const binds = useKnowledgeStore((s) => s.binds);
	const favorites = useKnowledgeStore((s) => s.favorites);
	const language = useKnowledgeStore((s) => s.language);
	const openBind = useKnowledgeStore((s) => s.openBind);
	const [treeSearch, setTreeSearch] = useState("");
	const [selectedTag, setSelectedTag] = useState("");
	const [selectedBindIds, setSelectedBindIds] = useState<string[]>([]);
	const tags = useMemo(
		() =>
			Array.from(new Set(binds.flatMap((bind) => bind.tags)))
				.filter(Boolean)
				.sort((a, b) => a.localeCompare(b))
				.slice(0, 18),
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
	const createCategory = () => {
		modalManager.open("createCategory");
	};
	const toggleSelectedBind = (id: string) => {
		setSelectedBindIds((ids) =>
			ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
		);
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

	return (
		<aside className="flex h-full w-72 flex-col border-r border-border bg-surface">
			<div className="shrink-0 border-b border-border px-3 py-3">
				<div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
					<Star size={13} />
					Favorites
				</div>

				{favoriteBinds.length > 0 ? (
					<div className="space-y-0.5">
						{favoriteBinds.map(renderBindShortcut)}
					</div>
				) : (
					<div className="px-2 text-xs text-muted">No favorites yet</div>
				)}
			</div>

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
						to="/project-emails"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
					>
						<Contact size={14} />
						<span>Project Emails</span>
					</Link>
				</div>
			</div>

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
								onClick={() => setTreeSearch("")}
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								<X size={14} />
							</button>
						)}
					</div>

					{tags.length > 0 && (
						<div className="mt-3 flex gap-1 overflow-x-auto pb-1">
							{tags.map((tag) => (
								<button
									key={tag}
									type="button"
									onClick={() =>
										setSelectedTag((current) => (current === tag ? "" : tag))
									}
									className={`shrink-0 rounded-full border px-2 py-1 text-xs transition ${
										selectedTag === tag
											? "border-accent bg-accent text-accent-foreground"
											: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
									}`}
								>
									#{tag}
								</button>
							))}
						</div>
					)}

					{selectedBindIds.length > 0 && (
						<div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
							<span>{selectedBindIds.length} selected</span>
							<button
								type="button"
								onClick={() => setSelectedBindIds([])}
								className="rounded px-2 py-1 text-foreground hover:bg-surface-elevated"
							>
								Clear
							</button>
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
