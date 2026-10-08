import type { Bind, BindHistoryEntry, BindTranslation } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { supabaseService } from "@/services/supabase.service";
import { useKnowledgeStore } from "@/store";
import { can } from "../../../shared/access.js";

import { databaseKnowledgeService } from "./knowledge-api";
import { clone, type KnowledgeDatabase, now } from "./knowledge-import-export";
import {
	getNextBindOrder,
	getReorderedItemOrders,
	type MoveDirection,
} from "./knowledge-tree";

export interface CreateBindInput {
	categoryId: string;
	folderId?: string;
	slug?: string;
	ownerId?: string | null;
	sourceBindId?: string;
	sourceHash?: string;
	importBatchId?: string;
	imported?: boolean;
	title?: string;
	content?: string;
	language?: string;
	tags?: string[];
	translations?: BindTranslation[];
	aiGenerated?: boolean;
	aiTranslated?: boolean;
	aiSummary?: string;
	favorite?: boolean;
	pinned?: boolean;
	archived?: boolean;
	icon?: string;
	color?: string;
}

export interface UpdateBindInput {
	categoryId?: string;
	folderId?: string | null;
	slug?: string;
	ownerId?: string | null;
	sourceBindId?: string;
	sourceHash?: string;
	importBatchId?: string;
	imported?: boolean;
	title?: string;
	content?: string;
	language?: string;
	tags?: string[];
	translations?: BindTranslation[];
	aiGenerated?: boolean;
	aiTranslated?: boolean;
	aiSummary?: string;
	favorite?: boolean;
	pinned?: boolean;
	order?: number;
	copyCount?: number;
	lastCopiedAt?: string;
	archived?: boolean;
	icon?: string;
	color?: string;
}

export type CreateCategoryInput = string | Partial<KnowledgeCategory>;

interface MoveBindInput {
	categoryId: string;
	folderId?: string;
}

interface MoveFolderInput {
	categoryId: string;
	parentId?: string;
}

export interface RestoreDeletedItemsInput {
	categories?: KnowledgeCategory[];
	folders?: KnowledgeFolder[];
	binds?: Bind[];
}

export type CreateFolderInput = {
	categoryId: string;
	parentId?: string;
	name: string;
	ownerId?: string | null;
	icon?: string;
	color?: string;
	order?: number;
};

function uniqueIds(ids: string[]) {
	return Array.from(new Set(ids.filter(Boolean)));
}

function createId(prefix: string) {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;

	return `${prefix}-${random}`;
}

function slugify(value: string) {
	const slug = value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || `bind-${Date.now()}`;
}

function uniqueSlug(slug: string, binds: Bind[], currentId?: string) {
	const base = slugify(slug);
	let next = base;
	let index = 2;

	while (binds.some((bind) => bind.id !== currentId && bind.slug === next)) {
		next = `${base}-${index}`;
		index += 1;
	}

	return next;
}

function normalizeTags(tags?: string[]) {
	return Array.from(
		new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
	);
}

function normalizeTranslations(
	translations: BindTranslation[] | undefined,
	language: string,
	title: string,
	content: string,
) {
	const next = translations?.length
		? translations.map((translation) => ({
				...translation,
				updatedAt: translation.updatedAt || now(),
			}))
		: [];
	const existing = next.find(
		(translation) => translation.language === language,
	);

	if (existing) {
		existing.title = existing.title || title;
		existing.content = existing.content || content;
		existing.updatedAt = now();
	} else {
		next.push({
			language,
			title,
			content,
			updatedAt: now(),
		});
	}

	return next;
}

function createBindHistoryEntry(bind: Bind): BindHistoryEntry {
	return {
		id: createId("history"),
		createdAt: now(),
		slug: bind.slug,
		tags: [...bind.tags],
		translations: clone(bind.translations),
	};
}

function shouldTrackBindHistory(patch: UpdateBindInput) {
	return (
		patch.slug !== undefined ||
		patch.tags !== undefined ||
		patch.translations !== undefined ||
		patch.title !== undefined ||
		patch.content !== undefined
	);
}

function updateTranslation(
	translations: BindTranslation[],
	language: string,
	title?: string,
	content?: string,
) {
	const next = [...translations];
	const index = next.findIndex(
		(translation) => translation.language === language,
	);
	const previous = index >= 0 ? next[index] : undefined;

	const updated: BindTranslation = {
		language,
		title: title ?? previous?.title ?? "",
		content: content ?? previous?.content ?? "",
		updatedAt: now(),
		aiGenerated: previous?.aiGenerated,
		agentInstructions: previous?.agentInstructions,
	};

	if (index >= 0) {
		next[index] = updated;
	} else {
		next.push(updated);
	}

	return next;
}

