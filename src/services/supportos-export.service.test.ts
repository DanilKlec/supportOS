import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useKnowledgeStore } from "@/store";

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.fetch,
}));

import { normalizeDatabase } from "./knowledge/knowledge-import-export";
import { supportOSExportService } from "./supportos-export.service";

const initialKnowledge = useKnowledgeStore.getState();
beforeEach(() => vi.resetAllMocks());
afterEach(() => useKnowledgeStore.setState(initialKnowledge));

it("exports the authenticated server snapshot", async () => {
	mock.fetch.mockResolvedValue({
		ok: true,
		json: async () => ({
			app: "SupportOS",
			version: 3,
			knowledge: { categories: [], folders: [], binds: [] },
		}),
	});
	expect(JSON.parse(await supportOSExportService.exportJson())).toMatchObject({
		app: "SupportOS",
		version: 3,
	});
	expect(mock.fetch).toHaveBeenCalledWith("/api/binds?action=backup-export");
});

it("requires a preview token and an explicit merge mode for import", async () => {
	mock.fetch.mockResolvedValue({
		ok: true,
		json: async () => ({ token: "preview", counts: {}, existingIds: {} }),
	});
	const file = JSON.stringify({
		app: "SupportOS",
		version: 3,
		knowledge: { categories: [], folders: [], binds: [] },
	});
	const preview = await supportOSExportService.previewImport(file);
	await supportOSExportService.applyImport(file, preview, "merge");
	expect(JSON.parse(mock.fetch.mock.calls[1][1].body)).toMatchObject({
		action: "backup-apply",
		token: "preview",
		mode: "merge",
	});
});

it("rejects invalid JSON without contacting the server", async () => {
	await expect(supportOSExportService.previewImport("{")).rejects.toThrow(
		"Некорректный JSON",
	);
	expect(mock.fetch).not.toHaveBeenCalled();
});

it("keeps runtime-only state out of the server export and previewed import", async () => {
	const categories = [{ id: "runtime", name: "Локальная вкладка", order: 1 }];
	useKnowledgeStore.setState({ categories, search: "UI filter" });
	const snapshot = {
		app: "SupportOS",
		version: 3,
		knowledge: { categories: [], folders: [], binds: [] },
	};
	mock.fetch.mockResolvedValue({ ok: true, json: async () => snapshot });
	expect(JSON.parse(await supportOSExportService.exportJson())).toEqual(
		snapshot,
	);
	mock.fetch.mockResolvedValue({
		ok: true,
		json: async () => ({ token: "preview", counts: {}, existingIds: {} }),
	});
	const preview = await supportOSExportService.previewImport(
		JSON.stringify(snapshot),
	);
	await supportOSExportService.applyImport(
		JSON.stringify(snapshot),
		preview,
		"upsert",
	);
	expect(useKnowledgeStore.getState().categories).toEqual(categories);
	expect(useKnowledgeStore.getState().search).toBe("UI filter");
	expect(JSON.parse(mock.fetch.mock.calls[2][1].body)).toMatchObject({
		action: "backup-apply",
		token: "preview",
		mode: "upsert",
	});
});

it("normalizes missing server collections without importing bundled knowledge", () => {
	const normalized = normalizeDatabase({});
	expect(normalized).toMatchObject({
		categories: [],
		folders: [],
		binds: [],
		language: "ru",
		search: "",
		expandedFolders: [],
		favorites: [],
		openedTabs: [],
	});
	const shared = { id: "shared", ownerId: null, name: "Общее", order: 1 };
	const personal = {
		id: "personal",
		ownerId: "actor",
		name: "Личное",
		order: 2,
	};
	expect(
		normalizeDatabase({
			categories: [shared, personal],
			selectedCategory: "personal",
			search: "filter",
		}),
	).toMatchObject({
		categories: [shared, personal],
		selectedCategory: "personal",
		search: "filter",
	});
});

it("preserves server export errors and rejects oversized imports before API requests", async () => {
	mock.fetch.mockResolvedValue({
		ok: false,
		json: async () => ({ error: "Нет доступа к копии" }),
	});
	await expect(supportOSExportService.exportJson()).rejects.toThrow(
		"Нет доступа к копии",
	);
	mock.fetch.mockClear();
	await expect(
		supportOSExportService.previewImport(" ".repeat(3_000_001)),
	).rejects.toThrow("Файл превышает лимит импорта");
	expect(mock.fetch).not.toHaveBeenCalled();
});
