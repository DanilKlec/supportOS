import type { Bind, BindHistoryEntry, BindTranslation } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import {
	mockBinds,
	mockCategories,
	mockFolders,
} from "@/entities/knowledge/mock";
import { cloudKnowledgeService } from "@/services/cloud-knowledge.service";
import { localKnowledgeStorageService } from "@/services/local-knowledge-storage.service";
import { supabaseService } from "@/services/supabase.service";
import { type KnowledgeSnapshot, useKnowledgeStore } from "@/store";

export interface KnowledgeDatabase
	extends Partial<
		Pick<
			KnowledgeSnapshot,
			| "selectedCategory"
			| "selectedFolder"
			| "selectedBind"
			| "expandedFolders"
			| "language"
			| "search"
			| "favorites"
			| "recent"
			| "openedTabs"
			| "pinnedTabs"
			| "activeTab"
		>
	> {
	categories: KnowledgeCategory[];
	folders: KnowledgeFolder[];
	binds: Bind[];
}

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
	archived?: boolean;
	icon?: string;
	color?: string;
}

export type CreateCategoryInput = string | Partial<KnowledgeCategory>;
type MoveDirection = "up" | "down";

interface MoveBindInput {
	categoryId: string;
	folderId?: string;
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

type StoredKnowledge = KnowledgeDatabase & {
	version?: number;
};

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function now() {
	return new Date().toISOString();
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

function getReorderedItemOrders<T extends { id: string; order: number }>(
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
	};

	if (index >= 0) {
		next[index] = updated;
	} else {
		next.push(updated);
	}

	return next;
}

async function loadConfiguredSeedKnowledge() {
	try {
		const module = await import(
			"@/entities/knowledge/mock/defaultKnowledge.json"
		);
		const config = module.default;

		if (
			config &&
			Array.isArray(config.categories) &&
			Array.isArray(config.folders) &&
			Array.isArray(config.binds)
		) {
			return normalizeDatabase(config as unknown as Partial<StoredKnowledge>);
		}
	} catch {
		return undefined;
	}

	return undefined;
}

async function seedKnowledge(): Promise<KnowledgeDatabase> {
	const configuredSeed = await loadConfiguredSeedKnowledge();

	if (configuredSeed) return configuredSeed;

	const binds = clone(mockBinds);

	return {
		categories: clone(mockCategories),
		folders: clone(mockFolders),
		binds,
		expandedFolders: mockCategories.map((category) => category.id),
		language: "ru",
		search: "",
		favorites: binds.filter((bind) => bind.favorite).map((bind) => bind.id),
		recent: [],
		openedTabs: [],
		pinnedTabs: [],
		activeTab: undefined,
		selectedBind: undefined,
		selectedCategory: undefined,
		selectedFolder: undefined,
	};
}

function normalizeDatabase(
	database: Partial<StoredKnowledge>,
): KnowledgeDatabase {
	const categories = Array.isArray(database.categories)
		? database.categories.map((category) => ({
				...category,
				ownerId:
					category.ownerId === null
						? null
						: typeof category.ownerId === "string"
							? category.ownerId
							: undefined,
			}))
		: [];
	const folders = Array.isArray(database.folders)
		? database.folders.map((folder) => ({
				...folder,
				ownerId:
					folder.ownerId === null
						? null
						: typeof folder.ownerId === "string"
							? folder.ownerId
							: undefined,
			}))
		: [];
	const binds = Array.isArray(database.binds)
		? database.binds.map((bind) => ({
				...bind,
				ownerId:
					bind.ownerId === null
						? null
						: typeof bind.ownerId === "string"
							? bind.ownerId
							: undefined,
				sourceBindId:
					typeof bind.sourceBindId === "string" ? bind.sourceBindId : undefined,
				sourceHash:
					typeof bind.sourceHash === "string" ? bind.sourceHash : undefined,
				importBatchId:
					typeof bind.importBatchId === "string"
						? bind.importBatchId
						: undefined,
				imported: Boolean(bind.imported),
				tags: Array.isArray(bind.tags) ? bind.tags : [],
				translations: Array.isArray(bind.translations) ? bind.translations : [],
				history: Array.isArray(bind.history) ? bind.history : [],
				aiGenerated: bind.aiGenerated,
				aiTranslated: bind.aiTranslated,
				aiSummary:
					typeof bind.aiSummary === "string" ? bind.aiSummary : undefined,
				favorite: Boolean(bind.favorite),
				archived: Boolean(bind.archived),
				createdAt: bind.createdAt || now(),
				updatedAt: bind.updatedAt || now(),
			}))
		: [];

	return {
		categories,
		folders,
		binds,
		expandedFolders: Array.isArray(database.expandedFolders)
			? database.expandedFolders
			: [],
		language: database.language ?? "ru",
		search: database.search ?? "",
		favorites: Array.isArray(database.favorites)
			? database.favorites
			: binds.filter((bind) => bind.favorite).map((bind) => bind.id),
		recent: Array.isArray(database.recent) ? database.recent : [],
		openedTabs: Array.isArray(database.openedTabs) ? database.openedTabs : [],
		pinnedTabs: Array.isArray(database.pinnedTabs) ? database.pinnedTabs : [],
		activeTab: database.activeTab,
		selectedBind: database.selectedBind,
		selectedCategory: database.selectedCategory,
		selectedFolder: database.selectedFolder,
	};
}

class KnowledgeService {
	private unsubscribe?: () => void;
	private saveTimer?: number;