// Synchronous runtime mutations keep their existing facade calls and API payloads.
export abstract class KnowledgeMutations {
	abstract saveKnowledge(
		database?: Partial<KnowledgeDatabase>,
	): KnowledgeDatabase;
	abstract revealLocation(categoryId: string, folderId?: string): void;
	abstract collectFolderIds(
		id: string,
		folders: KnowledgeFolder[],
		result?: Set<string>,
	): Set<string>;

	createBind(input: CreateBindInput) {
		const store = useKnowledgeStore.getState();
		const language = input.language ?? store.language;
		const title = input.title?.trim() || "Untitled bind";
		const content = input.content ?? "";
		const favorite = Boolean(input.favorite);
		const bind: Bind = {
			id: createId("bind"),
			ownerId:
				input.ownerId === undefined ? this.getDefaultOwnerId() : input.ownerId,
			sourceBindId: input.sourceBindId,
			sourceHash: input.sourceHash,
			importBatchId: input.importBatchId,
			imported: Boolean(input.imported),
			slug: uniqueSlug(input.slug ?? title, store.binds),
			categoryId: input.categoryId,
			folderId: input.folderId,
			order: getNextBindOrder(store.binds, input.categoryId, input.folderId),
			icon: input.icon,
			color: input.color,
			tags: normalizeTags(input.tags),
			translations: normalizeTranslations(
				input.translations,
				language,
				title,
				content,
			),
			history: [],
			pinned: Boolean(input.pinned),
			copyCount: 0,
			aiGenerated: input.aiGenerated,
			aiTranslated: input.aiTranslated,
			aiSummary: input.aiSummary,
			favorite,
			archived: Boolean(input.archived),
			createdAt: now(),
			updatedAt: now(),
		};

		store.setBinds([...store.binds, bind]);
		store.openBind(bind.id);
		this.revealLocation(bind.categoryId, bind.folderId);
		this.saveKnowledge();
		databaseKnowledgeService.saveBind(bind);

		return bind;
	}

	updateBind(id: string, patch: UpdateBindInput) {
		const store = useKnowledgeStore.getState();
		const existing = store.binds.find((bind) => bind.id === id);

		if (!existing) {
			throw new Error("Bind not found");
		}

		if (this.shouldCreatePersonalOverride(existing)) {
			const override = this.createPersonalBindOverride(
				existing,
				patch,
				store.binds,
			);
			const binds = [
				...store.binds.filter((bind) => bind.id !== existing.id),
				override,
			];

			store.setBinds(binds);
			store.openBind(override.id);
			this.saveKnowledge();
			databaseKnowledgeService.saveBind(override);

			return override;
		}

		const language = patch.language ?? store.language;
		const translations =
			patch.translations ??
			(patch.title !== undefined || patch.content !== undefined
				? updateTranslation(
						existing.translations,
						language,
						patch.title,
						patch.content,
					)
				: existing.translations);
		const updated: Bind = {
			...existing,
			ownerId: patch.ownerId === undefined ? existing.ownerId : patch.ownerId,
			sourceBindId:
				patch.sourceBindId === undefined
					? existing.sourceBindId
					: patch.sourceBindId,
			sourceHash:
				patch.sourceHash === undefined ? existing.sourceHash : patch.sourceHash,
			importBatchId:
				patch.importBatchId === undefined
					? existing.importBatchId
					: patch.importBatchId,
			imported:
				patch.imported === undefined ? existing.imported : patch.imported,
			categoryId: patch.categoryId ?? existing.categoryId,
			folderId:
				patch.folderId === undefined
					? existing.folderId
					: patch.folderId || undefined,
			order: patch.order === undefined ? existing.order : patch.order,
			slug:
				patch.slug === undefined
					? existing.slug
					: uniqueSlug(patch.slug, store.binds, id),
			icon: patch.icon === undefined ? existing.icon : patch.icon,
			color: patch.color === undefined ? existing.color : patch.color,
			tags:
				patch.tags === undefined ? existing.tags : normalizeTags(patch.tags),
			translations,
			history: shouldTrackBindHistory(patch)
				? [createBindHistoryEntry(existing), ...(existing.history ?? [])].slice(
						0,
						25,
					)
				: existing.history,
			pinned: patch.pinned === undefined ? existing.pinned : patch.pinned,
			copyCount:
				patch.copyCount === undefined ? existing.copyCount : patch.copyCount,
			lastCopiedAt:
				patch.lastCopiedAt === undefined
					? existing.lastCopiedAt
					: patch.lastCopiedAt,
			aiGenerated:
				patch.aiGenerated === undefined
					? existing.aiGenerated
					: patch.aiGenerated,
			aiTranslated:
				patch.aiTranslated === undefined
					? existing.aiTranslated
					: patch.aiTranslated,
			aiSummary:
				patch.aiSummary === undefined ? existing.aiSummary : patch.aiSummary,
			favorite:
				patch.favorite === undefined ? existing.favorite : patch.favorite,
			archived:
				patch.archived === undefined ? existing.archived : patch.archived,
			updatedAt: now(),
		};

		store.setBinds(
			store.binds.map((bind) => (bind.id === id ? updated : bind)),
		);
		this.saveKnowledge();
		databaseKnowledgeService.saveBind(updated);

		return updated;
	}

