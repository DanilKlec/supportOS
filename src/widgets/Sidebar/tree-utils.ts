import type { KnowledgeTreeNode } from "@/entities/knowledge";

export function countTreeBinds(nodes: KnowledgeTreeNode[]): number {
	return nodes.reduce(
		(count, node) =>
			count + (node.type === "bind" ? 1 : countTreeBinds(node.children)),
		0,
	);
}
