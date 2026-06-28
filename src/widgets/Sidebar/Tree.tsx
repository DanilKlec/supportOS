import type { KnowledgeTreeNode } from "@/entities/knowledge";

import { TreeNode } from "./TreeNode";

interface Props {
	nodes: KnowledgeTreeNode[];
	forceExpanded?: boolean;
	selectedBindIds?: string[];
	onToggleBindSelection?: (id: string) => void;
	onClearBindSelection?: () => void;
}

export function Tree({
	nodes,
	forceExpanded = false,
	selectedBindIds = [],
	onToggleBindSelection,
	onClearBindSelection,
}: Props) {
	return (
		<div className="py-2">
			{nodes.map((node) => (
				<TreeNode
					key={node.id}
					node={node}
					level={0}
					forceExpanded={forceExpanded}
					selectedBindIds={selectedBindIds}
					onToggleBindSelection={onToggleBindSelection}
					onClearBindSelection={onClearBindSelection}
				/>
			))}
		</div>
	);
}
