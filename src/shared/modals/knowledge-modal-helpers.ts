import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";

export function getBindTitle(bind: Bind, language: string) {
	return (
		bind.translations.find((translation) => translation.language === language)
			?.title ??
		bind.translations.find((translation) => translation.language === "ru")
			?.title ??
		bind.translations.find((translation) => translation.language === "en")
			?.title ??
		bind.translations[0]?.title ??
		bind.slug
	);
}

export function getBindTranslation(bind: Bind, language: string) {
	return (
		bind.translations.find(
			(translation) => translation.language === language,
		) ??
		bind.translations.find((translation) => translation.language === "ru") ??
		bind.translations.find((translation) => translation.language === "en") ??
		bind.translations[0]
	);
}

export function getBindLocation(
	bind: Bind,
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
) {
	const category = categories.find((item) => item.id === bind.categoryId);
	const folder = bind.folderId
		? folders.find((item) => item.id === bind.folderId)
		: undefined;

	if (folder) {
		return `${category?.name ?? "Категория"} / ${getFolderPath(folder, folders)}`;
	}

	return category?.name ?? "Без категории";
}

export function getFolderPath(
	folder: KnowledgeFolder,
	folders: KnowledgeFolder[],
) {
	const names = [folder.name];
	let parentId = folder.parentId;
	let guard = 0;

	while (parentId && guard < 20) {
		const parent = folders.find((item) => item.id === parentId);

		if (!parent) break;

		names.unshift(parent.name);
		parentId = parent.parentId;
		guard += 1;
	}

	return names.join(" / ");
}