	duplicateBind(id: string) {
		const store = useKnowledgeStore.getState();
		const existing = store.binds.find((bind) => bind.id === id);

		if (!existing) {
			throw new Error("Bind not found");
		}

		const duplicate = this.createBind({
			categoryId: existing.categoryId,
			folderId: existing.folderId,
			slug: `${existing.slug}-copy`,
			ownerId: existing.ownerId,
			icon: existing.icon,
			color: existing.color,
			tags: existing.tags,
			translations: clone(existing.translations),
			title: existing.translations[0]?.title ?? existing.slug,
			content: existing.translations[0]?.content ?? "",
			language: existing.translations[0]?.language,
		});

		return duplicate;
	}

	restoreBindHistory(id: string, historyId: string) {
		const store = useKnowledgeStore.getState();
		const existing = store.binds.find((bind) => bind.id === id);
		const entry = existing?.history?.find((item) => item.id === historyId);

		if (!existing || !entry) {
			throw new Error("History entry not found");
		}

		return this.updateBind(id, {
			slug: entry.slug,
			tags: entry.tags,
			translations: clone(entry.translations),
		});
	}

	togglePinnedBind(id: string) {
		const store = useKnowledgeStore.getState();
		const existing = store.binds.find((bind) => bind.id === id);

		if (!existing) {
			throw new Error("Bind not found");
		}

		const updated = this.updateBind(id, {
			pinned: !existing.pinned,
		});

		return Boolean(updated.pinned);
	}

	recordBindCopied(id: string) {
		const store = useKnowledgeStore.getState();
		const existing = store.binds.find((bind) => bind.id === id);

		if (!existing) return;

		this.updateBind(id, {
			copyCount: (existing.copyCount ?? 0) + 1,
			lastCopiedAt: now(),
		});
	}

	moveBindBefore(id: string, targetId: string) {
		if (id === targetId) return false;

		const store = useKnowledgeStore.getState();
		const source = store.binds.find((bind) => bind.id === id);
		const target = store.binds.find((bind) => bind.id === targetId);

		if (!source || !target) {
			throw new Error("Bind not found");
		}

		const siblingBinds = store.binds
			.filter(
				(bind) =>
					!bind.archived &&
					bind.categoryId === target.categoryId &&
					(bind.folderId ?? "") === (target.folderId ?? "") &&
					bind.id !== id,
			)
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		const targetIndex = siblingBinds.findIndex((bind) => bind.id === targetId);

		if (targetIndex < 0) return false;

		siblingBinds.splice(targetIndex, 0, {
			...source,
			categoryId: target.categoryId,
			folderId: target.folderId,
		});

		const orderById = new Map(
			siblingBinds.map((bind, index) => [bind.id, index + 1]),
		);
		const binds = store.binds.map((bind) => {
			const order = orderById.get(bind.id);

			return order
				? {
						...bind,
						categoryId: target.categoryId,
						folderId: target.folderId,
						order,
						updatedAt: now(),
					}
				: bind;
		});
		const changedBinds = binds.filter((bind) => {
			const previous = store.binds.find((item) => item.id === bind.id);

			return (
				previous &&
				(previous.categoryId !== bind.categoryId ||
					previous.folderId !== bind.folderId ||
					previous.order !== bind.order)
			);
		});

		store.setBinds(binds);
		this.saveKnowledge();
		databaseKnowledgeService.saveMany({ binds: changedBinds });

		return changedBinds.length > 0;
	}

	moveBind(id: string, destination: MoveBindInput) {
		const store = useKnowledgeStore.getState();
		const existing = store.binds.find((bind) => bind.id === id);

		if (!existing) {
			throw new Error("Bind not found");
		}

		const targetFolderId = destination.folderId ?? "";
		const targetFolder = targetFolderId
			? store.folders.find((folder) => folder.id === targetFolderId)
			: undefined;

		if (targetFolderId && !targetFolder) {
			throw new Error("Destination folder was not found");
		}

		const categoryId = targetFolder?.categoryId ?? destination.categoryId;

		if (!store.categories.some((category) => category.id === categoryId)) {
			throw new Error("Destination category was not found");
		}

		if (
			existing.categoryId === categoryId &&
			(existing.folderId ?? "") === targetFolderId
		) {
			return existing;
		}

		const moved = this.updateBind(id, {
			categoryId,
			folderId: targetFolderId || null,
			order: getNextBindOrder(store.binds, categoryId, targetFolderId),
		});
		if (store.selectedBind === id)
			useKnowledgeStore.getState().openBind(moved.id);
		this.revealLocation(categoryId, targetFolderId);
		return moved;
	}

