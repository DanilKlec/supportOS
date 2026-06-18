import { create } from "zustand";
import type { Bind } from "@/entities/bind";
import type {
	KnowledgeCategory,
	KnowledgeFolder,
	KnowledgeTreeNode,
} from "@/entities/knowledge";
import { buildKnowledgeTree } from "@/entities/knowledge";

export type LanguageCode = "ru" | "en" | "de" | "pt" | "el";

export interface KnowledgeSnapshot {
	categories: KnowledgeCategory[];
	folders: KnowledgeFolder[];
	binds: Bind[];

	selectedCategory?: string;
	selectedFolder?: string;
	selectedBind?: string;

	expandedFolders: string[];

	language: LanguageCode;
	search: string;

	favorites: string[];
	recent: string[];

	openedTabs: string[];
	pinnedTabs: string[];
	activeTab?: string;
}

interface KnowledgeState extends KnowledgeSnapshot {
	tree: KnowledgeTreeNode[];

	setKnowledge: (snapshot: Partial<KnowledgeSnapshot>) => void;

	setCategories: (categories: KnowledgeCategory[]) => void;
	setFolders: (folders: KnowledgeFolder[]) => void;
	setBinds: (binds: Bind[]) => void;

	rebuildTree: () => void;

	selectCategory: (id?: string) => void;
	selectFolder: (id?: string) => void;
	selectBind: (id?: string) => void;

	openBind: (id: string) => void;
	closeTab: (id: string) => void;
	setActiveTab: (id?: string) => void;
	togglePinnedTab: (id: string) => void;

	toggleFolder: (id: string) => void;

	setLanguage: (language: LanguageCode) => void;
	setSearch: (value: string) => void;

	toggleFavorite: (id: string) => void;
	addRecent: (id: string) => void;

	getBind: (id: string) => Bind | undefined;
}

const MAX_RECENT = 5;

function unique(ids: string[]) {
	return Array.from(new Set(ids.filter(Boolean)));
}

function getBindIds(binds: Bind[]) {
	return new Set(binds.map((b) => b.id));
}

