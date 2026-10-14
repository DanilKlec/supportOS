import type { Bind } from "@/entities/bind";
import {
	buildKnowledgeTree,
	type KnowledgeCategory,
	type KnowledgeFolder,
	type KnowledgeTreeNode,
} from "@/entities/knowledge";

// Ownership is the branch; category/folder IDs remain the material's location.
// Never move database records just to place them under the visual shared root.
export function buildSharedTree(
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
	binds: Bind[],
) {
	const sharedCategories = categories.filter((c) => c.ownerId === null);
	const sharedFolders = folders.filter(
		(f) =>
			f.ownerId === null && sharedCategories.some((c) => c.id === f.categoryId),
	);
	const visible = binds.filter((b) => !b.archived && b.ownerId === null);
	return buildKnowledgeTree(
		sharedCategories,
		sharedFolders,
		visible.map((b) => ({
			...b,
			// Stale/missing folder metadata must not make an otherwise available bind disappear.
			folderId: sharedFolders.some(
				(f) => f.id === b.folderId && f.categoryId === b.categoryId,
			)
				? b.folderId
				: undefined,
		})),
	);
}

export function personalTree(
	nodes: KnowledgeTreeNode[],
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
): KnowledgeTreeNode[] {
	return nodes.flatMap((node) => {
		if (node.type === "bind") return node.bind?.ownerId === null ? [] : [node];
		const children = personalTree(node.children, categories, folders);
		const structure =
			node.type === "category"
				? categories.find((c) => c.id === node.id)
				: folders.find((f) => f.id === node.id);
		return children.length || structure?.ownerId !== null
			? [{ ...node, children }]
			: [];
	});
}
