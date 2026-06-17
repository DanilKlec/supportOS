import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import type { KnowledgeDatabase } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";

const QUEUE_KEY = "supportos:cloud-sync-queue:v1";
const CATEGORIES_TABLE = "supportos_categories";
const FOLDERS_TABLE = "supportos_folders";
const BINDS_TABLE = "supportos_binds";

type CloudTable =
	| typeof CATEGORIES_TABLE
	| typeof FOLDERS_TABLE
	| typeof BINDS_TABLE;

interface CloudOperation {
	id: string;
	table: CloudTable;
	type: "upsert" | "delete";
	payload?: Record<string, unknown>;
	createdAt: string;
}

interface CategoryRow {
	id: string;
	owner_id: string | null;
	name: string;
	icon: string | null;
	color: string | null;
	order_index: number;
	created_at?: string;
	updated_at?: string;
}

interface FolderRow {
	id: string;
	owner_id: string | null;
	category_id: string;
	parent_id: string | null;
	name: string;
	icon: string | null;
	color: string | null;
	order_index: number;
	created_at?: string;
	updated_at?: string;
}

interface BindRow {
	id: string;
	owner_id: string | null;
	source_bind_id: string | null;
	source_hash: string | null;
	import_batch_id: string | null;
	imported: boolean | null;
	slug: string;
	category_id: string;
	folder_id: string | null;
	icon: string | null;
	color: string | null;
	tags: string[] | null;
	translations: Bind["translations"] | null;
	ai_generated: boolean | null;
	ai_translated: boolean | null;
	ai_summary: string | null;
	favorite: boolean | null;
	archived: boolean | null;
	created_at: string;
	updated_at: string;
}

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function now() {
	return new Date().toISOString();
}

function currentOwnerId(entityOwnerId?: string | null) {
	if (entityOwnerId !== undefined) return entityOwnerId;

	const session = supabaseService.getSession();

	if (!session || session.user.role === "admin") return null;

	return session.user.id;
}

function toCategoryRow(category: KnowledgeCategory): CategoryRow {
	return {
		id: category.id,
		owner_id: currentOwnerId(category.ownerId),
		name: category.name,
		icon: category.icon ?? null,
		color: category.color ?? null,
		order_index: category.order,
	};
}

function toFolderRow(folder: KnowledgeFolder): FolderRow {
	return {
		id: folder.id,
		owner_id: currentOwnerId(folder.ownerId),
		category_id: folder.categoryId,
		parent_id: folder.parentId ?? null,
		name: folder.name,
		icon: folder.icon ?? null,
		color: folder.color ?? null,
		order_index: folder.order,
	};
}

function toBindRow(bind: Bind): BindRow {
	return {
		id: bind.id,
		owner_id: currentOwnerId(bind.ownerId),
		source_bind_id: bind.sourceBindId ?? null,
		source_hash: bind.sourceHash ?? null,
		import_batch_id: bind.importBatchId ?? null,
		imported: Boolean(bind.imported),
		slug: bind.slug,
		category_id: bind.categoryId,
		folder_id: bind.folderId ?? null,
		icon: bind.icon ?? null,
		color: bind.color ?? null,
		tags: bind.tags,
		translations: bind.translations,
		ai_generated: bind.aiGenerated ?? null,
		ai_translated: bind.aiTranslated ?? null,
		ai_summary: bind.aiSummary ?? null,
		favorite: bind.favorite,
		archived: bind.archived,
		created_at: bind.createdAt,
		updated_at: bind.updatedAt,
	};
}

function fromCategoryRow(row: CategoryRow): KnowledgeCategory {
	return {
		id: row.id,
		ownerId: row.owner_id,
		name: row.name,
		icon: row.icon ?? undefined,
		color: row.color ?? undefined,
		order: row.order_index,
	};
}

function fromFolderRow(row: FolderRow): KnowledgeFolder {
	return {
		id: row.id,
		ownerId: row.owner_id,
		categoryId: row.category_id,
		parentId: row.parent_id ?? undefined,
		name: row.name,
		icon: row.icon ?? undefined,
		color: row.color ?? undefined,
		order: row.order_index,
	};
}