	async loadKnowledge(): Promise<KnowledgeDatabase> {
		const storedDatabase = await this.readStorage();
		const database = storedDatabase ?? (await seedKnowledge());

		useKnowledgeStore.getState().setKnowledge(database);
		this.startAutoSave();

		if (!storedDatabase) {
			this.saveKnowledge();
		}

		return database;
	}

	async loadCloudKnowledge() {
		const cloudDatabase = await cloudKnowledgeService.loadKnowledge();

		if (!cloudDatabase) return undefined;

		useKnowledgeStore.getState().setKnowledge(cloudDatabase);
		this.saveKnowledge();

		return cloudDatabase;
	}

	saveKnowledge(database?: Partial<KnowledgeDatabase>) {
		if (database) {
			useKnowledgeStore.getState().setKnowledge(database);
		}

		const snapshot = this.getSnapshot();
		this.writeStorage(snapshot);

		return snapshot;
	}

	search(query: string) {
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
		this.saveKnowledge();
		cloudKnowledgeService.saveBind(bind);

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
			cloudKnowledgeService.saveBind(override);

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
		cloudKnowledgeService.saveBind(updated);

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

		return this.updateBind(id, {
			categoryId,
			folderId: targetFolderId || null,
		});
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
		cloudKnowledgeService.saveMany({ categories, folders, binds });
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
			cloudKnowledgeService.saveBind(override);

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
		cloudKnowledgeService.deleteBind(id);
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
		cloudKnowledgeService.saveCategory(category);

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
			cloudKnowledgeService.saveCategory(updatedCategory);
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
		cloudKnowledgeService.saveMany({ categories: changedCategories });

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
		cloudKnowledgeService.deleteCategory(id);
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
		cloudKnowledgeService.saveFolder(folder);

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
			cloudKnowledgeService.saveFolder(updatedFolder);
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
		cloudKnowledgeService.saveMany({ folders: changedFolders });

		return true;
	}

	deleteFolder(id: string) {
		const store = useKnowledgeStore.getState();
		const folderIds = this.collectFolderIds(id, store.folders);

		store.setKnowledge({
			folders: store.folders.filter((folder) => !folderIds.has(folder.id)),
			binds: store.binds.filter(
				(bind) => !bind.folderId || !folderIds.has(bind.folderId),
			),
		});
		this.saveKnowledge();
		cloudKnowledgeService.deleteFolder(id);
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
			cloudKnowledgeService.saveBind(override);

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
			cloudKnowledgeService.saveBind(updatedBind);
		}

		return favorite;
	}

	exportKnowledge() {
		return JSON.stringify(this.getSnapshot(), null, 2);
	}

	exportJson() {
		return this.exportKnowledge();
	}

	importKnowledge(payload: string | Partial<KnowledgeDatabase>) {
		const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;

		if (
			!parsed ||
			!Array.isArray(parsed.categories) ||
			!Array.isArray(parsed.folders) ||
			!Array.isArray(parsed.binds)
		) {
			throw new Error("Invalid SupportOS export");
		}

		const database = normalizeDatabase(parsed);

		useKnowledgeStore.getState().setKnowledge(database);

		this.saveKnowledge();
		cloudKnowledgeService.saveMany(database);

		return database;
	}

	importJson(payload: string) {
		return this.importKnowledge(payload);
	}

	async load(): Promise<KnowledgeDatabase> {
		return this.loadKnowledge();
	}

	async save(database?: KnowledgeDatabase) {
		return this.saveKnowledge(database);
	}

	async getCategories() {
		return useKnowledgeStore.getState().categories;
	}

	async getFolders() {
		return useKnowledgeStore.getState().folders;
	}

	async getBinds() {
		return useKnowledgeStore.getState().binds;
	}

	async getBind(id: string) {
		return useKnowledgeStore.getState().getBind(id);
	}

	private getSnapshot(): KnowledgeDatabase {
		const state = useKnowledgeStore.getState();

		return {
			categories: state.categories,
			folders: state.folders,
			binds: state.binds,
			selectedCategory: state.selectedCategory,
			selectedFolder: state.selectedFolder,
			selectedBind: state.selectedBind,
			expandedFolders: state.expandedFolders,
			language: state.language,
			search: state.search,
			favorites: state.favorites,
			recent: state.recent,
			openedTabs: state.openedTabs,
			pinnedTabs: state.pinnedTabs,
			activeTab: state.activeTab,
		};
	}

	private async readStorage() {
		const database = await localKnowledgeStorageService.read();

		return database
			? normalizeDatabase(database as Partial<StoredKnowledge>)
			: undefined;
	}

	private writeStorage(database: KnowledgeDatabase) {
		localKnowledgeStorageService.write(database);
	}

	private startAutoSave() {
		if (typeof window === "undefined" || this.unsubscribe) return;

		this.unsubscribe = useKnowledgeStore.subscribe(() => {
			this.scheduleStorageWrite();
		});
	}

	private scheduleStorageWrite() {
		if (typeof window === "undefined") return;

		window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.writeStorage(this.getSnapshot());
		}, 500);
	}

	private getDefaultOwnerId() {
		const session = supabaseService.getSession();

		if (!session || session.user.role === "admin") return null;

		return session.user.id;
	}

	private shouldCreatePersonalOverride(bind: Bind) {
		const session = supabaseService.getSession();

		return session?.user.role === "user" && bind.ownerId === null;
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

	private collectFolderIds(
		id: string,
		folders: KnowledgeFolder[],
		result = new Set<string>(),
	) {
		result.add(id);

		for (const folder of folders) {
			if (folder.parentId === id) {
				this.collectFolderIds(folder.id, folders, result);
			}
		}

		return result;
	}
}

export const knowledgeService = new KnowledgeService();
