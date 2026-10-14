import {
	ChevronDown,
	ChevronRight,
	FileText,
	Folder,
	FolderOpen,
	MoreHorizontal,
} from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import type { KnowledgeTreeNode } from "@/entities/knowledge";
import { bindCount, flattenLibrary, nodeKey } from "./library-tree";
export type LibraryNodeAction =
	| "folder"
	| "bind"
	| "edit"
	| "move"
	| "delete"
	| "up"
	| "down";
export function LibraryTree({
	nodes,
	selected,
	expanded,
	onExpand,
	onSelect,
	onAction,
	onDropNode,
	canEdit,
	searching,
}: {
	nodes: KnowledgeTreeNode[];
	selected: string;
	expanded: Set<string>;
	onExpand: (id: string) => void;
	onSelect: (node: KnowledgeTreeNode) => void;
	onAction: (action: LibraryNodeAction, node: KnowledgeTreeNode) => void;
	onDropNode: (key: string, target: KnowledgeTreeNode) => void;
	canEdit: boolean;
	searching: boolean;
}) {
	const root = useRef<HTMLUListElement>(null);
	const [drop, setDrop] = useState("");
	const hasSelected = flattenLibrary(nodes).some(
		(n) => nodeKey(n) === selected,
	);
	function keyboard(
		e: KeyboardEvent<HTMLLIElement>,
		node: KnowledgeTreeNode,
		open: boolean,
	) {
		if (e.target !== e.currentTarget) return;
		const rows = [
				...(root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ??
					[]),
			],
			index = rows.indexOf(e.currentTarget);
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			rows[index + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
		} else if (e.key === "Home" || e.key === "End") {
			e.preventDefault();
			rows[e.key === "Home" ? 0 : rows.length - 1]?.focus();
		} else if (e.key === "ArrowRight" && node.type !== "bind") {
			e.preventDefault();
			if (!open) onExpand(node.id);
			else rows[index + 1]?.focus();
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			if (open) onExpand(node.id);
			else
				e.currentTarget.parentElement
					?.closest<HTMLElement>('[role="treeitem"]')
					?.focus();
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onSelect(node);
		}
	}
	function items(list: KnowledgeTreeNode[], level = 1) {
		return list.map((node, index) => {
			const key = nodeKey(node),
				open = node.type !== "bind" && (searching || expanded.has(node.id)),
				active = selected === key,
				Icon = node.type === "bind" ? FileText : open ? FolderOpen : Folder;
			return (
				<li
					key={key}
					role="treeitem"
					aria-label={node.name}
					aria-selected={active}
					aria-expanded={node.type !== "bind" ? open : undefined}
					aria-level={level}
					tabIndex={
						active || (!hasSelected && level === 1 && index === 0) ? 0 : -1
					}
					onKeyDown={(e) => keyboard(e, node, open)}
				>
					<div
						className={`library-tree-row${active ? " is-selected" : ""}${drop === key ? " is-drop-target" : ""}`}
						style={{ paddingLeft: 8 + (level - 1) * 16 }}
						draggable={canEdit && node.type !== "category"}
						onDragStart={(e) => {
							e.dataTransfer.setData("application/supportos-library-node", key);
							e.dataTransfer.effectAllowed = "move";
						}}
						onDragOver={(e) => {
							if (
								canEdit &&
								node.type !== "bind" &&
								e.dataTransfer.types.includes(
									"application/supportos-library-node",
								)
							) {
								e.preventDefault();
								e.dataTransfer.dropEffect = "move";
								setDrop(key);
							}
						}}
						onDragLeave={() => setDrop("")}
						onDrop={(e) => {
							e.preventDefault();
							setDrop("");
							const source = e.dataTransfer.getData(
								"application/supportos-library-node",
							);
							if (source && source !== key) onDropNode(source, node);
						}}
					>
						{node.type !== "bind" ? (
							<button
								type="button"
								tabIndex={-1}
								className="library-tree-toggle"
								aria-label={`${open ? "Свернуть" : "Раскрыть"} ${node.name}`}
								onClick={() => onExpand(node.id)}
							>
								{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
							</button>
						) : (
							<span className="library-tree-spacer" />
						)}
						<button
							type="button"
							tabIndex={-1}
							className="library-tree-label"
							aria-label={node.name}
							onClick={() => onSelect(node)}
							title={node.name}
						>
							<Icon
								size={15}
								style={node.color ? { color: node.color } : undefined}
							/>
							<span>{node.name}</span>
							{node.type !== "bind" && <small>{bindCount(node)}</small>}
						</button>
						{canEdit && node.id !== "__unplaced" && (
							<details className="library-node-menu">
								<summary aria-label={`Действия: ${node.name}`}>
									<MoreHorizontal size={15} />
								</summary>
								<div className="library-node-menu-popup">
									{(node.type !== "bind"
										? [
												["folder", "Новая вложенная папка"],
												["bind", "Новый бинд здесь"],
												["edit", "Переименовать и настроить"],
												...(node.type === "folder"
													? [["move", "Переместить папку"]]
													: []),
												["up", "Выше"],
												["down", "Ниже"],
												["delete", "Удалить пустую папку"],
											]
										: [
												["edit", "Редактировать бинд"],
												["move", "Переместить бинд"],
											]
									).map(([action, label]) => (
										<button
											key={action}
											type="button"
											disabled={action === "delete" && node.children.length > 0}
											onClick={(e) => {
												e.currentTarget
													.closest("details")
													?.removeAttribute("open");
												onAction(action as LibraryNodeAction, node);
											}}
										>
											{action === "delete" && node.type === "category"
												? "Удалить пустой раздел"
												: label}
										</button>
									))}
								</div>
							</details>
						)}
					</div>
					{open && (
						<ul role="group">
							{items(node.children, level + 1)}
							{node.children.length === 0 && (
								<li
									role="none"
									className="library-tree-empty"
									style={{ paddingLeft: 32 + level * 16 }}
								>
									Пока пусто
								</li>
							)}
						</ul>
					)}
				</li>
			);
		});
	}
	return (
		<ul
			className="library-tree"
			role="tree"
			aria-label="Дерево общей базы"
			ref={root}
		>
			{items(nodes)}
		</ul>
	);
}
