import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { languages } from "@/entities/language";
import { getBindTitle, normalizeSearchValue } from "@/shared/lib/bind-search";

export type KnowledgeHealthSeverity = "critical" | "warning" | "info";

export interface KnowledgeHealthIssue {
	id: string;
	title: string;
	description: string;
	severity: KnowledgeHealthSeverity;
	bindId?: string;
	folderId?: string;
	categoryId?: string;
}

export interface KnowledgeHealthReport {
	issues: KnowledgeHealthIssue[];
	stats: {
		activeBinds: number;
		archivedBinds: number;
		duplicates: number;
		missingTranslations: number;
		emptyContent: number;
		unusedFolders: number;
		orphanedBinds: number;
	};
}

function getContentKey(bind: Bind) {
	return normalizeSearchValue(
		bind.translations
			.map((translation) => translation.content)
			.filter(Boolean)
			.join(" "),
	);
}

export function getKnowledgeHealthReport({
	binds,
	categories,
	folders,
}: {
	binds: Bind[];
	categories: KnowledgeCategory[];
	folders: KnowledgeFolder[];
}): KnowledgeHealthReport {
	const categoryIds = new Set(categories.map((category) => category.id));
	const folderIds = new Set(folders.map((folder) => folder.id));
	const activeBinds = binds.filter((bind) => !bind.archived);
	const archivedBinds = binds.filter((bind) => bind.archived);
	const contentGroups = new Map<string, Bind[]>();
	const issues: KnowledgeHealthIssue[] = [];

	for (const bind of activeBinds) {
		const key = getContentKey(bind);

		if (key.length > 16) {
			contentGroups.set(key, [...(contentGroups.get(key) ?? []), bind]);
		}
	}

	for (const group of contentGroups.values()) {
		if (group.length < 2) continue;

		for (const bind of group) {
			issues.push({
				id: `duplicate-${bind.id}`,
				title: "Possible duplicate",
				description: `${getBindTitle(bind)} has content repeated in ${group.length - 1} other bind(s).`,
				severity: "warning",
				bindId: bind.id,
			});
		}
	}

	for (const bind of activeBinds) {
		const filledTranslations = bind.translations.filter((translation) =>
			translation.content.trim(),
		);
		const languageCodes = new Set(
			filledTranslations.map((translation) => translation.language),
		);
		const missingLanguages = languages
			.map((language) => language.code)
			.filter((code) => !languageCodes.has(code));

		if (filledTranslations.length === 0) {
			issues.push({
				id: `empty-${bind.id}`,
				title: "Empty bind",
				description: `${getBindTitle(bind)} has no filled content.`,
				severity: "critical",
				bindId: bind.id,
			});
		}

		if (missingLanguages.length > 0) {
			issues.push({
				id: `missing-lang-${bind.id}`,
				title: "Missing translations",
				description: `${getBindTitle(bind)} is missing ${missingLanguages.map((code) => code.toUpperCase()).join(", ")}.`,
				severity: "warning",
				bindId: bind.id,
			});
		}

		if (bind.tags.length === 0) {
			issues.push({
				id: `no-tags-${bind.id}`,
				title: "No tags",
				description: `${getBindTitle(bind)} has no tags for filtering.`,
				severity: "info",
				bindId: bind.id,
			});
		}

		if (
			bind.translations.some((translation) => translation.content.length > 1200)
		) {
			issues.push({
				id: `long-${bind.id}`,
				title: "Long content",
				description: `${getBindTitle(bind)} may be hard to scan quickly.`,
				severity: "info",
				bindId: bind.id,
			});
		}

		if (!categoryIds.has(bind.categoryId)) {
			issues.push({
				id: `orphan-category-${bind.id}`,
				title: "Missing category",
				description: `${getBindTitle(bind)} points to a category that no longer exists.`,
				severity: "critical",
				bindId: bind.id,
			});
		}

		if (bind.folderId && !folderIds.has(bind.folderId)) {
			issues.push({
				id: `orphan-folder-${bind.id}`,
				title: "Missing folder",
				description: `${getBindTitle(bind)} points to a folder that no longer exists.`,
				severity: "critical",
				bindId: bind.id,
			});
		}
	}

	for (const folder of folders) {
		const hasChildFolder = folders.some((item) => item.parentId === folder.id);
		const hasBind = activeBinds.some((bind) => bind.folderId === folder.id);

		if (!hasChildFolder && !hasBind) {
			issues.push({
				id: `unused-folder-${folder.id}`,
				title: "Unused folder",
				description: `${folder.name} has no binds or subfolders.`,
				severity: "info",
				folderId: folder.id,
				categoryId: folder.categoryId,
			});
		}
	}

	return {
		issues,
		stats: {
			activeBinds: activeBinds.length,
			archivedBinds: archivedBinds.length,
			duplicates: issues.filter((issue) => issue.id.startsWith("duplicate-"))
				.length,
			missingTranslations: issues.filter((issue) =>
				issue.id.startsWith("missing-lang-"),
			).length,
			emptyContent: issues.filter((issue) => issue.id.startsWith("empty-"))
				.length,
			unusedFolders: issues.filter((issue) =>
				issue.id.startsWith("unused-folder-"),
			).length,
			orphanedBinds: issues.filter(
				(issue) =>
					issue.id.startsWith("orphan-category-") ||
					issue.id.startsWith("orphan-folder-"),
			).length,
		},
	};
}
