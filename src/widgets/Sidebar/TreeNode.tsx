import { useNavigate } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronRight,
	Edit3,
	FileText,
	Folder,
	FolderInput,
	FolderPlus,
	MoreHorizontal,
	Plus,
	Trash2,
} from "lucide-react";
import {
	type DragEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";

import type { KnowledgeTreeNode } from "@/entities/knowledge";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import {
	getDraggedBindIds,
	hasBindDragData,
	setBindDragData,
} from "@/shared/lib/bind-drag";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

interface Props {
	node: KnowledgeTreeNode;

	level: number;
	forceExpanded?: boolean;
	selectedBindIds?: string[];
	onToggleBindSelection?: (id: string) => void;
	onClearBindSelection?: () => void;
}

const INITIAL_CHILDREN_LIMIT = 120;
const CHILDREN_LIMIT_STEP = 240;

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
}: Props) {
	const navigate = useNavigate();
	const actionsRef = useRef<HTMLDivElement>(null);
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
	const categories = useKnowledgeStore((s) => s.categories);
	const folders = useKnowledgeStore((s) => s.folders);
	const toggle = useKnowledgeStore((s) => s.toggleFolder);
	const selectBind = useKnowledgeStore((s) => s.selectBind);
	const selectCategory = useKnowledgeStore((s) => s.selectCategory);
	const selectFolder = useKnowledgeStore((s) => s.selectFolder);

	const folder = folders.find((item) => item.id === node.id);
	const categoryId = node.type === "category" ? node.id : folder?.categoryId;
	const targetFolderId = node.type === "folder" ? node.id : undefined;
	const canDropBind = node.type !== "bind" && Boolean(categoryId);
	const hasChildren = node.children.length > 0;
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
		(node.type === "category" && selectedCategory === node.id) ||
		(node.type === "folder" && selectedFolder === node.id);
	const bindSelected = selectedBindIds.includes(node.id);

	useEffect(() => {
		if (!actionsOpen) return undefined;

		const closeOnOutsideClick = (event: PointerEvent) => {
			if (actionsRef.current?.contains(event.target as Node)) return;

			setActionsOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setActionsOpen(false);
			}
		};

		window.addEventListener("pointerdown", closeOnOutsideClick);
		window.addEventListener("keydown", closeOnEscape);

		return () => {
			window.removeEventListener("pointerdown", closeOnOutsideClick);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [actionsOpen]);

	const handleOpen = () => {
		if (node.type === "bind") {
			selectBind(node.id);
			void navigate({ to: "/" });
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

	const deleteNode = () => {
		modalManager.open("deleteNode", {
			id: node.id,
			type: node.type,
			name: node.name,
		});
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
		if (node.type !== "bind") {
			event.preventDefault();
			return;
		}

		setBindDragData(
			event.dataTransfer,
			node.id,
			bindSelected ? selectedBindIds : [node.id],
		);
		setDragging(true);
		setActionsOpen(false);
	};

	const handleDragEnd = () => {
		setDragging(false);
		setDragOver(false);
	};

	const handleDragEnter = (event: DragEvent<HTMLElement>) => {
		if (!canDropBind || !hasBindDragData(event.dataTransfer)) return;

		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = "move";
		setDragOver(true);
		expandDropTarget();
	};

	const handleDragOver = (event: DragEvent<HTMLElement>) => {
		if (!canDropBind || !hasBindDragData(event.dataTransfer)) return;

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
		if (!canDropBind || !categoryId) return;

		event.preventDefault();
		event.stopPropagation();
		setDragOver(false);

		const bindIds = getDraggedBindIds(event.dataTransfer);

		if (bindIds.length === 0) return;

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
			.filter(
				(item): item is { id: string; categoryId: string; folderId?: string } =>
					Boolean(item),
			);
		const movedLocations: typeof previousLocations = [];

		try {
			for (const location of previousLocations) {
				if (
					location.categoryId === categoryId &&
					(location.folderId ?? "") === (targetFolderId ?? "")
				) {
					continue;
				}

				const movedBind = knowledgeService.moveBind(location.id, {
					categoryId,
					folderId: targetFolderId,
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
						? `${movedLocations.length} binds moved`
						: "Bind moved",
					{
						action: {
							label: "Undo",
							onClick: () => {
								for (const location of movedLocations) {
									knowledgeService.moveBind(location.id, {
										categoryId: location.categoryId,
										folderId: location.folderId,
									});
								}
								showToast("Move undone");
							},
						},
						duration: 6000,
					},
				);
				onClearBindSelection?.();
			}
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Bind move failed");
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
		<div>
			<div
				className={`
          group
          flex
          items-center
          gap-1
          border-l-2
          pr-2
          transition
          ${
						dragOver
							? "bg-accent/20 text-foreground ring-1 ring-inset ring-accent/50"
							: selected
								? "bg-accent/15 text-accent"
								: "hover:bg-accent/10"
					}
          ${dragging ? "opacity-50" : ""}
          ${node.type === "bind" ? "cursor-grab active:cursor-grabbing" : ""}
        `}
				style={{
					borderLeftColor: nodeColor ?? "transparent",
				}}
			>
				{node.type === "bind" && (
					<label
						className="flex shrink-0 items-center pr-1"
						style={{
							paddingLeft: 12 + level * 18,
						}}
					>
						<input
							type="checkbox"
							checked={bindSelected}
							onChange={() => onToggleBindSelection?.(node.id)}
							aria-label={`Select ${node.name}`}
							className="h-3.5 w-3.5 accent-current"
						/>
					</label>
				)}

				<button
					type="button"
					onClick={handleOpen}
					draggable={node.type === "bind"}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onDragEnter={handleDragEnter}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					className="
            flex
            min-w-0
            flex-1
            items-center
            gap-2
            py-2
            text-left
          "
					style={{
						paddingLeft: node.type === "bind" ? 0 : 12 + level * 18,
					}}
				>
					{hasChildren ? (
						expanded ? (
							<ChevronDown size={15} />
						) : (
							<ChevronRight size={15} />
						)
					) : (
						<div className="w-[15px]" />
					)}

					<span
						className="h-2 w-2 shrink-0 rounded-full"
						style={{
							backgroundColor: nodeColor ?? "transparent",
						}}
					/>

					{node.type === "bind" ? (
						<FileText size={16} className="shrink-0" style={nodeColorStyle} />
					) : (
						<Folder size={16} className="shrink-0" style={nodeColorStyle} />
					)}

					<span className="truncate text-sm">{node.name}</span>
				</button>

				<div ref={actionsRef} className="relative shrink-0">
					<button
						type="button"
						aria-label="Node actions"
						aria-expanded={actionsOpen}
						title="Actions"
						onClick={() => setActionsOpen((open) => !open)}
						className={`rounded p-1 text-muted transition hover:bg-surface hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100 ${
							actionsOpen || selected ? "opacity-100" : "opacity-60"
						}`}
					>
						<MoreHorizontal size={15} />
					</button>

					{actionsOpen && (
						<div className="absolute right-0 top-7 z-40 w-48 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-2xl">
							{node.type !== "bind" && (
								<>
									<ActionMenuItem
										icon={<ArrowUp size={14} />}
										label="Move up"
										disabled={!canMoveUp}
										onClick={() => moveNode("up")}
									/>
									<ActionMenuItem
										icon={<ArrowDown size={14} />}
										label="Move down"
										disabled={!canMoveDown}
										onClick={() => moveNode("down")}
									/>

									<div className="my-1 border-t border-border" />

									<ActionMenuItem
										icon={<Plus size={14} />}
										label="New bind"
										onClick={createBind}
									/>
									<ActionMenuItem
										icon={<FolderInput size={14} />}
										label="Add existing bind"
										onClick={moveBindHere}
									/>
									<ActionMenuItem
										icon={<FolderPlus size={14} />}
										label="New folder"
										onClick={createFolder}
									/>

									<div className="my-1 border-t border-border" />
								</>
							)}

							<ActionMenuItem
								icon={<Edit3 size={14} />}
								label="Rename"
								onClick={renameNode}
							/>
							<ActionMenuItem
								icon={<Trash2 size={14} />}
								label="Delete"
								danger
								onClick={deleteNode}
							/>
						</div>
					)}
				</div>
			</div>

			{expanded && (
				<>
					{visibleChildren.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							level={level + 1}
							forceExpanded={forceExpanded}
							selectedBindIds={selectedBindIds}
							onToggleBindSelection={onToggleBindSelection}
							onClearBindSelection={onClearBindSelection}
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
								paddingLeft: 12 + (level + 1) * 18,
							}}
						>
							Show more ({hiddenChildrenCount})
						</button>
					)}
				</>
			)}
		</div>
	);
}
