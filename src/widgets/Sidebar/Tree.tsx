import type { KnowledgeTreeNode } from "@/entities/knowledge";

import { TreeNode } from "./TreeNode";
import "./workspace-tree.css";

interface Props {
	nodes: KnowledgeTreeNode[];
	forceExpanded?: boolean;
	selectedBindIds?: string[];
	onToggleBindSelection?: (id: string) => void;
	onClearBindSelection?: () => void;
	onOpenItem?: () => void;
	label?: string;
}

export function Tree({
	nodes,
	forceExpanded = false,
	selectedBindIds = [],
	onToggleBindSelection,
	onClearBindSelection,
	onOpenItem,
	label = "Дерево материалов",
}: Props) {
	return (
		<div
			className="workspace-tree"
			role="tree"
			aria-label={label}
			onKeyDown={(event) => {
				if (
					!(event.target instanceof HTMLElement) ||
					!event.target.matches("[data-tree-open]")
				)
					return;
				const row = event.target.closest<HTMLElement>('[role="treeitem"]');
				if (!row) return;
				const buttons = [
					...event.currentTarget.querySelectorAll<HTMLButtonElement>(
						"[data-tree-open]",
					),
				];
				const index = buttons.indexOf(event.target as HTMLButtonElement);
				const toggle =
					row.querySelector<HTMLButtonElement>("[data-tree-toggle]");
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					buttons[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
				} else if (event.key === "Home" || event.key === "End") {
					event.preventDefault();
					buttons[event.key === "Home" ? 0 : buttons.length - 1]?.focus();
				} else if (event.key === "ArrowRight" && toggle) {
					event.preventDefault();
					if (row.getAttribute("aria-expanded") !== "true") toggle.click();
					else
						row
							.querySelector<HTMLButtonElement>(
								'[role="group"] [data-tree-open]',
							)
							?.focus();
				} else if (event.key === "ArrowLeft") {
					event.preventDefault();
					if (toggle && row.getAttribute("aria-expanded") === "true")
						toggle.click();
					else
						row.parentElement
							?.closest('[role="treeitem"]')
							?.querySelector<HTMLButtonElement>("[data-tree-open]")
							?.focus();
				}
			}}
		>
			{nodes.map((node) => (
				<TreeNode
					key={node.id}
					node={node}
					level={0}
					forceExpanded={forceExpanded}
					selectedBindIds={selectedBindIds}
					onToggleBindSelection={onToggleBindSelection}
					onClearBindSelection={onClearBindSelection}
					onOpenItem={onOpenItem}
				/>
			))}
		</div>
	);
}
