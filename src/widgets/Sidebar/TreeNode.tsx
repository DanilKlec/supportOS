import { useNavigate } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowUp,
	Check,
	ChevronDown,
	ChevronRight,
	Edit3,
	FileText,
	Folder,
	FolderOpen,
	FolderInput,
	FolderPlus,
	MoreHorizontal,
	Plus,
	Star,
	Trash2,
} from "lucide-react";
import {
	type DragEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { ActionMenuPortal } from "@/components/ActionMenuPortal";
import type { KnowledgeTreeNode } from "@/entities/knowledge";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import {
	getDraggedBindIds,
	getDraggedFolderId,
	hasBindDragData,
	hasFolderDragData,
	hasTreeDragData,
	setBindDragData,
	setFolderDragData,
} from "@/shared/lib/bind-drag";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";
import { countTreeBinds } from "./tree-utils";

interface Props {
	node: KnowledgeTreeNode;

	level: number;
	forceExpanded?: boolean;
	selectedBindIds?: string[];
	onToggleBindSelection?: (id: string) => void;
	onClearBindSelection?: () => void;
	onOpenItem?: () => void;
}

const INITIAL_CHILDREN_LIMIT = 120;
const CHILDREN_LIMIT_STEP = 240;

function createDragPreview(label: string, count: number) {
	const preview = document.createElement("div");

	preview.className =
		"fixed -top-20 left-0 z-50 rounded-md border border-accent/50 bg-surface px-3 py-2 text-xs font-medium text-foreground shadow-2xl";
	preview.textContent = count > 1 ? `Биндов: ${count}` : label;
	document.body.appendChild(preview);

	return preview;
}

function ActionMenuItem({
	icon,
	label,
	onClick,
	disabled = false,
	danger = false,
}: {
	icon: ReactNode;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`flex h-9 w-full items-center gap-2 px-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
				danger
					? "text-muted hover:bg-red-500/10 hover:text-red-400"
					: "text-muted hover:bg-surface-elevated hover:text-foreground"
			}`}
		>
			<span className="shrink-0">{icon}</span>
			<span className="truncate">{label}</span>
		</button>
	);
}