	restoreDeletedItems({
		categories = [],
		folders = [],
		binds = [],
	}: RestoreDeletedItemsInput) {
		if (categories.length === 0 && folders.length === 0 && binds.length === 0) {
			return;
		}

		const store = useKnowledgeStore.getState();
		const mergeById = <T extends { id: string }>(current: T[], restored: T[]) =>
			Array.from(
				new Map(
					[...current, ...restored].map((item) => [item.id, item]),
				).values(),
			);

		store.setKnowledge({
			categories: mergeById(store.categories, categories),
			folders: mergeById(store.folders, folders),
			binds: mergeById(store.binds, binds),
		});
		this.saveKnowledge();
		databaseKnowledgeService.saveMany({ categories, folders, binds });
	}

	deleteBind(id: string) {
		const store = useKnowledgeStore.getState();
		const existing = store.binds.find((bind) => bind.id === id);

		if (existing && this.shouldCreatePersonalOverride(existing)) {
			const override = this.createPersonalBindOverride(
				existing,
				{ archived: true },
				store.binds,
			);
			const binds = [
				...store.binds.filter((bind) => bind.id !== existing.id),
				override,
			];
			const openedTabs = store.openedTabs.filter((tabId) => tabId !== id);
			const pinnedTabs = store.pinnedTabs.filter((tabId) => tabId !== id);
			const activeTab =
				store.activeTab === id ? openedTabs.at(-1) : store.activeTab;

			store.setKnowledge({
				binds,
				openedTabs,
				pinnedTabs,
				activeTab,
				selectedBind: activeTab,
			});
			this.saveKnowledge();
			databaseKnowledgeService.saveBind(override);

			return;
		}

		const binds = store.binds.filter((bind) => bind.id !== id);

		const openedTabs = store.openedTabs.filter((tabId) => tabId !== id);
		const pinnedTabs = store.pinnedTabs.filter((tabId) => tabId !== id);

		const activeTab =
			store.activeTab === id ? openedTabs.at(-1) : store.activeTab;

		store.setKnowledge({
			binds,
			favorites: store.favorites.filter((favoriteId) => favoriteId !== id),
			recent: store.recent.filter((recentId) => recentId !== id),
			openedTabs,
			pinnedTabs,
			activeTab,
			selectedBind: activeTab,
		});

		this.saveKnowledge();
		databaseKnowledgeService.deleteBind(id);
	}

	archiveBind(id: string) {
		const archived = this.updateBind(id, { archived: true });
		const store = useKnowledgeStore.getState();
		const openedTabs = store.openedTabs.filter((tabId) => tabId !== id);
		const pinnedTabs = store.pinnedTabs.filter((tabId) => tabId !== id);
		const activeTab =
			store.activeTab === id ? openedTabs.at(-1) : store.activeTab;

		store.setKnowledge({
			openedTabs,
			pinnedTabs,
			activeTab,
			selectedBind: activeTab,
			favorites: store.favorites.filter((favoriteId) => favoriteId !== id),
			recent: store.recent.filter((recentId) => recentId !== id),
		});
		this.saveKnowledge();

		return archived;
	}

