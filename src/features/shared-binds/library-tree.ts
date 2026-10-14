import type { Bind } from "@/entities/bind";
import type { KnowledgeTreeNode } from "@/entities/knowledge";
import type { LibraryStructure } from "@/services/shared-library.service";
import { buildSharedTree } from "./shared-tree";
export const nodeKey = (node: Pick<KnowledgeTreeNode, "type" | "id">) =>
	`${node.type}:${node.id}`;
export function folderPath(
	id: string | undefined,
	structure: LibraryStructure,
): string[] {
	const result: string[] = [],
		seen = new Set<string>();
	let folder = structure.folders.find((f) => f.id === id);
	while (folder && !seen.has(folder.id)) {
		seen.add(folder.id);
		result.unshift(folder.name);
		folder = structure.folders.find((f) => f.id === folder?.parentId);
	}
	return result;
}
export function descendants(id: string, structure: LibraryStructure) {
	const found = new Set([id]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const f of structure.folders)
			if (f.parentId && found.has(f.parentId) && !found.has(f.id)) {
				found.add(f.id);
				changed = true;
			}
	}
	return found;
}
export function buildLibraryTree(
	structure: LibraryStructure,
	binds: Bind[],
	language: string,
) {
	const categories = structure.categories.filter((c) => c.ownerId === null);
	const folders = structure.folders
		.filter((f) => f.ownerId === null)
		.map((f) => {
			let parent = structure.folders.find(
					(p) => p.id === f.parentId && p.categoryId === f.categoryId,
				),
				seen = new Set([f.id]);
			while (parent && !seen.has(parent.id)) {
				seen.add(parent.id);
				parent = structure.folders.find((p) => p.id === parent?.parentId);
			}
			return {
				...f,
				parentId:
					parent ||
					!structure.folders.some(
						(p) => p.id === f.parentId && p.categoryId === f.categoryId,
					)
						? undefined
						: f.parentId,
			};
		});
	const orphaned = binds.some(
		(b) => b.ownerId === null && !categories.some((c) => c.id === b.categoryId),
	);
	if (orphaned)
		categories.push({
			id: "__unplaced",
			name: "Материалы без раздела",
			order: 999999,
			ownerId: null,
			updatedAt: "",
		});
	const tree = buildSharedTree(
		categories,
		folders,
		binds.map((b) =>
			categories.some((c) => c.id === b.categoryId)
				? b
				: { ...b, categoryId: "__unplaced", folderId: undefined },
		),
	);
	const name = (nodes: KnowledgeTreeNode[]): KnowledgeTreeNode[] =>
		nodes.map((n) => ({
			...n,
			name: n.bind
				? n.bind.translations.find((t) => t.language === language)?.title ||
					n.bind.translations[0]?.title ||
					n.bind.slug
				: n.name,
			children: name(n.children),
		}));
	return name(tree);
}
export function searchLibraryTree(
	nodes: KnowledgeTreeNode[],
	query: string,
): KnowledgeTreeNode[] {
	const text = query.trim().toLocaleLowerCase();
	if (!text) return nodes;
	return nodes.flatMap((n) => {
		const haystack = [
			n.name,
			...(n.bind?.tags ?? []),
			...(n.bind?.translations.flatMap((t) => [t.title, t.content]) ?? []),
		]
			.join(" ")
			.toLocaleLowerCase();
		if (haystack.includes(text)) return [n];
		const children = searchLibraryTree(n.children, text);
		return children.length ? [{ ...n, children }] : [];
	});
}
export function flattenLibrary(
	nodes: KnowledgeTreeNode[],
): KnowledgeTreeNode[] {
	return nodes.flatMap((n) => [n, ...flattenLibrary(n.children)]);
}
export function bindCount(node: KnowledgeTreeNode): number {
	return node.type === "bind"
		? 1
		: node.children.reduce((sum, n) => sum + bindCount(n), 0);
}
export function nodeLocation(
	node: KnowledgeTreeNode | undefined,
	structure: LibraryStructure,
) {
	const folder =
		node?.type === "folder"
			? structure.folders.find((f) => f.id === node.id)
			: undefined;
	return {
		categoryId:
			node?.type === "category"
				? node.id
				: (folder?.categoryId ??
					node?.bind?.categoryId ??
					structure.categories[0]?.id ??
					""),
		folderId: folder?.id ?? node?.bind?.folderId,
	};
}
