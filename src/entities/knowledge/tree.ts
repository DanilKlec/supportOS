import type { Bind } from "../bind";
import type {
	KnowledgeCategory,
	KnowledgeFolder,
	KnowledgeTreeNode,
} from "./types";

export function buildKnowledgeTree(
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
	binds: Bind[],
): KnowledgeTreeNode[] {
	const foldersByParent = new Map<string, KnowledgeFolder[]>();
	const bindsByParent = new Map<string, Bind[]>();

	for (const folder of folders) {
		const key = getGroupKey(folder.categoryId, folder.parentId);
		const group = foldersByParent.get(key);

		if (group) {
			group.push(folder);
		} else {
			foldersByParent.set(key, [folder]);
		}
	}

	for (const bind of binds) {
		if (bind.archived) continue;

		const key = getGroupKey(bind.categoryId, bind.folderId);
		const group = bindsByParent.get(key);

		if (group) {
			group.push(bind);
		} else {
			bindsByParent.set(key, [bind]);
		}
	}

	for (const group of foldersByParent.values()) {
		group.sort((a, b) => a.order - b.order);
	}

	return [...categories]
		.sort((a, b) => a.order - b.order)
		.map((category) => ({
			id: category.id,

			name: category.name,

			type: "category",

			icon: category.icon,

			color: category.color,

			children: buildFolderTree(
				category.id,
				undefined,
				foldersByParent,
				bindsByParent,
			),
		}));
}

function getGroupKey(categoryId: string, parentId?: string) {
	return `${categoryId}:${parentId ?? "__root__"}`;
}

function getBindName(bind: Bind) {
	return (
		bind.translations.find((translation) => translation.language === "en")
			?.title ??
		bind.translations.find((translation) => translation.language === "ru")
			?.title ??
		bind.slug
	);
}

function bindToNode(bind: Bind): KnowledgeTreeNode {
	return {
		id: bind.id,

		name: getBindName(bind),

		type: "bind",

		icon: bind.icon,

		color: bind.color,

		bind,

		children: [],
	};
}

function buildFolderTree(
	categoryId: string,
	parentId: string | undefined,
	foldersByParent: Map<string, KnowledgeFolder[]>,
	bindsByParent: Map<string, Bind[]>,
): KnowledgeTreeNode[] {
	const result: KnowledgeTreeNode[] = [];
	const key = getGroupKey(categoryId, parentId);
	const childFolders = foldersByParent.get(key) ?? [];
	const childBinds = bindsByParent.get(key) ?? [];

	for (const folder of childFolders) {
		result.push({
			id: folder.id,

			name: folder.name,

			type: "folder",

			icon: folder.icon,

			color: folder.color,

			children: buildFolderTree(
				categoryId,
				folder.id,
				foldersByParent,
				bindsByParent,
			),
		});
	}

	result.push(...childBinds.map(bindToNode));

	return result;
}
