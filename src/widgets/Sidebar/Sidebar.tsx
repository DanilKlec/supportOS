import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Archive,
	Check,
	Download,
	FileText,
	Folder,
	Layers3,
	ListTree,
	ChevronsLeft,
	PanelLeftClose,
	Pin,
	Plus,
	Search,
	Star,
	Tag,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, IconButton, Input } from "@/components/ui";
import type { Bind } from "@/entities/bind";
import type { KnowledgeFolder, KnowledgeTreeNode } from "@/entities/knowledge";
import { usePreference } from "@/features/productivity/preferences";
import { WorkspaceTree } from "@/features/shared-binds/WorkspaceSharedBinds";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { useViewState } from "@/shared/hooks/useViewState";
import { scoreTextSearch } from "@/shared/lib/bind-search";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore, useWorkspaceStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import "./workspace-tree.css";

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
	standard: "w-[290px]",
	wide: "w-80",
};

interface SidebarProps {
	mobile?: boolean;
	onRequestClose?: () => void;
	onNavigate?: () => void;
}

export function Sidebar({
	mobile = false,
	onRequestClose,
	onNavigate,
}: SidebarProps) {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [sidebarPixels] = usePreference("sidebar-pixels", 290);
	const { showToast } = useToast();
	const layout = useWorkspaceStore((s) => s.layout);
	const setLayout = useWorkspaceStore((s) => s.setLayout);
	const binds = useKnowledgeStore((s) => s.binds);
	const actor = useAuthStore((s) => s.session?.user.id);
	const archiveCount = binds.filter(
		(bind) => bind.archived && bind.ownerId === actor,
	).length;
	const categories = useKnowledgeStore((s) => s.categories);
	const favorites = useKnowledgeStore((s) => s.favorites);
	const favoriteFolders = useKnowledgeStore((s) => s.favoriteFolders);
	const folders = useKnowledgeStore((s) => s.folders);
	const language = useKnowledgeStore((s) => s.language);
	const openBind = useKnowledgeStore((s) => s.openBind);
	const selectFolder = useKnowledgeStore((s) => s.selectFolder);
	const [treeSearch, setTreeSearch] = useViewState(
		"knowledge-tree",
		"search",
		"",
	);
	const [selectedTag, setSelectedTag] = useViewState(
		"knowledge-tree",
		"tag",
		"",
	);
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
	const treeSearchActive = treeSearch.trim().length > 0 || Boolean(selectedTag);

	const favoriteBinds = favorites
		.map((id) => binds.find((bind) => bind.id === id))
		.filter((bind): bind is Bind => Boolean(bind));
	const favoriteFolderItems = favoriteFolders
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
				? `Добавлено в избранное: ${changed.length}`
				: `Удалено из избранного: ${changed.length}`,
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
				? `Закреплено биндов: ${changed.length}`
				: `Снято закрепление: ${changed.length}`,
		);
	};
	const archiveSelected = async () => {
		if (selectedBindIds.length === 0) return;
		try {
			const archived: Bind[] = [];
			for (const id of selectedBindIds) {
				const bind = useKnowledgeStore
					.getState()
					.binds.find((item) => item.id === id);
				archived.push(
					bind?.ownerId === actor && actor
						? await knowledgeService.setPersonalBindArchived(id, true)
						: knowledgeService.archiveBind(id),
				);
			}
			setSelectedBindIds([]);
			showToast(`Архивировано биндов: ${archived.length}`, {
				action: {
					label: "Отменить",
					onClick: () => {
						void Promise.all(
							archived.map((bind) =>
								bind.ownerId === actor
									? knowledgeService.setPersonalBindArchived(bind.id, false)
									: knowledgeService.restoreArchivedBind(bind.id),
							),
						)
							.then(() => showToast("Архивирование отменено"))
							.catch((error) =>
								showToast(
									error instanceof Error
										? error.message
										: "Не удалось восстановить бинды",
								),
							);
					},
				},
				duration: 7000,
			});
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Не удалось архивировать бинды",
			);
		}
	};
	const addTagToSelected = () => {
		if (selectedBindIds.length === 0 || !bulkTag.trim()) return;

		const changed = knowledgeService.addTagToBinds(selectedBindIds, bulkTag);

		setBulkTag("");
		setBulkTagOpen(false);
		showToast(`Теги добавлены: ${changed.length}`);
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
		showToast("Выбранные бинды экспортированы");
	};

	const renderBindShortcut = (bind: Bind) => (
		<button
			key={bind.id}
			type="button"
			onClick={() => {
				openBind(bind.id);
				void navigate({ to: "/" });
				onNavigate?.();
			}}
			className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
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
			className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
		>
			<Folder size={14} className="shrink-0" />
			<span className="truncate">{folder.name}</span>
		</button>
	);

	return (
		<aside
			style={
				mobile
					? undefined
					: { width: Math.min(480, Math.max(240, sidebarPixels)) }
			}
			aria-label="Библиотека материалов"
			className={`workspace-library flex h-full ${mobile ? "w-full" : sidebarWidthClass[layout.sidebarWidth]} flex-col border-r border-border pb-[env(safe-area-inset-bottom)]`}
		>
			<div className="workspace-library-heading">
				<div className="min-w-0 px-1">
					<div className="truncate text-sm font-semibold">Материалы</div>
					<div className="text-xs text-muted">
						{binds.filter((b) => !b.archived).length} ответов
					</div>
				</div>

				<IconButton
					label={mobile ? "Закрыть папки" : "Свернуть папки"}
					onClick={() =>
						mobile ? onRequestClose?.() : setLayout({ showSidebar: false })
					}
					className="text-muted transition hover:bg-surface-elevated hover:text-foreground"
				>
					{mobile ? <X size={18} /> : <PanelLeftClose size={18} />}
				</IconButton>
			</div>

			{layout.showSidebarFavorites &&
				(favoriteBinds.length > 0 || favoriteFolderItems.length > 0) && (
					<details className="shrink-0 border-b border-border/60 px-4 py-3">
						<summary className="cursor-pointer text-xs font-medium text-muted">
							Избранное{" "}
							<span className="ml-2 text-accent">
								{favoriteBinds.length + favoriteFolderItems.length}
							</span>
						</summary>
						<div className="supportos-scroll mt-3 max-h-40 space-y-1 overflow-auto">
							{favoriteFolderItems.map(renderFolderShortcut)}
							{favoriteBinds.map(renderBindShortcut)}
						</div>
					</details>
				)}

			<div className="flex min-h-0 flex-1 flex-col">
				<nav aria-label="Библиотека" className="workspace-library-tabs">
					{[
						["/", "Все"],
						["/favorites", "Избранное"],
						["/recent", "Недавние"],
					].map(([to, label]) => (
						<button
							key={to}
							type="button"
							className="space-tab sidebar-tab"
							aria-current={
								(
									to === "/"
										? ["/", "/binds"].includes(pathname)
										: pathname === to
								)
									? "page"
									: undefined
							}
							onClick={() => {
								void navigate({ to });
								onNavigate?.();
							}}
						>
							{label}
						</button>
					))}
				</nav>
				<div className="workspace-library-controls">
					<div className="workspace-library-structure-heading">
						<strong>Структура</strong>
						<div className="ui-actions">
							<IconButton
								label="Раскрыть все папки"
								size="small"
								variant="ghost"
								onClick={() =>
									useKnowledgeStore.setState({
										expandedFolders: [
											...new Set([
												...categories.map((c) => c.id),
												...folders.map((f) => f.id),
											]),
										],
									})
								}
							>
								<Layers3 size={14} />
							</IconButton>
							<IconButton
								label="Свернуть все папки"
								size="small"
								variant="ghost"
								onClick={() =>
									useKnowledgeStore.setState({ expandedFolders: [] })
								}
							>
								<ChevronsLeft size={14} />
							</IconButton>
							<IconButton
								label="Добавить категорию"
								onClick={createCategory}
								size="small"
								className="text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								<Plus size={15} />
							</IconButton>
						</div>
					</div>

					<div className="workspace-library-search">
						<Search
							size={14}
							className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
						/>
						<Input
							type="search"
							value={treeSearch}
							onChange={(event) => setTreeSearch(event.target.value)}
							placeholder="Поиск в папках…"
							aria-label="Поиск в дереве материалов"
							className="w-full bg-surface pl-9 pr-10 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
						/>
						{treeSearchActive && (
							<IconButton
								type="button"
								label="Очистить поиск"
								size="small"
								onClick={() => {
									setTreeSearch("");
									setSelectedTag("");
								}}
								className="absolute right-1 top-1/2 -translate-y-1/2 text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								<X size={14} />
							</IconButton>
						)}
					</div>

					{tags.length > 0 && (
						<details className="mt-3">
							<summary className="cursor-pointer text-xs text-muted">
								Фильтр по тегам{selectedTag ? ` · #${selectedTag}` : ""}
							</summary>
							<div className="supportos-scroll mt-3 flex max-h-20 flex-wrap gap-1.5 overflow-auto pr-1">
								{tags.map((tag) => (
									<button
										key={tag}
										type="button"
										onClick={() =>
											setSelectedTag((current) => (current === tag ? "" : tag))
										}
										className={`max-w-full rounded-lg border px-2 py-1 text-xs transition ${
											selectedTag === tag
												? "border-accent bg-accent text-accent-foreground"
												: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
										}`}
									>
										<span className="break-all">#{tag}</span>
									</button>
								))}
							</div>
						</details>
					)}

					{selectedBindIds.length > 0 && (
						<div className="mt-3 rounded-lg border border-accent/25 bg-accent/10 p-2 text-xs text-muted">
							<div className="mb-2 flex items-center justify-between gap-2">
								<span>
									<span className="font-semibold text-foreground">
										{selectedBindIds.length}
									</span>{" "}
									выбрано — перетащите или выберите действие
								</span>
								<IconButton
									type="button"
									onClick={() => setSelectedBindIds([])}
									size="small"
									className="text-foreground hover:bg-accent/15"
									label="Снять выделение"
								>
									<X size={13} />
								</IconButton>
							</div>

							<div className="ui-actions sidebar-bulk-actions">
								<Button
									type="button"
									size="small"
									className="sidebar-bulk-move border-accent/25 bg-background text-foreground"
									onClick={() =>
										modalManager.open("moveBind", { bindIds: selectedBindIds })
									}
								>
									Переместить выбранные
								</Button>
								<IconButton
									type="button"
									onClick={setSelectedFavorite}
									size="small"
									className="border-accent/25 bg-background text-foreground hover:bg-accent/15"
									label={
										allSelectedFavorite ? "Убрать из избранного" : "В избранное"
									}
								>
									<Star
										size={14}
										fill={allSelectedFavorite ? "currentColor" : "none"}
									/>
								</IconButton>
								<IconButton
									type="button"
									onClick={setSelectedPinned}
									size="small"
									className="border-accent/25 bg-background text-foreground hover:bg-accent/15"
									label={
										allSelectedPinned
											? "Открепить выбранные"
											: "Закрепить выбранные"
									}
								>
									<Pin
										size={14}
										fill={allSelectedPinned ? "currentColor" : "none"}
									/>
								</IconButton>
								<IconButton
									type="button"
									onClick={() => setBulkTagOpen((value) => !value)}
									size="small"
									className="border-accent/25 bg-background text-foreground hover:bg-accent/15"
									label="Добавить тег"
								>
									<Tag size={14} />
								</IconButton>
								<IconButton
									type="button"
									onClick={exportSelected}
									size="small"
									className="border-accent/25 bg-background text-foreground hover:bg-accent/15"
									label="Экспортировать выбранные"
								>
									<Download size={14} />
								</IconButton>
								<IconButton
									type="button"
									onClick={archiveSelected}
									size="small"
									className="border-red-500/30 bg-background text-red-300 hover:bg-red-500/10"
									label="Архивировать выбранные"
								>
									<Archive size={14} />
								</IconButton>
							</div>

							{bulkTagOpen && (
								<div className="ui-actions items-center mt-2 flex gap-1">
									<Input
										value={bulkTag}
										onChange={(event) => setBulkTag(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												addTagToSelected();
											}
										}}
										placeholder="Тег"
										className="ui-input--small min-w-0 flex-1 bg-background outline-none focus:border-accent"
									/>
									<IconButton
										type="button"
										onClick={addTagToSelected}
										variant="primary"
										size="small"
										label="Применить тег"
									>
										<Check size={14} />
									</IconButton>
								</div>
							)}
						</div>
					)}
				</div>

				<div className="workspace-library-scroll supportos-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<WorkspaceTree
						onNavigate={onNavigate}
						filterNodes={(nodes) => filterTree(nodes, treeSearch, selectedTag)}
						forceExpanded={treeSearchActive}
						selectedBindIds={selectedBindIds}
						onToggleBindSelection={toggleSelectedBind}
						onClearBindSelection={() => setSelectedBindIds([])}
					/>
				</div>
				<div className="workspace-library-bottom shrink-0 border-t border-border px-2 py-2">
					<button
						type="button"
						aria-current={pathname === "/archive" ? "page" : undefined}
						className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground aria-[current=page]:bg-surface-elevated aria-[current=page]:text-foreground"
						onClick={() => {
							void navigate({ to: "/archive" });
							onNavigate?.();
						}}
					>
						<Archive size={15} />
						<span>Личный архив</span>
						<span className="ml-auto tabular-nums">{archiveCount}</span>
					</button>
					<footer className="workspace-library-footer">
						<ListTree size={13} />
						<span>Папки и бинды можно перетаскивать</span>
					</footer>
				</div>
			</div>
		</aside>
	);
}