	updateManyBinds(
		ids: string[],
		patchOrFactory: UpdateBindInput | ((bind: Bind) => UpdateBindInput),
	) {
		const targetIds = new Set(uniqueIds(ids));

		if (targetIds.size === 0) return [];

		const store = useKnowledgeStore.getState();
		const changedBinds: Bind[] = [];
		const binds = store.binds.map((bind) => {
			if (!targetIds.has(bind.id)) return bind;

			const patch =
				typeof patchOrFactory === "function"
					? patchOrFactory(bind)
					: patchOrFactory;
			const language = patch.language ?? store.language;
			const translations =
				patch.translations ??
				(patch.title !== undefined || patch.content !== undefined
					? updateTranslation(
							bind.translations,
							language,
							patch.title,
							patch.content,
						)
					: bind.translations);
			const updated: Bind = {
				...bind,
				ownerId: patch.ownerId === undefined ? bind.ownerId : patch.ownerId,
				sourceBindId:
					patch.sourceBindId === undefined
						? bind.sourceBindId
						: patch.sourceBindId,
				sourceHash:
					patch.sourceHash === undefined ? bind.sourceHash : patch.sourceHash,
				importBatchId:
					patch.importBatchId === undefined
						? bind.importBatchId
						: patch.importBatchId,
				imported: patch.imported === undefined ? bind.imported : patch.imported,
				categoryId: patch.categoryId ?? bind.categoryId,
				folderId:
					patch.folderId === undefined
						? bind.folderId
						: patch.folderId || undefined,
				order: patch.order === undefined ? bind.order : patch.order,
				slug:
					patch.slug === undefined
						? bind.slug
						: uniqueSlug(patch.slug, store.binds, bind.id),
				icon: patch.icon === undefined ? bind.icon : patch.icon,
				color: patch.color === undefined ? bind.color : patch.color,
				tags: patch.tags === undefined ? bind.tags : normalizeTags(patch.tags),
				translations,
				history: shouldTrackBindHistory(patch)
					? [createBindHistoryEntry(bind), ...(bind.history ?? [])].slice(0, 25)
					: bind.history,
				pinned: patch.pinned === undefined ? bind.pinned : patch.pinned,
				copyCount:
					patch.copyCount === undefined ? bind.copyCount : patch.copyCount,
				lastCopiedAt:
					patch.lastCopiedAt === undefined
						? bind.lastCopiedAt
						: patch.lastCopiedAt,
				aiGenerated:
					patch.aiGenerated === undefined
						? bind.aiGenerated
						: patch.aiGenerated,
				aiTranslated:
					patch.aiTranslated === undefined
						? bind.aiTranslated
						: patch.aiTranslated,
				aiSummary:
					patch.aiSummary === undefined ? bind.aiSummary : patch.aiSummary,
				favorite: patch.favorite === undefined ? bind.favorite : patch.favorite,
				archived: patch.archived === undefined ? bind.archived : patch.archived,
				updatedAt: now(),
			};

			if (JSON.stringify(updated) !== JSON.stringify(bind)) {
				changedBinds.push(updated);
			}

			return updated;
		});

		if (changedBinds.length === 0) return [];

		const changedIds = new Set(changedBinds.map((bind) => bind.id));
		const archiveIds = new Set(
			changedBinds.filter((bind) => bind.archived).map((bind) => bind.id),
		);
		let favorites = store.favorites;

		if (changedBinds.some((bind) => bind.favorite)) {
			favorites = uniqueIds([
				...favorites,
				...changedBinds
					.filter((bind) => bind.favorite && !bind.archived)
					.map((bind) => bind.id),
			]);
		}

		if (changedBinds.some((bind) => !bind.favorite || bind.archived)) {
			favorites = favorites.filter((id) => {
				const changed = changedBinds.find((bind) => bind.id === id);

				return changed ? changed.favorite && !changed.archived : true;
			});
		}

		const openedTabs =
			archiveIds.size > 0
				? store.openedTabs.filter((id) => !archiveIds.has(id))
				: store.openedTabs;
		const pinnedTabs =
			archiveIds.size > 0
				? store.pinnedTabs.filter((id) => !archiveIds.has(id))
				: store.pinnedTabs;
		const activeTab =
			store.activeTab && archiveIds.has(store.activeTab)
				? openedTabs.at(-1)
				: store.activeTab;

		store.setKnowledge({
			binds,
			favorites,
			recent: store.recent.filter((id) => !archiveIds.has(id)),
			openedTabs,
			pinnedTabs,
			activeTab,
			selectedBind:
				store.selectedBind && archiveIds.has(store.selectedBind)
					? activeTab
					: store.selectedBind,
		});
		this.saveKnowledge();
		databaseKnowledgeService.saveMany({ binds: changedBinds });

		return changedBinds.filter((bind) => changedIds.has(bind.id));
	}

	addTagToBinds(ids: string[], tag: string) {
		const normalizedTag = tag.trim();

		if (!normalizedTag) return [];

		return this.updateManyBinds(ids, (bind) => ({
			tags: Array.from(new Set([...bind.tags, normalizedTag])),
		}));
	}

	archiveManyBinds(ids: string[]) {
		return this.updateManyBinds(ids, { archived: true, favorite: false });
	}

	restoreArchivedBind(id: string) {
		const [restored] = this.updateManyBinds([id], { archived: false });

		if (restored) {
			useKnowledgeStore.getState().openBind(restored.id);
			this.saveKnowledge();
		}

		return restored;
	}

	deleteManyBinds(ids: string[]) {
		const targetIds = new Set(uniqueIds(ids));

		if (targetIds.size === 0) return [];

		const store = useKnowledgeStore.getState();
		const deletedBinds = store.binds.filter((bind) => targetIds.has(bind.id));

		if (deletedBinds.length === 0) return [];

		const openedTabs = store.openedTabs.filter((id) => !targetIds.has(id));
		const activeTab =
			store.activeTab && targetIds.has(store.activeTab)
				? openedTabs.at(-1)
				: store.activeTab;

		store.setKnowledge({
			binds: store.binds.filter((bind) => !targetIds.has(bind.id)),
			favorites: store.favorites.filter((id) => !targetIds.has(id)),
			recent: store.recent.filter((id) => !targetIds.has(id)),
			openedTabs,
			pinnedTabs: store.pinnedTabs.filter((id) => !targetIds.has(id)),
			activeTab,
			selectedBind:
				store.selectedBind && targetIds.has(store.selectedBind)
					? activeTab
					: store.selectedBind,
		});
		this.saveKnowledge();

		for (const bind of deletedBinds) {
			databaseKnowledgeService.deleteBind(bind.id);
		}

		return deletedBinds;
	}