function getFolderAndCategoryIds(
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
) {
	return new Set([...categories.map((c) => c.id), ...folders.map((f) => f.id)]);
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
	categories: [],
	folders: [],
	binds: [],
	tree: [],

	expandedFolders: [],

	selectedCategory: undefined,
	selectedFolder: undefined,
	selectedBind: undefined,

	language: "ru",
	search: "",

	favorites: [],
	recent: [],

	openedTabs: [],
	pinnedTabs: [],
	activeTab: undefined,

	setKnowledge: (snapshot) => {
		const state = get();

		const categories = snapshot.categories ?? state.categories;
		const folders = snapshot.folders ?? state.folders;
		const binds = snapshot.binds ?? state.binds;

		const bindIds = getBindIds(binds);
		const expandableIds = getFolderAndCategoryIds(categories, folders);

		const openedTabs = unique(snapshot.openedTabs ?? state.openedTabs).filter(
			(id) => bindIds.has(id),
		);
		const pinnedTabs = unique(snapshot.pinnedTabs ?? state.pinnedTabs).filter(
			(id) => openedTabs.includes(id),
		);

		const requestedActiveTab =
			snapshot.activeTab ?? state.activeTab ?? openedTabs[0];
		const activeTab =
			requestedActiveTab && bindIds.has(requestedActiveTab)
				? requestedActiveTab
				: openedTabs[0];
		const requestedSelectedBind =
			snapshot.selectedBind ?? state.selectedBind ?? activeTab;
		const selectedBind =
			requestedSelectedBind && bindIds.has(requestedSelectedBind)
				? requestedSelectedBind
				: activeTab;
		const selectedBindEntity = selectedBind
			? binds.find((bind) => bind.id === selectedBind)
			: undefined;
		const requestedSelectedFolder =
			snapshot.selectedFolder ?? state.selectedFolder;
		const selectedFolder =
			selectedBindEntity?.folderId ??
			(requestedSelectedFolder &&
			folders.some((folder) => folder.id === requestedSelectedFolder)
				? requestedSelectedFolder
				: undefined);
		const selectedFolderEntity = selectedFolder
			? folders.find((folder) => folder.id === selectedFolder)
			: undefined;
		const requestedSelectedCategory =
			snapshot.selectedCategory ?? state.selectedCategory;
		const selectedCategory =
			selectedBindEntity?.categoryId ??
			selectedFolderEntity?.categoryId ??
			(requestedSelectedCategory &&
			categories.some((category) => category.id === requestedSelectedCategory)
				? requestedSelectedCategory
				: undefined);

		set({
			categories,
			folders,
			binds,
			tree: buildKnowledgeTree(categories, folders, binds),

			expandedFolders: unique(
				snapshot.expandedFolders ?? state.expandedFolders,
			).filter((id) => expandableIds.has(id)),

			openedTabs,
			pinnedTabs,
			activeTab,

			selectedBind,
			selectedCategory,
			selectedFolder,

			language: snapshot.language ?? state.language,
			search: snapshot.search ?? state.search,
			favorites: unique(snapshot.favorites ?? state.favorites).filter((id) =>
				bindIds.has(id),
			),
			recent: unique(snapshot.recent ?? state.recent)
				.filter((id) => bindIds.has(id))
				.slice(0, MAX_RECENT),
		});
	},

	setCategories: (categories) => get().setKnowledge({ categories }),
	setFolders: (folders) => get().setKnowledge({ folders }),
	setBinds: (binds) => get().setKnowledge({ binds }),

	rebuildTree: () => {
		const { categories, folders, binds } = get();
		set({ tree: buildKnowledgeTree(categories, folders, binds) });
	},

	selectCategory: (selectedCategory) =>
		set({ selectedCategory, selectedFolder: undefined }),

	selectFolder: (selectedFolder) => {
		const folder = get().folders.find((f) => f.id === selectedFolder);

		set({
			selectedFolder,
			selectedCategory: folder?.categoryId,
		});
	},

	selectBind: (selectedBind) => {
		if (!selectedBind) {
			set({ selectedBind: undefined, activeTab: undefined });
			return;
		}

		get().openBind(selectedBind);
	},

	openBind: (id) => {
		const state = get();
		const bind = state.binds.find((b) => b.id === id);
		if (!bind) return;

		const openedTabs = state.openedTabs.includes(id)
			? state.openedTabs
			: [...state.openedTabs, id];

		set({
			openedTabs,
			activeTab: id,
			selectedBind: id,
			selectedCategory: bind.categoryId,
			selectedFolder: bind.folderId,
			recent: [id, ...state.recent.filter((x) => x !== id)].slice(
				0,
				MAX_RECENT,
			),
		});
	},

	closeTab: (id) => {
		const state = get();
		if (state.pinnedTabs.includes(id)) return;

		const openedTabs = state.openedTabs.filter((t) => t !== id);

		const activeTab = state.activeTab === id ? openedTabs[0] : state.activeTab;

		set({
			openedTabs,
			activeTab,
			selectedBind: activeTab,
			pinnedTabs: state.pinnedTabs.filter((tabId) => tabId !== id),
		});
	},

	setActiveTab: (id) => {
		if (!id) {
			set({ activeTab: undefined, selectedBind: undefined });
			return;
		}

		get().openBind(id);
	},

	togglePinnedTab: (id) => {
		const state = get();
		const bind = state.binds.find((item) => item.id === id);

		if (!bind) return;

		const pinnedTabs = state.pinnedTabs.includes(id)
			? state.pinnedTabs.filter((tabId) => tabId !== id)
			: [...state.pinnedTabs, id];
		const openedTabs = state.openedTabs.includes(id)
			? state.openedTabs
			: [...state.openedTabs, id];

		set({
			pinnedTabs,
			openedTabs,
			activeTab: id,
			selectedBind: id,
			selectedCategory: bind.categoryId,
			selectedFolder: bind.folderId,
		});
	},

	toggleFolder: (id) =>
		set((state) => ({
			expandedFolders: state.expandedFolders.includes(id)
				? state.expandedFolders.filter((x) => x !== id)
				: [...state.expandedFolders, id],
		})),

	setLanguage: (language) => set({ language }),
	setSearch: (search) => set({ search }),

	toggleFavorite: (id) => {
		const state = get();

		const favorites = state.favorites.includes(id)
			? state.favorites.filter((x) => x !== id)
			: [...state.favorites, id];

		set({ favorites });
	},

	addRecent: (id) =>
		set((state) => ({
			recent: [id, ...state.recent.filter((x) => x !== id)].slice(
				0,
				MAX_RECENT,
			),
		})),

	getBind: (id) => get().binds.find((b) => b.id === id),
}));
