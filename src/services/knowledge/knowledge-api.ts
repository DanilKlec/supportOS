import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { supabaseService } from "@/services/supabase.service";

import type { KnowledgeDatabase } from "./knowledge-import-export";
import type { BindTransferPayload, BindTransferResult } from "./bind-transfers";

// Server transport only; loading a query must not hydrate the runtime store.
async function knowledgeApi<T = Partial<KnowledgeDatabase>>(
	body?: Record<string, unknown>,
): Promise<T> {
	const response = await authenticatedFetch(
		body ? "/api/binds" : "/api/binds?action=knowledge",
		body
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			: undefined,
	);
	const result = await response.json();

	if (!response.ok) {
		throw Object.assign(
			new Error(result.error ?? "Не удалось синхронизировать базу знаний"),
			{ status: response.status },
		);
	}

	return result;
}

let databaseMutationQueue = Promise.resolve();

function enqueueKnowledgeMutation(body: Record<string, unknown>) {
	const accountId = supabaseService.getSession()?.user.id;

	if (!accountId) return;

	databaseMutationQueue = databaseMutationQueue
		.then(async () => {
			if (supabaseService.getSession()?.user.id !== accountId) return;
			await knowledgeApi(body);
		})
		.catch(() => undefined);
}

// In-memory request sequencing, not a persistent/local fallback write queue.
export const databaseKnowledgeService = {
	transferBinds(payload: BindTransferPayload): Promise<BindTransferResult> {
		const accountId = supabaseService.getSession()?.user.id;
		const request = databaseMutationQueue.then(async () => {
			if (!accountId || supabaseService.getSession()?.user.id !== accountId)
				throw new Error("Аккаунт изменился. Повторите перенос");
			const result = await knowledgeApi<BindTransferResult>({
				action: "knowledge-transfer",
				payload,
			});
			if (
				!Array.isArray(result.binds) ||
				!result.binds.length ||
				!result.replacements ||
				typeof result.replacements !== "object"
			)
				throw new Error("Сервер не подтвердил перенос биндов");
			return result;
		});
		databaseMutationQueue = request.then(
			() => undefined,
			() => undefined,
		);
		return request;
	},
	loadKnowledge: () => knowledgeApi(),
	saveCategory: (category: KnowledgeCategory) =>
		enqueueKnowledgeMutation({
			action: "knowledge-save",
			categories: [category],
		}),
	saveFolder: (folder: KnowledgeFolder) =>
		enqueueKnowledgeMutation({ action: "knowledge-save", folders: [folder] }),
	saveBind: (bind: Bind) =>
		enqueueKnowledgeMutation({ action: "knowledge-save", binds: [bind] }),
	saveMany: ({
		categories,
		folders,
		binds,
	}: {
		categories?: KnowledgeCategory[];
		folders?: KnowledgeFolder[];
		binds?: Bind[];
	}) =>
		enqueueKnowledgeMutation({
			action: "knowledge-save",
			...(categories?.length ? { categories } : {}),
			...(folders?.length ? { folders } : {}),
			...(binds?.length ? { binds } : {}),
		}),
	deleteCategory: (id: string) =>
		enqueueKnowledgeMutation({
			action: "knowledge-delete",
			entity: "category",
			id,
		}),
	deleteFolder: (id: string) =>
		enqueueKnowledgeMutation({
			action: "knowledge-delete",
			entity: "folder",
			id,
		}),
	deleteBind: (id: string) =>
		enqueueKnowledgeMutation({
			action: "knowledge-delete",
			entity: "bind",
			id,
		}),
};

export async function backupRequest(body: Record<string, unknown>) {
	const response = await authenticatedFetch("/api/binds", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const result = await response.json();
	if (!response.ok)
		throw new Error(result.error ?? "Не удалось обработать копию");
	return result;
}

export async function exportKnowledgeJson(): Promise<string> {
	const response = await authenticatedFetch("/api/binds?action=backup-export");
	const snapshot = await response.json();
	if (!response.ok)
		throw new Error(snapshot.error ?? "Не удалось создать копию");
	return JSON.stringify(snapshot, null, 2);
}
