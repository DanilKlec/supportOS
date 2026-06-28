import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";

export interface BindSearchContext {
	categories?: KnowledgeCategory[];
	folders?: KnowledgeFolder[];
	language?: string;
}

export function getBindTitle(bind: Bind, language?: string) {
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

export function normalizeSearchValue(value: string) {
	return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getFolderPath(
	folderId: string | undefined,
	folders: KnowledgeFolder[],
) {
	if (!folderId) return "";

	const path: string[] = [];
	let current = folders.find((folder) => folder.id === folderId);
	let guard = 0;

	while (current && guard < 20) {
		path.unshift(current.name);
		current = current.parentId
			? folders.find((folder) => folder.id === current?.parentId)
			: undefined;
		guard += 1;
	}

	return path.join(" ");
}

function getFuzzyScore(needle: string, haystack: string) {
	if (!needle) return 0;
	if (haystack.includes(needle)) return 100;

	let index = 0;
	let gaps = 0;

	for (const char of haystack) {
		if (char === needle[index]) {
			index += 1;
			if (index === needle.length) {
				return Math.max(15, 70 - gaps);
			}
		} else if (index > 0) {
			gaps += 1;
		}
	}

	return 0;
}

export function scoreTextSearch(query: string, parts: string[]) {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) return 0;

	const haystack = normalizeSearchValue(parts.filter(Boolean).join(" "));
	const tokens = normalizedQuery.split(" ").filter(Boolean);
	let score = 0;

	for (const token of tokens) {
		const tokenScore = getFuzzyScore(token, haystack);

		if (tokenScore === 0) return 0;

		score += tokenScore;
	}

	return score;
}

export function scoreBindSearch(
	bind: Bind,
	query: string,
	context: BindSearchContext = {},
) {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) return 1;

	const category = context.categories?.find(
		(item) => item.id === bind.categoryId,
	);
	const folder = context.folders?.find((item) => item.id === bind.folderId);
	const title = getBindTitle(bind, context.language);
	const translations = bind.translations.flatMap((translation) => [
		translation.language,
		translation.title,
		translation.content,
	]);
	const parts = [
		title,
		bind.slug,
		bind.tags.join(" "),
		category?.name ?? "",
		folder?.name ?? "",
		getFolderPath(bind.folderId, context.folders ?? []),
		...translations,
	];
	const baseScore = scoreTextSearch(normalizedQuery, parts);

	if (baseScore === 0) return 0;

	let bonus = 0;
	const normalizedTitle = normalizeSearchValue(title);
	const normalizedSlug = normalizeSearchValue(bind.slug);

	if (normalizedTitle.startsWith(normalizedQuery)) bonus += 70;
	if (normalizedSlug.startsWith(normalizedQuery)) bonus += 50;
	if (bind.tags.some((tag) => normalizeSearchValue(tag) === normalizedQuery)) {
		bonus += 40;
	}

	return baseScore + bonus;
}

export function searchBinds(
	binds: Bind[],
	query: string,
	context: BindSearchContext = {},
) {
	return binds
		.map((bind) => ({
			bind,
			score: scoreBindSearch(bind, query, context),
		}))
		.filter((item) => item.score > 0)
		.sort((first, second) => second.score - first.score)
		.map((item) => item.bind);
}
