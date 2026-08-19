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
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/ё/g, "е")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
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

function isOneEditApart(first: string, second: string) {
	if (Math.abs(first.length - second.length) > 1) return false;

	let firstIndex = 0;
	let secondIndex = 0;
	let edits = 0;

	while (firstIndex < first.length && secondIndex < second.length) {
		if (first[firstIndex] === second[secondIndex]) {
			firstIndex += 1;
			secondIndex += 1;
			continue;
		}

		edits += 1;
		if (edits > 1) return false;
		if (first.length >= second.length) firstIndex += 1;
		if (second.length >= first.length) secondIndex += 1;
	}

	return true;
}

function getTokenScore(token: string, value: string) {
	if (!token || !value) return 0;
	const words = value.split(" ").filter(Boolean);

	if (words.includes(token)) return 120;
	if (words.some((word) => word.startsWith(token))) return 95;
	if (value.includes(token)) return 70;
	if (
		token.length >= 4 &&
		words.some((word) => word.length >= 4 && isOneEditApart(token, word))
	) {
		return 55;
	}

	return 0;
}

export function scoreTextSearch(query: string, parts: string[]) {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) return 0;

	const values = parts.map(normalizeSearchValue).filter(Boolean);
	const tokens = normalizedQuery.split(" ").filter(Boolean);
	let score = 0;

	for (const token of tokens) {
		const tokenScore = Math.max(
			...values.map((value) => getTokenScore(token, value)),
		);

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
	const preferredTranslation = bind.translations.find(
		(translation) => translation.language === context.language,
	);
	const fields = [
		{ value: title, weight: 10 },
		{ value: bind.slug, weight: 8 },
		...bind.tags.map((tag) => ({ value: tag, weight: 8 })),
		{ value: category?.name ?? "", weight: 5 },
		{ value: folder?.name ?? "", weight: 5 },
		{
			value: getFolderPath(bind.folderId, context.folders ?? []),
			weight: 4,
		},
		{ value: preferredTranslation?.content ?? "", weight: 3 },
		...bind.translations.flatMap((translation) => [
			{ value: translation.title, weight: 4 },
			{ value: translation.content, weight: 1 },
		]),
	];
	const tokens = normalizedQuery.split(" ").filter(Boolean);
	let score = 0;

	for (const token of tokens) {
		const bestFieldScore = Math.max(
			...fields.map(
				(field) =>
					getTokenScore(token, normalizeSearchValue(field.value)) *
					field.weight,
			),
		);
		if (bestFieldScore === 0) return 0;
		score += bestFieldScore;
	}

	const normalizedTitle = normalizeSearchValue(title);
	const normalizedSlug = normalizeSearchValue(bind.slug);
	if (normalizedTitle === normalizedQuery) score += 1200;
	else if (normalizedTitle.startsWith(normalizedQuery)) score += 700;
	else if (normalizedTitle.includes(normalizedQuery)) score += 350;
	if (normalizedSlug === normalizedQuery) score += 700;
	else if (normalizedSlug.startsWith(normalizedQuery)) score += 400;
	if (bind.tags.some((tag) => normalizeSearchValue(tag) === normalizedQuery)) {
		score += 500;
	}

	return score;
}

export function searchBinds(
	binds: Bind[],
	query: string,
	context: BindSearchContext = {},
) {
	const normalizedQuery = normalizeSearchValue(query);

	return binds
		.map((bind) => ({
			bind,
			score: scoreBindSearch(bind, query, context),
		}))
		.filter((item) => item.score > 0)
		.sort((first, second) => {
			if (normalizedQuery) return second.score - first.score;

			const firstUsage =
				(first.bind.pinned ? 1_000_000 : 0) +
				(first.bind.favorite ? 100_000 : 0) +
				(first.bind.copyCount ?? 0);
			const secondUsage =
				(second.bind.pinned ? 1_000_000 : 0) +
				(second.bind.favorite ? 100_000 : 0) +
				(second.bind.copyCount ?? 0);
			return secondUsage - firstUsage;
		})
		.map((item) => item.bind);
}
