import type { Bind } from "@/entities/bind";
import type { KnowledgeFolder } from "@/entities/knowledge";
import { useKnowledgeStore } from "@/store";

export type MoveDirection = "up" | "down";

export function getNextBindOrder(
	binds: Bind[],
	categoryId: string,
	folderId?: string,
) {
	return (
		Math.max(
			0,
			...binds
				.filter(
					(bind) =>
						bind.categoryId === categoryId &&
						(bind.folderId ?? "") === (folderId ?? ""),
				)
				.map((bind) => bind.order ?? 0),
		) + 1
	);
}

export function getReorderedItemOrders<T extends { id: string; order: number }>(
	items: T[],
	id: string,
	direction: MoveDirection,
) {
	const orderedItems = [...items].sort((a, b) => a.order - b.order);
	const currentIndex = orderedItems.findIndex((item) => item.id === id);
	const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

	if (
		currentIndex < 0 ||
		targetIndex < 0 ||
		targetIndex >= orderedItems.length
	) {
		return undefined;
	}

	const [item] = orderedItems.splice(currentIndex, 1);

	orderedItems.splice(targetIndex, 0, item);

	return new Map(orderedItems.map((item, index) => [item.id, index + 1]));
}

export function search(query: string) {
	const value = query.trim().toLowerCase();
	const { binds } = useKnowledgeStore.getState();

	if (!value) {
		return binds.filter((bind) => !bind.archived);
	}

	return binds.filter((bind) => {
		if (bind.archived) return false;

		const translations = bind.translations
			.map((translation) => `${translation.title} ${translation.content}`)
			.join(" ");
		const haystack = [bind.slug, bind.tags.join(" "), translations]
			.join(" ")
			.toLowerCase();

		return haystack.includes(value);
	});
}

export function revealLocation(categoryId: string, folderId?: string) {
	const state = useKnowledgeStore.getState(),
		expanded = new Set(state.expandedFolders),
		seen = new Set<string>();
	expanded.add(categoryId);
	let folder = state.folders.find((f) => f.id === folderId);
	while (folder && !seen.has(folder.id)) {
		seen.add(folder.id);
		expanded.add(folder.id);
		const parent = folder.parentId;
		folder = state.folders.find((f) => f.id === parent);
	}
	useKnowledgeStore.setState({ expandedFolders: [...expanded] });
}

export function collectFolderIds(
	id: string,
	folders: KnowledgeFolder[],
	result = new Set<string>(),
) {
	result.add(id);

	for (const folder of folders) {
		if (folder.parentId === id) {
			collectFolderIds(folder.id, folders, result);
		}
	}

	return result;
}