function fromBindRow(row: BindRow): Bind {
	return {
		id: row.id,
		ownerId: row.owner_id,
		sourceBindId: row.source_bind_id ?? undefined,
		sourceHash: row.source_hash ?? undefined,
		importBatchId: row.import_batch_id ?? undefined,
		imported: Boolean(row.imported),
		slug: row.slug,
		categoryId: row.category_id,
		folderId: row.folder_id ?? undefined,
		icon: row.icon ?? undefined,
		color: row.color ?? undefined,
		tags: Array.isArray(row.tags) ? row.tags : [],
		translations: Array.isArray(row.translations) ? row.translations : [],
		aiGenerated: row.ai_generated ?? undefined,
		aiTranslated: row.ai_translated ?? undefined,
		aiSummary: row.ai_summary ?? undefined,
		favorite: Boolean(row.favorite),
		archived: Boolean(row.archived),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mergeBinds(rows: BindRow[]) {
	const binds = rows.map(fromBindRow);
	const hiddenGlobalIds = new Set(
		binds
			.filter((bind) => bind.ownerId && bind.sourceBindId)
			.map((bind) => bind.sourceBindId as string),
	);

	return binds.filter((bind) => bind.ownerId || !hiddenGlobalIds.has(bind.id));
}

function readQueue() {
	if (!isBrowser()) return [];

	try {
		const raw = localStorage.getItem(QUEUE_KEY);

		return raw ? (JSON.parse(raw) as CloudOperation[]) : [];
	} catch {
		return [];
	}
}

function writeQueue(queue: CloudOperation[]) {
	if (!isBrowser()) return;

	localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

class CloudKnowledgeService {
	canUseCloud() {
		return (
			supabaseService.isConfigured() && Boolean(supabaseService.getSession())
		);
	}

	async loadKnowledge(): Promise<Partial<KnowledgeDatabase> | undefined> {
		if (!this.canUseCloud()) return undefined;

		await this.flushQueue();

		const [categoryRows, folderRows, bindRows] = await Promise.all([
			supabaseService.select<CategoryRow>(CATEGORIES_TABLE, {
				order: "order_index.asc",
			}),
			supabaseService.select<FolderRow>(FOLDERS_TABLE, {
				order: "order_index.asc",
			}),
			supabaseService.select<BindRow>(BINDS_TABLE, {
				order: "updated_at.desc",
			}),
		]);

		return {
			categories: categoryRows.map(fromCategoryRow),
			folders: folderRows.map(fromFolderRow),
			binds: mergeBinds(bindRows),
		};
	}

	saveCategory(category: KnowledgeCategory) {
		void this.runOrQueue({
			id: `category-${category.id}-${Date.now()}`,
			table: CATEGORIES_TABLE,
			type: "upsert",
			payload: toCategoryRow(category) as unknown as Record<string, unknown>,
			createdAt: now(),
		});
	}

	saveFolder(folder: KnowledgeFolder) {
		void this.runOrQueue({
			id: `folder-${folder.id}-${Date.now()}`,
			table: FOLDERS_TABLE,
			type: "upsert",
			payload: toFolderRow(folder) as unknown as Record<string, unknown>,
			createdAt: now(),
		});
	}

	saveBind(bind: Bind) {
		void this.runOrQueue({
			id: `bind-${bind.id}-${Date.now()}`,
			table: BINDS_TABLE,
			type: "upsert",
			payload: toBindRow(bind) as unknown as Record<string, unknown>,
			createdAt: now(),
		});
	}

	saveMany({
		categories,
		folders,
		binds,
	}: {
		categories?: KnowledgeCategory[];
		folders?: KnowledgeFolder[];
		binds?: Bind[];
	}) {
		if (categories?.length) {
			void this.runOrQueue({
				id: `categories-${Date.now()}`,
				table: CATEGORIES_TABLE,
				type: "upsert",
				payload: {
					rows: categories.map(toCategoryRow),
				},
				createdAt: now(),
			});
		}

		if (folders?.length) {
			void this.runOrQueue({
				id: `folders-${Date.now()}`,
				table: FOLDERS_TABLE,
				type: "upsert",
				payload: {
					rows: folders.map(toFolderRow),
				},
				createdAt: now(),
			});
		}

		if (binds?.length) {
			void this.runOrQueue({
				id: `binds-${Date.now()}`,
				table: BINDS_TABLE,
				type: "upsert",
				payload: {
					rows: binds.map(toBindRow),
				},
				createdAt: now(),
			});
		}
	}

	deleteCategory(id: string) {
		void this.runOrQueue({
			id: `category-delete-${id}-${Date.now()}`,
			table: CATEGORIES_TABLE,
			type: "delete",
			payload: { id },
			createdAt: now(),
		});
	}

	deleteFolder(id: string) {
		void this.runOrQueue({
			id: `folder-delete-${id}-${Date.now()}`,
			table: FOLDERS_TABLE,
			type: "delete",
			payload: { id },
			createdAt: now(),
		});
	}

	deleteBind(id: string) {
		void this.runOrQueue({
			id: `bind-delete-${id}-${Date.now()}`,
			table: BINDS_TABLE,
			type: "delete",
			payload: { id },
			createdAt: now(),
		});
	}

	async flushQueue() {
		if (!this.canUseCloud()) return;

		const queue = readQueue();
		const remaining: CloudOperation[] = [];

		for (const operation of queue) {
			try {
				await this.execute(operation);
			} catch {
				remaining.push(operation);
			}
		}

		writeQueue(remaining);
	}

	private async runOrQueue(operation: CloudOperation) {
		if (!this.canUseCloud()) return;

		try {
			await this.execute(operation);
		} catch {
			writeQueue([...readQueue(), operation]);
		}
	}

	private async execute(operation: CloudOperation) {
		if (operation.type === "delete") {
			const id = operation.payload?.id;

			if (typeof id === "string") {
				await supabaseService.delete(operation.table, id);
			}

			return;
		}

		const rows = Array.isArray(operation.payload?.rows)
			? (operation.payload.rows as Record<string, unknown>[])
			: operation.payload
				? [operation.payload]
				: [];

		await supabaseService.upsert(operation.table, rows);
	}
}

export const cloudKnowledgeService = new CloudKnowledgeService();
