import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { authenticatedFetch } from "./authenticated-fetch";
export type LibraryCategory = KnowledgeCategory & { updatedAt: string };
export type LibraryFolder = KnowledgeFolder & { updatedAt: string };
export type LibraryStructure = {
	categories: LibraryCategory[];
	folders: LibraryFolder[];
};
export type StructureChange = {
	entity: "category" | "folder";
	operation: "save" | "delete" | "up" | "down";
	payload: {
		id?: string;
		expected?: string;
		name?: string;
		categoryId?: string;
		parentId?: string;
		color?: string;
	};
};
async function request<T>(
	body?: StructureChange,
	signal?: AbortSignal,
): Promise<T> {
	const response = await authenticatedFetch(
		"/api/binds?action=shared-structure",
		body
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "shared-structure", ...body }),
					signal,
				}
			: { signal },
	);
	const data = await response.json();
	if (!response.ok)
		throw Object.assign(
			new Error(data.error ?? "Не удалось загрузить структуру"),
			{ status: response.status },
		);
	return data;
}
export const sharedLibraryService = {
	load: async (signal?: AbortSignal) => {
		const data = await request<LibraryStructure>(undefined, signal);
		if (
			!data ||
			!Array.isArray(data.categories) ||
			!Array.isArray(data.folders)
		)
			throw new Error("Сервер не подтвердил загрузку структуры");
		return data;
	},
	change: (body: StructureChange) =>
		request<{ ok: boolean; row: { id: string } | null }>(body),
};