export function TreeNode({
	node,
	level,
	forceExpanded = false,
	selectedBindIds = [],
	onToggleBindSelection,
	onClearBindSelection,
	onOpenItem,
}: Props) {
	const navigate = useNavigate();
	const actionsRef = useRef<HTMLDivElement>(null);
	const menuContentRef = useRef<HTMLDivElement>(null);
	const [actionsOpen, setActionsOpen] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const [visibleChildrenLimit, setVisibleChildrenLimit] = useState(
		INITIAL_CHILDREN_LIMIT,
	);
	const { showToast } = useToast();
	const storedExpanded = useKnowledgeStore((s) =>
		s.expandedFolders.includes(node.id),
	);
	const expanded = forceExpanded || storedExpanded;
	const selectedBind = useKnowledgeStore((s) => s.selectedBind);
	const selectedCategory = useKnowledgeStore((s) => s.selectedCategory);
	const selectedFolder = useKnowledgeStore((s) => s.selectedFolder);
	const language = useKnowledgeStore((s) => s.language);
	const name =
		node.bind?.translations.find((t) => t.language === language)?.title ||
		node.name;
	const categories = useKnowledgeStore((s) => s.categories);
	const folders = useKnowledgeStore((s) => s.folders);
	const toggle = useKnowledgeStore((s) => s.toggleFolder);
	const selectBind = useKnowledgeStore((s) => s.selectBind);
	const selectCategory = useKnowledgeStore((s) => s.selectCategory);
	const selectFolder = useKnowledgeStore((s) => s.selectFolder);
	const favoriteFolders = useKnowledgeStore((s) => s.favoriteFolders);
	const toggleFavoriteFolder = useKnowledgeStore((s) => s.toggleFavoriteFolder);

	const folder = folders.find((item) => item.id === node.id);
	const structureOwner =
		node.type === "category"
			? categories.find((c) => c.id === node.id)?.ownerId
			: folder?.ownerId;
	const manageStructure =
		node.type === "bind" || knowledgeService.canManageStructure(structureOwner);
	const categoryId = node.type === "category" ? node.id : folder?.categoryId;
	const targetFolderId = node.type === "folder" ? node.id : undefined;
	const dropCategoryId =
		node.type === "bind" ? node.bind?.categoryId : categoryId;
	const dropFolderId =
		node.type === "bind" ? node.bind?.folderId : targetFolderId;
	const nodeColor = node.color ?? node.bind?.color;
	const nodeColorStyle = nodeColor ? { color: nodeColor } : undefined;
	const siblingIds =
		node.type === "category"
			? [...categories].sort((a, b) => a.order - b.order).map((item) => item.id)
			: folder
				? folders
						.filter(
							(item) =>
								item.categoryId === folder.categoryId &&
								item.parentId === folder.parentId,
						)
						.sort((a, b) => a.order - b.order)
						.map((item) => item.id)
				: [];
	const siblingIndex = siblingIds.indexOf(node.id);
	const canMoveUp = node.type !== "bind" && siblingIndex > 0;
	const canMoveDown =
		node.type !== "bind" &&
		siblingIndex >= 0 &&
		siblingIndex < siblingIds.length - 1;
	const selected =
		(node.type === "bind" && selectedBind === node.id) ||
		(!selectedBind &&
			node.type === "category" &&
			!selectedFolder &&
			selectedCategory === node.id) ||
		(!selectedBind && node.type === "folder" && selectedFolder === node.id);
	const bindSelected = selectedBindIds.includes(node.id);
	const folderFavorite = favoriteFolders.includes(node.id);

	useEffect(() => {
		if (!actionsOpen) return undefined;

		const closeOnOutsideClick = (event: Event) => {
			if (
				actionsRef.current?.contains(event.target as Node) ||
				menuContentRef.current?.contains(event.target as Node)
			)
				return;

			setActionsOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setActionsOpen(false);
				actionsRef.current?.querySelector("button")?.focus();
			}
		};

		window.addEventListener("pointerdown", closeOnOutsideClick);
		window.addEventListener("focusin", closeOnOutsideClick);
		window.addEventListener("keydown", closeOnEscape);

		return () => {
			window.removeEventListener("pointerdown", closeOnOutsideClick);
			window.removeEventListener("focusin", closeOnOutsideClick);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [actionsOpen]);

	const handleOpen = () => {
		if (node.type === "bind") {
			selectBind(node.id);
			void navigate({ to: "/" });
			onOpenItem?.();
			return;
		}

		if (node.type === "category") {
			selectCategory(node.id);
		}

		if (node.type === "folder") {
			selectFolder(node.id);
		}

		toggle(node.id);
		void navigate({ to: "/" });
	};

	const createFolder = () => {
		if (!categoryId) return;

		modalManager.open("createFolder", {
			categoryId,
			parentId: node.type === "folder" ? node.id : undefined,
		});
		setActionsOpen(false);
	};

	const createBind = () => {
		if (!categoryId) return;

		modalManager.open("createBind", {
			categoryId,
			folderId: node.type === "folder" ? node.id : undefined,
		});
		setActionsOpen(false);
	};

	const moveBindHere = () => {
		if (!categoryId) return;

		modalManager.open("moveBind", {
			categoryId,
			folderId: node.type === "folder" ? node.id : undefined,
		});
		setActionsOpen(false);
	};

	const renameNode = () => {
		modalManager.open("renameNode", {
			id: node.id,
			type: node.type,
			name: node.name,
		});
		setActionsOpen(false);
	};
	const bindAction = (action: () => void) => {
		try {
			action();
			setActionsOpen(false);
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Не удалось выполнить действие",
			);
		}
	};

	const deleteNode = () => {
		modalManager.open("deleteNode", {
			id: node.id,
			type: node.type,
			name: node.name,
		});
		setActionsOpen(false);
	};

	const toggleFolderFavorite = () => {
		if (node.type !== "folder") return;

		toggleFavoriteFolder(node.id);
		setActionsOpen(false);
	};

	const moveNode = (direction: "up" | "down") => {
		if (node.type === "category") {
			knowledgeService.moveCategory(node.id, direction);
			setActionsOpen(false);
			return;
		}

		if (node.type === "folder") {
			knowledgeService.moveFolder(node.id, direction);
		}

		setActionsOpen(false);
	};

	const expandDropTarget = () => {
		for (const id of [categoryId, targetFolderId]) {
			if (!id) continue;

			const state = useKnowledgeStore.getState();

			if (!state.expandedFolders.includes(id)) {
				state.toggleFolder(id);
			}
		}
	};

	const handleDragStart = (event: DragEvent<HTMLElement>) => {
		if (node.type !== "bind" && node.type !== "folder") {
			event.preventDefault();
			return;
		}

		const dragIds =
			node.type === "bind" && bindSelected ? selectedBindIds : [node.id];
		const dragPreview = createDragPreview(node.name, dragIds.length);

		if (node.type === "bind") {
			setBindDragData(event.dataTransfer, node.id, dragIds);
		} else {
			setFolderDragData(event.dataTransfer, node.id);
		}

		event.dataTransfer.setDragImage(dragPreview, 12, 12);
		window.setTimeout(() => dragPreview.remove(), 0);
		setDragging(true);
		setActionsOpen(false);
	};

	const handleDragEnd = () => {
		setDragging(false);
		setDragOver(false);
	};

	const handleDragEnter = (event: DragEvent<HTMLElement>) => {
		if (!dropCategoryId) return;
		if (
			node.type === "bind"
				? !hasBindDragData(event.dataTransfer) ||
					hasFolderDragData(event.dataTransfer)
				: !hasTreeDragData(event.dataTransfer)
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "move";
		setDragOver(true);
		expandDropTarget();
	};

	const handleDragOver = (event: DragEvent<HTMLElement>) => {
		if (!dropCategoryId) return;
		if (
			node.type === "bind"
				? !hasBindDragData(event.dataTransfer) ||
					hasFolderDragData(event.dataTransfer)
				: !hasTreeDragData(event.dataTransfer)
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "move";
		setDragOver(true);
	};

	const handleDragLeave = (event: DragEvent<HTMLElement>) => {
		if (
			event.relatedTarget instanceof Node &&
			event.currentTarget.contains(event.relatedTarget)
		) {
			return;
		}

		setDragOver(false);
	};

	const handleDrop = (event: DragEvent<HTMLElement>) => {
		if (!dropCategoryId) return;

		event.preventDefault();
		event.stopPropagation();
		setDragOver(false);

		const bindIds = getDraggedBindIds(event.dataTransfer);
		const folderId = getDraggedFolderId(event.dataTransfer);

		if (bindIds.length === 0 && !folderId) return;

		if (folderId) {
			if (node.type === "bind") return;
			const store = useKnowledgeStore.getState();
			const previousFolder = store.folders.find((item) => item.id === folderId);

			if (!previousFolder) return;
			if (
				previousFolder.categoryId === categoryId &&
				(previousFolder.parentId ?? "") === (targetFolderId ?? "")
			) {
				return;
			}

			try {
				knowledgeService.moveFolderTo(folderId, {
					categoryId: dropCategoryId,
					parentId: targetFolderId,
				});
				expandDropTarget();
				showToast("Папка перемещена", {
					action: {
						label: "Отменить",
						onClick: () => {
							knowledgeService.moveFolderTo(folderId, {
								categoryId: previousFolder.categoryId,
								parentId: previousFolder.parentId,
							});
							showToast("Перемещение отменено");
						},
					},
					duration: 6000,
				});
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Не удалось переместить папку",
				);
			}

			return;
		}

		if (node.type === "bind" && bindIds.length > 0) {
			try {
				const movedCount = bindIds.filter(
					(bindId) => bindId !== node.id,
				).length;

				for (const bindId of bindIds) {
					if (bindId !== node.id) {
						knowledgeService.moveBindBefore(bindId, node.id);
					}
				}

				if (movedCount > 0) {
					showToast(
						movedCount > 1
							? `Изменён порядок биндов: ${movedCount}`
							: "Порядок бинда изменён",
					);
					onClearBindSelection?.();
				}
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Не удалось изменить порядок",
				);
			}

			return;
		}

		const store = useKnowledgeStore.getState();
		const previousLocations = bindIds
			.map((bindId) => {
				const bind = store.binds.find((item) => item.id === bindId);

				return bind
					? {
							id: bind.id,
							categoryId: bind.categoryId,
							folderId: bind.folderId,
						}
					: undefined;
			})
			.filter((item): item is NonNullable<typeof item> => item !== undefined);
		const movedLocations: typeof previousLocations = [];

		try {
			for (const location of previousLocations) {
				if (
					location.categoryId === dropCategoryId &&
					(location.folderId ?? "") === (dropFolderId ?? "")
				) {
					continue;
				}

				const movedBind = knowledgeService.moveBind(location.id, {
					categoryId: dropCategoryId,
					folderId: dropFolderId,
				});

				movedLocations.push({
					...location,
					id: movedBind.id,
				});
			}

			expandDropTarget();

			if (movedLocations.length > 0) {
				showToast(
					movedLocations.length > 1
						? `Перемещено биндов: ${movedLocations.length}`
						: "Бинд перемещён",
					{
						action: {
							label: "Отменить",
							onClick: () => {
								for (const location of movedLocations) {
									knowledgeService.moveBind(location.id, {
										categoryId: location.categoryId,
										folderId: location.folderId,
									});
								}
								showToast("Перемещение отменено");
							},
						},
						duration: 6000,
					},
				);
				onClearBindSelection?.();
			}
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Не удалось переместить бинд",
			);
		}
	};

	const visibleChildren = expanded
		? node.children.slice(
				0,
				forceExpanded ? node.children.length : visibleChildrenLimit,
			)
		: [];
	const hiddenChildrenCount = Math.max(
		0,
		node.children.length - visibleChildren.length,
	);

	return (
		<div
			role="treeitem"
			aria-label={name}
			aria-level={level + 1}
			aria-selected={selected}
			aria-expanded={node.type !== "bind" ? expanded : undefined}
		>
			<div
				className={`workspace-tree-row${selected ? " is-selected" : ""}${bindSelected ? " is-checked" : ""}${dragging ? " is-dragging" : ""}${dragOver ? " is-drop-target" : ""}`}
				style={{ paddingLeft: 8 + level * 16 }}
				onDragEnter={handleDragEnter}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{node.type === "bind" ? (
					<div className="workspace-tree-gutter">
						<button
							type="button"
							aria-pressed={bindSelected}
							aria-label={`${bindSelected ? "Снять выделение" : "Выделить"}: ${name}`}
							title={bindSelected ? "Снять выделение бинда" : "Выделить бинд"}
							onClick={() => onToggleBindSelection?.(node.id)}
							className="workspace-tree-check"
						>
							{bindSelected && <Check size={10} strokeWidth={3} />}
						</button>
					</div>
				) : (
					<button
						type="button"
						data-tree-toggle
						className="workspace-tree-toggle"
						aria-label={`${expanded ? "Свернуть" : "Раскрыть"} ${name}`}
						onClick={() => toggle(node.id)}
					>
						{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
					</button>
				)}

				<button
					type="button"
					data-tree-open
					aria-label={name}
					title={name}
					onClick={handleOpen}
					draggable={node.type !== "category"}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					className="workspace-tree-label"
				>
					{node.type === "bind" ? (
						<FileText size={15} style={nodeColorStyle} />
					) : expanded ? (
						<FolderOpen size={15} style={nodeColorStyle} />
					) : (
						<Folder size={15} style={nodeColorStyle} />
					)}

					<span>{name}</span>
				</button>
				{node.type !== "bind" && (
					<small
						className="workspace-tree-count"
						aria-label={`Материалов: ${countTreeBinds(node.children)}`}
					>
						{countTreeBinds(node.children)}
					</small>
				)}

				{dragOver && (
					<div className="workspace-tree-drop-note">
						{node.type === "bind" ? "Перед биндом" : "В эту папку"}
					</div>
				)}

				<div ref={actionsRef} className="workspace-tree-actions">
					<button
						type="button"
						aria-label={`Действия: ${name}`}
						aria-haspopup="menu"
						aria-expanded={actionsOpen}
						title="Действия"
						onClick={() => setActionsOpen((open) => !open)}
						className={`workspace-tree-more${actionsOpen ? " is-open" : ""}`}
					>
						<MoreHorizontal size={15} />
					</button>

					{actionsOpen && (
						<ActionMenuPortal anchor={actionsRef}>
							<div ref={menuContentRef} className="workspace-tree-menu">
								{node.type === "folder" && manageStructure && (
									<ActionMenuItem
										icon={<FolderInput size={14} />}
										label="Переместить"
										onClick={() => {
											modalManager.open("moveBind", {
												moveFolderId: node.id,
												categoryId,
												folderId: folder?.parentId,
											});
											setActionsOpen(false);
										}}
									/>
								)}
								{node.type === "bind" && (
									<>
										<ActionMenuItem
											icon={<Edit3 size={14} />}
											label="Редактировать"
											onClick={() => {
												modalManager.open("editBind", { bindId: node.id });
												setActionsOpen(false);
											}}
										/>
										<ActionMenuItem
											icon={<FolderInput size={14} />}
											label="Переместить"
											onClick={() => {
												modalManager.open("moveBind", {
													bindId: node.id,
													categoryId: node.bind?.categoryId,
													folderId: node.bind?.folderId,
												});
												setActionsOpen(false);
											}}
										/>
									</>
								)}
								{node.type !== "bind" && (
									<>
										<ActionMenuItem
											icon={<ArrowUp size={14} />}
											label="Выше"
											disabled={!canMoveUp || !manageStructure}
											onClick={() => moveNode("up")}
										/>
										<ActionMenuItem
											icon={<ArrowDown size={14} />}
											label="Ниже"
											disabled={!canMoveDown || !manageStructure}
											onClick={() => moveNode("down")}
										/>
										{node.type === "folder" && (
											<ActionMenuItem
												icon={
													<Star
														size={14}
														fill={folderFavorite ? "currentColor" : "none"}
													/>
												}
												label={
													folderFavorite
														? "Убрать из избранного"
														: "В избранное"
												}
												onClick={toggleFolderFavorite}
											/>
										)}

										<div className="my-1 border-t border-border/80" />

										<ActionMenuItem
											icon={<Plus size={14} />}
											label="Новый бинд"
											onClick={createBind}
										/>
										<ActionMenuItem
											icon={<FolderInput size={14} />}
											label="Добавить существующий бинд"
											onClick={moveBindHere}
										/>
										<ActionMenuItem
											icon={<FolderPlus size={14} />}
											label="Новая папка"
											onClick={createFolder}
										/>

										<div className="my-1 border-t border-border/80" />
									</>
								)}
								{node.type === "bind" && (
									<>
										<ActionMenuItem
											icon={<FileText size={14} />}
											label="Копировать заголовок"
											onClick={() =>
												bindAction(() => {
													void copyToClipboard(node.name);
												})
											}
										/>
										<ActionMenuItem
											icon={<Plus size={14} />}
											label="Дублировать"
											onClick={() =>
												bindAction(() => {
													const copy = knowledgeService.duplicateBind(node.id);
													selectBind(copy.id);
												})
											}
										/>
										<ActionMenuItem
											icon={<Star size={14} />}
											label={
												node.bind?.favorite
													? "Убрать из избранного"
													: "В избранное"
											}
											onClick={() =>
												bindAction(() => {
													knowledgeService.toggleFavorite(node.id);
												})
											}
										/>
										<ActionMenuItem
											icon={<FileText size={14} />}
											label={node.bind?.pinned ? "Открепить" : "Закрепить"}
											onClick={() =>
												bindAction(() => {
													knowledgeService.updateBind(node.id, {
														pinned: !node.bind?.pinned,
													});
												})
											}
										/>
										<ActionMenuItem
											icon={<FileText size={14} />}
											label="История"
											onClick={() =>
												bindAction(() =>
													modalManager.open("bindHistory", { bindId: node.id }),
												)
											}
										/>
										<ActionMenuItem
											icon={<FileText size={14} />}
											label="Найти дубликаты"
											onClick={() =>
												bindAction(() =>
													modalManager.open("findDuplicates", {
														bindId: node.id,
													}),
												)
											}
										/>
									</>
								)}

								{node.type !== "bind" && manageStructure && (
									<ActionMenuItem
										icon={<Edit3 size={14} />}
										label="Переименовать"
										onClick={renameNode}
									/>
								)}
								{manageStructure && (
									<ActionMenuItem
										icon={<Trash2 size={14} />}
										label={node.type === "bind" ? "Архивировать" : "Удалить"}
										danger
										onClick={deleteNode}
									/>
								)}
							</div>
						</ActionMenuPortal>
					)}
				</div>
			</div>

			{expanded && node.type !== "bind" && (
				<div role="group">
					{visibleChildren.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							level={level + 1}
							forceExpanded={forceExpanded}
							selectedBindIds={selectedBindIds}
							onToggleBindSelection={onToggleBindSelection}
							onClearBindSelection={onClearBindSelection}
							onOpenItem={onOpenItem}
						/>
					))}

					{hiddenChildrenCount > 0 && (
						<button
							type="button"
							onClick={() =>
								setVisibleChildrenLimit((limit) => limit + CHILDREN_LIMIT_STEP)
							}
							className="w-full px-2 py-2 text-left text-xs text-muted hover:bg-accent/10 hover:text-foreground"
							style={{
								paddingLeft: 30 + (level + 1) * 16,
							}}
						>
							Показать ещё ({hiddenChildrenCount})
						</button>
					)}
					{node.children.length === 0 && (
						<p
							className="workspace-tree-empty"
							style={{ paddingLeft: 30 + level * 16 }}
						>
							Пока пусто
						</p>
					)}
				</div>
			)}
		</div>
	);
}
