import type { KnowledgeFolder } from "@/entities/knowledge";
import { supabaseService } from "@/services/supabase.service";
import { useKnowledgeStore } from "@/store";
import { publishBindTransfer } from "./knowledge/bind-transfers";

import { databaseKnowledgeService } from "./knowledge/knowledge-api";
import {
	getKnowledgeSnapshot,
	type KnowledgeDatabase,
	normalizeDatabase,
} from "./knowledge/knowledge-import-export";
import { KnowledgeMutations } from "./knowledge/knowledge-mutations";
import {
	collectFolderIds,
	revealLocation,
	search,
} from "./knowledge/knowledge-tree";

export type { KnowledgeDatabase } from "./knowledge/knowledge-import-export";
export type {
	CreateBindInput,
	CreateCategoryInput,
	CreateFolderInput,
	RestoreDeletedItemsInput,
	UpdateBindInput,
} from "./knowledge/knowledge-mutations";

// Compatibility facade: existing callers keep the same runtime state and methods.
class KnowledgeService extends KnowledgeMutations {
	async transferBinds(
		ids: string[],
		destination: { categoryId: string; folderId?: string },
		beforeId?: string,
	) {
		const actor = supabaseService.getSession()?.user.id;
		if (!actor) throw new Error("Войдите с личным аккаунтом");
		const store = useKnowledgeStore.getState();
		const unique = [...new Set(ids)];
		if (!unique.length || unique.length > 100)
			throw new Error("Выберите от 1 до 100 биндов");
		const sources = unique.map((id) => {
			const local = store.binds.find((b) => b.id === id);
			// Common locations can change through polling without hydrating local edits.
			const bind =
				local?.ownerId === null || !local
					? (store.remoteBinds.find((b) => b.id === id && b.ownerId === null) ??
						local)
					: local;
			if (!bind || bind.archived)
				throw new Error("Бинд больше недоступен. Обновите дерево");
			return { id, categoryId: bind.categoryId, folderId: bind.folderId };
		});
		const result = await databaseKnowledgeService.transferBinds({
			sources,
			...destination,
			beforeId,
		});
		if (supabaseService.getSession()?.user.id !== actor)
			throw new Error("Аккаунт изменился");
		const state = useKnowledgeStore.getState();
		const saved = new Map(result.binds.map((b) => [b.id, b]));
		const remap = (id: string) => result.replacements[id] ?? id;
		state.setKnowledge({
			binds: [
				...state.binds.filter(
					(b) => !saved.has(b.id) && !result.replacements[b.id],
				),
				...result.binds,
			],
			openedTabs: state.openedTabs.map(remap),
			pinnedTabs: state.pinnedTabs.map(remap),
			favorites: state.favorites.map(remap),
			recent: state.recent.map(remap),
			activeTab: state.activeTab ? remap(state.activeTab) : undefined,
			selectedBind: state.selectedBind ? remap(state.selectedBind) : undefined,
		});
		this.revealLocation(destination.categoryId, destination.folderId);
		await publishBindTransfer(actor, result);
		return result;
	}
	async loadKnowledge(): Promise<KnowledgeDatabase> {
		const accountId = supabaseService.getSession()?.user.id;

		if (!accountId) throw new Error("Войдите с личным аккаунтом");
		const loaded = await databaseKnowledgeService.loadKnowledge();
		if (supabaseService.getSession()?.user.id !== accountId)
			throw new Error("Аккаунт изменился");
		const database = normalizeDatabase(loaded ?? {});

		useKnowledgeStore.getState().setKnowledge(database);

		return database;
	}

	async loadCloudKnowledge() {
		return this.loadKnowledge();
	}

	saveKnowledge(database?: Partial<KnowledgeDatabase>) {
		if (database) {
			useKnowledgeStore.getState().setKnowledge(database);
		}

		return this.getSnapshot();
	}

	search(query: string) {
		return search(query);
	}

	revealLocation(categoryId: string, folderId?: string) {
		return revealLocation(categoryId, folderId);
	}

	collectFolderIds(
		id: string,
		folders: KnowledgeFolder[],
		result = new Set<string>(),
	) {
		return collectFolderIds(id, folders, result);
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
		return getKnowledgeSnapshot();
	}
}

export const knowledgeService = new KnowledgeService();
