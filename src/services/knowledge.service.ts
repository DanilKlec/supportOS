import type { KnowledgeFolder } from "@/entities/knowledge";
import { supabaseService } from "@/services/supabase.service";
import { useKnowledgeStore } from "@/store";

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