	createCategory(input: CreateCategoryInput) {
		const store = useKnowledgeStore.getState();
		const partial = typeof input === "string" ? { name: input } : input;
		const order =
			partial.order ??
			Math.max(0, ...store.categories.map((item) => item.order)) + 1;
		const category: KnowledgeCategory = {
			id: partial.id ?? createId("category"),
			ownerId:
				partial.ownerId === undefined
					? this.getDefaultOwnerId()
					: partial.ownerId,
			name: partial.name?.trim() || "New category",
			icon: partial.icon,
			color: partial.color,
			order,
		};

		store.setCategories([...store.categories, category]);
		store.selectCategory(category.id);
		store.toggleFolder(category.id);
		this.saveKnowledge();
		databaseKnowledgeService.saveCategory(category);

		return category;
	}

	updateCategory(id: string, patch: Partial<KnowledgeCategory>) {
		const store = useKnowledgeStore.getState();
		const updatedCategories = store.categories.map((category) =>
			category.id === id
				? {
						...category,
						...patch,
						name: patch.name?.trim() || category.name,
					}
				: category,
		);

		store.setCategories(updatedCategories);
		this.saveKnowledge();
		const updatedCategory = updatedCategories.find(
			(category) => category.id === id,
		);
		if (updatedCategory) {
			databaseKnowledgeService.saveCategory(updatedCategory);
		}
	}

	moveCategory(id: string, direction: MoveDirection) {
		const store = useKnowledgeStore.getState();
		const orderById = getReorderedItemOrders(store.categories, id, direction);

		if (!orderById) return false;

		const categories = store.categories.map((category) => {
			const order = orderById.get(category.id);

			return order && order !== category.order
				? {
						...category,
						order,
					}
				: category;
		});
		const changedCategories = categories.filter((category) => {
			const previous = store.categories.find((item) => item.id === category.id);

			return previous && previous.order !== category.order;
		});

		if (changedCategories.length === 0) return false;

		store.setCategories(categories);
		this.saveKnowledge();
		databaseKnowledgeService.saveMany({ categories: changedCategories });

		return true;
	}

	deleteCategory(id: string) {
		const store = useKnowledgeStore.getState();
		const folderIds = new Set(
			store.folders
				.filter((folder) => folder.categoryId === id)
				.map((folder) => folder.id),
		);

		store.setKnowledge({
			categories: store.categories.filter((category) => category.id !== id),
			folders: store.folders.filter((folder) => folder.categoryId !== id),
			binds: store.binds.filter(
				(bind) =>
					bind.categoryId !== id &&
					(!bind.folderId || !folderIds.has(bind.folderId)),
			),
		});
		this.saveKnowledge();
		databaseKnowledgeService.deleteCategory(id);
		if (
			!useKnowledgeStore.getState().selectedBind &&
			store.selectedCategory === id
		)
			useKnowledgeStore
				.getState()
				.selectCategory(useKnowledgeStore.getState().categories[0]?.id);
	}

	createFolder(input: CreateFolderInput) {
		const store = useKnowledgeStore.getState();
		const order =
			input.order ??
			Math.max(
				0,
				...store.folders
					.filter(
						(folder) =>
							folder.categoryId === input.categoryId &&
							folder.parentId === input.parentId,
					)
					.map((folder) => folder.order),
			) + 1;
		const folder: KnowledgeFolder = {
			id: createId("folder"),
			ownerId:
				input.ownerId === undefined ? this.getDefaultOwnerId() : input.ownerId,
			categoryId: input.categoryId,
			parentId: input.parentId,
			name: input.name.trim() || "New folder",
			icon: input.icon,
			color: input.color,
			order,
		};

		store.setFolders([...store.folders, folder]);
		store.selectFolder(folder.id);

		for (const id of [input.parentId ?? input.categoryId, folder.id]) {
			if (!store.expandedFolders.includes(id)) {
				store.toggleFolder(id);
			}
		}

		this.saveKnowledge();
		databaseKnowledgeService.saveFolder(folder);
		this.revealLocation(folder.categoryId, folder.id);

		return folder;
	}

	updateFolder(id: string, patch: Partial<KnowledgeFolder>) {
		const store = useKnowledgeStore.getState();

		store.setFolders(
			store.folders.map((folder) =>
				folder.id === id
					? {
							...folder,
							...patch,
							name: patch.name?.trim() || folder.name,
						}
					: folder,
			),
		);
		this.saveKnowledge();
		const updatedFolder = useKnowledgeStore
			.getState()
			.folders.find((folder) => folder.id === id);
		if (updatedFolder) {
			databaseKnowledgeService.saveFolder(updatedFolder);
		}
	}

