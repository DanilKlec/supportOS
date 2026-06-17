import { useNavigate } from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronRight,
	Edit3,
	FileText,
	Folder,
	FolderPlus,
	Plus,
	Trash2,
} from "lucide-react";
import { useState } from "react";

import type { KnowledgeTreeNode } from "@/entities/knowledge";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

interface Props {
	node: KnowledgeTreeNode;

	level: number;
}

const INITIAL_CHILDREN_LIMIT = 120;
const CHILDREN_LIMIT_STEP = 240;

export function TreeNode({ node, level }: Props) {
	const navigate = useNavigate();
	const [visibleChildrenLimit, setVisibleChildrenLimit] = useState(
		INITIAL_CHILDREN_LIMIT,
	);
	const expanded = useKnowledgeStore((s) =>
		s.expandedFolders.includes(node.id),
	);
	const selectedBind = useKnowledgeStore((s) => s.selectedBind);
	const selectedCategory = useKnowledgeStore((s) => s.selectedCategory);
	const selectedFolder = useKnowledgeStore((s) => s.selectedFolder);
	const folders = useKnowledgeStore((s) => s.folders);
	const toggle = useKnowledgeStore((s) => s.toggleFolder);
	const selectBind = useKnowledgeStore((s) => s.selectBind);
	const selectCategory = useKnowledgeStore((s) => s.selectCategory);
	const selectFolder = useKnowledgeStore((s) => s.selectFolder);

	const folder = folders.find((item) => item.id === node.id);
	const categoryId = node.type === "category" ? node.id : folder?.categoryId;
	const hasChildren = node.children.length > 0;
	const nodeColor = node.color ?? node.bind?.color;
	const nodeColorStyle = nodeColor ? { color: nodeColor } : undefined;
	const selected =
		(node.type === "bind" && selectedBind === node.id) ||
		(node.type === "category" && selectedCategory === node.id) ||
		(node.type === "folder" && selectedFolder === node.id);

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
	};

	const createBind = () => {
		if (!categoryId) return;

		modalManager.open("createBind", {
			categoryId,
			folderId: node.type === "folder" ? node.id : undefined,
		});
	};

	const renameNode = () => {
		modalManager.open("renameNode", {
			id: node.id,
			type: node.type,
			name: node.name,
		});
	};

	const deleteNode = () => {
		modalManager.open("deleteNode", {
			id: node.id,
			type: node.type,
			name: node.name,
		});
	};

	const visibleChildren = expanded
		? node.children.slice(0, visibleChildrenLimit)
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
          ${selected ? "bg-accent/15 text-accent" : "hover:bg-accent/10"}
        `}
				style={{
					borderLeftColor: nodeColor ?? "transparent",
				}}
			>
				<button
					type="button"
					onClick={handleOpen}
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
						paddingLeft: 12 + level * 18,
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

				<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
					{node.type !== "bind" && (
						<>
							<button
								type="button"
								title="New bind"
								onClick={createBind}
								className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
							>
								<Plus size={14} />
							</button>

							<button
								type="button"
								title="New folder"
								onClick={createFolder}
								className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
							>
								<FolderPlus size={14} />
							</button>
						</>
					)}

					<button
						type="button"
						title="Rename"
						onClick={renameNode}
						className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
					>
						<Edit3 size={14} />
					</button>

					<button
						type="button"
						title="Delete"
						onClick={deleteNode}
						className="rounded p-1 text-muted hover:bg-surface hover:text-red-400"
					>
						<Trash2 size={14} />
					</button>
				</div>
			</div>

			{expanded && (
				<>
					{visibleChildren.map((child) => (
						<TreeNode key={child.id} node={child} level={level + 1} />
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
