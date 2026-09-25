import type { Bind, BindTranslation } from "@/entities/bind";
import { can } from "../../shared/access.js";
import { authenticatedFetch } from "./authenticated-fetch";
import { supabaseService } from "./supabase.service";

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

export interface BindBranches {
	choices: Record<string, string>;
	incoming: { id: string; sourceId: string; sender: string; bind: Bind }[];
	outgoing: {
		id: string;
		sourceId: string;
		recipient: string;
		email: string;
	}[];
}
export interface BindProposal {
	id: string;
	source_id: string;
	author_id: string;
	author: string;
	translations: BindTranslation[];
	tags: string[];
	created_at: string;
	status: string;
}
export interface BindRevision {
	id: number;
	owner_id: string | null;
	created_at: string;
	operation: string;
	snapshot: Bind;
}
export const SHARED_CATEGORY = "supportos-shared";

async function api(path: string, body?: unknown) {
	const response = await authenticatedFetch(
		`/api/binds${path}`,
		body
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			: undefined,
	);
	const data = await response.json();
	if (!response.ok)
		throw Object.assign(new Error(data.error ?? "Ошибка сохранения биндов"), {
			status: response.status,
		});
	return data;
}
export interface ProposalResult {
	id: string;
	sourceId: string;
	status: "accepted" | "rejected";
	resolvedAt: string;
	title: string;
}
export const sharedBindsService = {
	async proposalResults(): Promise<ProposalResult[]> {
		return api("?action=proposal-results");
	},
	async branches(): Promise<BindBranches> {
		const data = await api("?action=branches");
		return {
			...data,
			incoming: data.incoming.map((entry: any) => ({
				...entry,
				bind: fromBindRow(entry.row),
			})),
		};
	},
	async branchAction(action: string, payload: Record<string, unknown>) {
		return api("", { ...payload, action });
	},
	async history(sourceId: string): Promise<BindRevision[]> {
		const data = await api(
			`?action=history&source_id=${encodeURIComponent(sourceId)}`,
		);
		return data.map((entry: any) => ({
			...entry,
			snapshot: fromBindRow(entry.snapshot),
		}));
	},
	async proposals(sourceId?: string): Promise<BindProposal[]> {
		return api(
			`?action=proposals${sourceId ? `&source_id=${encodeURIComponent(sourceId)}` : ""}`,
		);
	},
	async users(search: string): Promise<{
		total: number;
		users: { id: string; email: string; display_name: string }[];
	}> {
		return api(`?action=users&search=${encodeURIComponent(search)}`);
	},
	async personal(userId: string): Promise<Bind[]> {
		const data = await api(`?user_id=${encodeURIComponent(userId)}`);
		return data.rows.map(fromBindRow);
	},
	async savePersonal(input: {
		source: Bind;
		original?: Bind;
		userId: string;
		translations: BindTranslation[];
		tags: string[];
	}): Promise<Bind> {
		const translations = input.translations
			.filter((t) => t.title.trim() || t.content.trim())
			.map((t) => ({
				...t,
				title: t.title.trim(),
				content: t.content.trim(),
				updatedAt: new Date().toISOString(),
			}));
		const row = await api("", {
			action: "save",
			userId: input.userId,
			sourceId: input.source.id,
			expected: input.original?.updatedAt ?? null,
			translations,
			tags: input.tags.map((t) => t.trim()).filter(Boolean),
		});
		return fromBindRow(row);
	},
	async resetPersonal(source: Bind, original: Bind, userId: string) {
		await api("", {
			action: "reset",
			userId,
			sourceId: source.id,
			expected: original.updatedAt,
		});
	},
	async list(): Promise<Bind[]> {
		if (!can(supabaseService.getSession()?.user.access, "binds.read"))
			throw new Error("Нет доступа к общей базе");
		const account = supabaseService.getSession()?.user.id;
		const result: Bind[] = [];
		// Explicit API paging avoids truncating the shared library at the DB row limit.
		for (let offset = 0; ; offset += 500) {
			const data = (await api(`?action=shared&limit=500&offset=${offset}`)) as {
				rows: BindRow[];
			};
			const rows = data.rows;
			if (account !== supabaseService.getSession()?.user.id)
				throw new Error("Аккаунт изменился");
			result.push(...rows.map(fromBindRow));
			if (rows.length < 500) return result;
		}
	},
	async save(input: {
		original?: Bind;
		translations: BindTranslation[];
		tags: string[];
	}): Promise<Bind> {
		if (!can(supabaseService.getSession()?.user.access, "knowledge.write"))
			throw new Error("Нет права редактировать общие бинды");
		if (input.original?.ownerId)
			throw new Error("Личный бинд нельзя изменить через общую базу");
		const timestamp = new Date().toISOString();
		const translations = input.translations
			.filter((t) => t.title.trim() || t.content.trim())
			.map((t) => ({
				...t,
				title: t.title.trim(),
				content: t.content.trim(),
				updatedAt: timestamp,
			}));
		if (
			!translations.length ||
			translations.some((t) => !t.title || !t.content)
		)
			throw new Error("Заполните название и текст каждого перевода");
		if (
			new Set(translations.map((t) => t.language)).size !== translations.length
		)
			throw new Error("Языки переводов не должны повторяться");
		const original = input.original;
		const saved = (await api("", {
			action: "shared-save",
			id: original?.id,
			expected: original?.updatedAt,
			translations,
			tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
		})) as BindRow | null;
		if (!saved)
			throw new Error(
				"Сервер не подтвердил сохранение. Обновите список перед повторной попыткой.",
			);
		return fromBindRow(saved);
	},
};