	moveFolder(id: string, direction: MoveDirection) {
		const store = useKnowledgeStore.getState();
		const folder = store.folders.find((item) => item.id === id);

		if (!folder) return false;

		const siblingFolders = store.folders.filter(
			(item) =>
				item.categoryId === folder.categoryId &&
				item.parentId === folder.parentId,
		);
		const orderById = getReorderedItemOrders(siblingFolders, id, direction);

		if (!orderById) return false;

		const folders = store.folders.map((item) => {
			const order = orderById.get(item.id);

			return order && order !== item.order
				? {
						...item,
						order,
					}
				: item;
		});
		const changedFolders = folders.filter((item) => {
			const previous = store.folders.find((folder) => folder.id === item.id);

			return previous && previous.order !== item.order;
		});

		if (changedFolders.length === 0) return false;

		store.setFolders(folders);
		this.saveKnowledge();
		databaseKnowledgeService.saveMany({ folders: changedFolders });

		return true;
	}

	moveFolderTo(id: string, destination: MoveFolderInput) {
		const store = useKnowledgeStore.getState();
		const folder = store.folders.find((item) => item.id === id);

		if (!folder) {
			throw new Error("Folder not found");
		}
		if (!this.canManageStructure(folder.ownerId))
			throw new Error("Нет права перемещать общую папку");

		const targetParentId = destination.parentId ?? "";
		const targetParent = targetParentId
			? store.folders.find((item) => item.id === targetParentId)
			: undefined;

		if (targetParentId && !targetParent) {
			throw new Error("Destination folder was not found");
		}

		const categoryId = targetParent?.categoryId ?? destination.categoryId;

		if (!store.categories.some((category) => category.id === categoryId)) {
			throw new Error("Destination category was not found");
		}

		const movedFolderIds = this.collectFolderIds(id, store.folders);
		if (
			store.folders.some(
				(f) => movedFolderIds.has(f.id) && !this.canManageStructure(f.ownerId),
			) ||
			store.binds.some(
				(b) =>
					b.folderId &&
					movedFolderIds.has(b.folderId) &&
					!this.canManageStructure(b.ownerId),
			)
		)
			throw new Error(
				"Папка содержит общие материалы: перемещайте их через личные версии",
			);

		if (targetParentId && movedFolderIds.has(targetParentId)) {
			throw new Error("Folder cannot be moved into itself");
		}

		if (
			folder.categoryId === categoryId &&
			(folder.parentId ?? "") === targetParentId
		) {
			return {
				folders: [folder],
				binds: [],
			};
		}

		const nextOrder =
			Math.max(
				0,
				...store.folders
					.filter(
						(item) =>
							item.id !== id &&
							item.categoryId === categoryId &&
							(item.parentId ?? "") === targetParentId,
					)
					.map((item) => item.order),
			) + 1;
		const folders = store.folders.map((item) => {
			if (!movedFolderIds.has(item.id)) return item;

			return {
				...item,
				categoryId,
				parentId: item.id === id ? targetParentId || undefined : item.parentId,
				order: item.id === id ? nextOrder : item.order,
			};
		});
		const binds = store.binds.map((bind) =>
			bind.folderId && movedFolderIds.has(bind.folderId)
				? {
						...bind,
						categoryId,
						updatedAt: now(),
					}
				: bind,
		);
		const changedFolders = folders.filter((item) => {
			const previous = store.folders.find((folder) => folder.id === item.id);

			return (
				previous &&
				(previous.categoryId !== item.categoryId ||
					previous.parentId !== item.parentId ||
					previous.order !== item.order)
			);
		});
		const changedBinds = binds.filter((bind) => {
			const previous = store.binds.find((item) => item.id === bind.id);

			return previous && previous.categoryId !== bind.categoryId;
		});

		store.setKnowledge({
			folders,
			binds,
			selectedCategory: categoryId,
			selectedFolder: id,
		});

		for (const expandableId of [categoryId, targetParentId, id]) {
			if (expandableId && !store.expandedFolders.includes(expandableId)) {
				useKnowledgeStore.getState().toggleFolder(expandableId);
			}
		}

		this.saveKnowledge();
		databaseKnowledgeService.saveMany({
			folders: changedFolders,
			binds: changedBinds,
		});
		this.revealLocation(categoryId, id);

		return {
			folders: changedFolders,
			binds: changedBinds,
		};
	}

	deleteFolder(id: string) {
		const store = useKnowledgeStore.getState();
		const previous = store.folders.find((folder) => folder.id === id);
		const folderIds = this.collectFolderIds(id, store.folders);

		store.setKnowledge({
			folders: store.folders.filter((folder) => !folderIds.has(folder.id)),
			binds: store.binds.filter(
				(bind) => !bind.folderId || !folderIds.has(bind.folderId),
			),
		});
		this.saveKnowledge();
		databaseKnowledgeService.deleteFolder(id);
		if (
			!useKnowledgeStore.getState().selectedBind &&
			folderIds.has(store.selectedFolder ?? "")
		) {
			if (previous?.parentId)
				useKnowledgeStore.getState().selectFolder(previous.parentId);
			else useKnowledgeStore.getState().selectCategory(previous?.categoryId);
		}
	}

