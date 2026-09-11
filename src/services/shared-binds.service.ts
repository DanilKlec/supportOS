import { authenticatedFetch } from "./authenticated-fetch";
import type { Bind, BindTranslation } from "@/entities/bind";
import { can } from "../../shared/access.js";
import { supabaseService } from "./supabase.service";
import {
	fromBindRow,
	toBindRow,
	type BindRow,
} from "./cloud-knowledge.service";

const TABLE = "supportos_binds";
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
	if (!response.ok) throw new Error(data.error ?? "Ошибка сохранения биндов");
	return data;
}
export const sharedBindsService = {
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
		// Explicit paging avoids truncating the shared library at the API row limit.
		for (let offset = 0; ; offset += 500) {
			const rows = await supabaseService.select<BindRow>(TABLE, {
				owner_id: "is.null",
				order: "id.asc",
				limit: 500,
				offset,
			});
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
		const bind: Bind = {
			...(original ?? {}),
			id: original?.id ?? `shared-${crypto.randomUUID()}`,
			ownerId: null,
			slug: original?.slug ?? `shared-${crypto.randomUUID()}`,
			categoryId: original?.categoryId ?? SHARED_CATEGORY,
			translations,
			tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
			favorite: original?.favorite ?? false,
			archived: original?.archived ?? false,
			createdAt: original?.createdAt ?? timestamp,
			updatedAt: timestamp,
		};
		const row = toBindRow(bind);
		let saved: BindRow[];
		if (original) {
			// Timestamp compare makes the update atomic without elevating browser privileges.
			saved = await supabaseService.updateWhere<BindRow>(
				TABLE,
				{
					id: `eq.${original.id}`,
					owner_id: "is.null",
					updated_at: `eq.${original.updatedAt}`,
				},
				{
					translations: row.translations,
					tags: row.tags,
					updated_at: timestamp,
				},
			);
			if (!saved.length)
				throw new Error(
					"Бинд уже изменён другим сотрудником или доступ отозван. Скопируйте свой текст, закройте редактор и обновите список.",
				);
		} else {
			saved = await supabaseService.insert<BindRow>(
				TABLE,
				row as unknown as Record<string, unknown>,
			);
		}
		if (!saved[0])
			throw new Error(
				"Сервер не подтвердил сохранение. Обновите список перед повторной попыткой.",
			);
		return fromBindRow(saved[0]);
	},
};