	toggleFavorite(id: string) {
		const store = useKnowledgeStore.getState();
		const favorite = !store.favorites.includes(id);
		const existing = store.binds.find((bind) => bind.id === id);

		if (existing && this.shouldCreatePersonalOverride(existing)) {
			const override = this.createPersonalBindOverride(
				existing,
				{ favorite },
				store.binds,
			);
			const favorites = favorite
				? [...store.favorites, override.id]
				: store.favorites.filter((favoriteId) => favoriteId !== id);

			store.setKnowledge({
				binds: [
					...store.binds.filter((bind) => bind.id !== existing.id),
					override,
				],
				favorites,
			});
			this.saveKnowledge();
			databaseKnowledgeService.saveBind(override);

			return favorite;
		}

		const favorites = favorite
			? [...store.favorites, id]
			: store.favorites.filter((favoriteId) => favoriteId !== id);
		const binds = store.binds.map((bind) =>
			bind.id === id ? { ...bind, favorite, updatedAt: now() } : bind,
		);

		store.setKnowledge({ binds, favorites });
		this.saveKnowledge();
		const updatedBind = binds.find((bind) => bind.id === id);
		if (updatedBind) {
			databaseKnowledgeService.saveBind(updatedBind);
		}

		return favorite;
	}

	canManageStructure(ownerId?: string | null) {
		const session = supabaseService.getSession();
		return Boolean(
			session &&
				(ownerId === undefined ||
					ownerId === session.user.id ||
					(ownerId === null && can(session.user.access, "knowledge.write"))),
		);
	}

	private getDefaultOwnerId() {
		const session = supabaseService.getSession();

		if (can(session?.user.access, "knowledge.write")) return null;
		if (!session) throw new Error("Войдите с личным аккаунтом");

		return session.user.id;
	}

	private shouldCreatePersonalOverride(bind: Bind) {
		const session = supabaseService.getSession();

		return (
			Boolean(session) &&
			!can(session?.user.access, "knowledge.write") &&
			bind.ownerId === null
		);
	}

	private createPersonalBindOverride(
		existing: Bind,
		patch: UpdateBindInput,
		binds: Bind[],
	): Bind {
		const session = supabaseService.getSession();
		const language = patch.language ?? useKnowledgeStore.getState().language;
		const translations =
			patch.translations ??
			(patch.title !== undefined || patch.content !== undefined
				? updateTranslation(
						existing.translations,
						language,
						patch.title,
						patch.content,
					)
				: existing.translations);

		return {
			...existing,
			id: createId("bind"),
			ownerId: session?.user.id,
			sourceBindId: existing.sourceBindId ?? existing.id,
			sourceHash: patch.sourceHash ?? existing.sourceHash,
			importBatchId: patch.importBatchId ?? existing.importBatchId,
			imported: patch.imported ?? existing.imported,
			categoryId: patch.categoryId ?? existing.categoryId,
			folderId:
				patch.folderId === undefined
					? existing.folderId
					: patch.folderId || undefined,
			order: patch.order === undefined ? existing.order : patch.order,
			slug:
				patch.slug === undefined
					? uniqueSlug(existing.slug, binds, existing.id)
					: uniqueSlug(patch.slug, binds, existing.id),
			icon: patch.icon === undefined ? existing.icon : patch.icon,
			color: patch.color === undefined ? existing.color : patch.color,
			tags:
				patch.tags === undefined ? existing.tags : normalizeTags(patch.tags),
			translations,
			history: shouldTrackBindHistory(patch)
				? [createBindHistoryEntry(existing), ...(existing.history ?? [])].slice(
						0,
						25,
					)
				: existing.history,
			pinned: patch.pinned === undefined ? existing.pinned : patch.pinned,
			copyCount:
				patch.copyCount === undefined ? existing.copyCount : patch.copyCount,
			lastCopiedAt:
				patch.lastCopiedAt === undefined
					? existing.lastCopiedAt
					: patch.lastCopiedAt,
			aiGenerated:
				patch.aiGenerated === undefined
					? existing.aiGenerated
					: patch.aiGenerated,
			aiTranslated:
				patch.aiTranslated === undefined
					? existing.aiTranslated
					: patch.aiTranslated,
			aiSummary:
				patch.aiSummary === undefined ? existing.aiSummary : patch.aiSummary,
			favorite:
				patch.favorite === undefined ? existing.favorite : patch.favorite,
			archived:
				patch.archived === undefined ? existing.archived : patch.archived,
			createdAt: now(),
			updatedAt: now(),
		};
	}
}
