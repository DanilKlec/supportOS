// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bind } from "@/entities/bind";
import { useKnowledgeStore } from "@/store";

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
	session: {
		user: {
			id: "11111111-1111-4111-8111-111111111111",
			access: { status: "active", permissions: ["binds.read"] },
		},
	} as
		| {
				user: { id: string; access: { status: string; permissions: string[] } };
		  }
		| undefined,
}));

vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mocks.fetch,
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { getSession: () => mocks.session },
}));

import { knowledgeService } from "./knowledge.service";

const initialKnowledge = useKnowledgeStore.getState();
const accountId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
	mocks.fetch.mockReset();
	mocks.session = {
		user: {
			id: accountId,
			access: { status: "active", permissions: ["binds.read"] },
		},
	};
	useKnowledgeStore.setState({
		...initialKnowledge,
		categories: [],
		folders: [],
		binds: [],
		tree: [],
		expandedFolders: [],
		favorites: [],
		recent: [],
		favoriteFolders: [],
		recentFolders: [],
		openedTabs: [],
		pinnedTabs: [],
		selectedCategory: undefined,
		selectedFolder: undefined,
		selectedBind: undefined,
		activeTab: undefined,
	});
});

afterEach(() => {
	useKnowledgeStore.setState(initialKnowledge);
	vi.restoreAllMocks();
});

it("hydrates Zustand only from the authenticated server snapshot", async () => {
	mocks.fetch.mockResolvedValue(
		new Response(
			JSON.stringify({
				categories: [
					{ id: "database", name: "Из базы", ownerId: null, order: 1 },
				],
				folders: [],
				binds: [],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		),
	);

	const database = await knowledgeService.loadKnowledge();

	expect(mocks.fetch).toHaveBeenCalledWith(
		"/api/binds?action=knowledge",
		undefined,
	);
	expect(database.categories.map((category) => category.id)).toEqual([
		"database",
	]);
	expect(useKnowledgeStore.getState().categories).toEqual(database.categories);
});

function bind(id: string, patch: Partial<Bind> = {}): Bind {
	return {
		id,
		slug: id,
		categoryId: "category",
		folderId: "folder",
		ownerId: accountId,
		tags: ["support"],
		translations: [
			{
				language: "ru",
				title: "Ответ",
				content: "Текст",
				agentInstructions: "Внутренние шаги",
				updatedAt: "2026-10-01T12:00:00Z",
			},
		],
		history: [],
		favorite: false,
		archived: false,
		createdAt: "2026-10-01T12:00:00Z",
		updatedAt: "2026-10-01T12:00:00Z",
		...patch,
	};
}

it("rejects signed-out loading before contacting the server", async () => {
	mocks.session = undefined;
	await expect(knowledgeService.loadKnowledge()).rejects.toThrow(
		"Войдите с личным аккаунтом",
	);
	expect(mocks.fetch).not.toHaveBeenCalled();
});

it("does not hydrate another account's response after a session switch", async () => {
	let finish!: (response: Response) => void;
	mocks.fetch.mockImplementation(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	const request = knowledgeService.loadKnowledge();
	mocks.session!.user.id = "22222222-2222-4222-8222-222222222222";
	finish(
		new Response(
			JSON.stringify({
				categories: [{ id: "private", name: "Чужая категория", order: 1 }],
				folders: [],
				binds: [],
			}),
		),
	);
	await expect(request).rejects.toThrow("Аккаунт изменился");
	expect(useKnowledgeStore.getState().categories).toEqual([]);
});

it("preserves runtime state when the server refuses loading instead of using legacy storage", async () => {
	const existing = bind("existing");
	useKnowledgeStore.setState({ binds: [existing] });
	const storage = vi.spyOn(Storage.prototype, "getItem");
	mocks.fetch.mockResolvedValue(
		new Response(JSON.stringify({ error: "Доступ отозван" }), { status: 403 }),
	);
	await expect(knowledgeService.loadKnowledge()).rejects.toMatchObject({
		status: 403,
		message: "Доступ отозван",
	});
	expect(useKnowledgeStore.getState().binds).toEqual([existing]);
	expect(storage).not.toHaveBeenCalled();
});

it("keeps saveKnowledge as runtime-only state without a storage or server write", () => {
	const storage = vi.spyOn(Storage.prototype, "setItem");
	const categories = [{ id: "runtime", name: "Runtime", order: 1 }];
	const snapshot = knowledgeService.saveKnowledge({
		categories,
		search: "filter",
	});
	expect(snapshot.categories).toEqual(categories);
	expect(snapshot.search).toBe("filter");
	expect(mocks.fetch).not.toHaveBeenCalled();
	expect(storage).not.toHaveBeenCalled();
});

it("keeps personal overrides, lineage and history when shared content is edited", async () => {
	mocks.fetch.mockImplementation(async () => new Response("{}"));
	const original = bind("shared", {
		ownerId: null,
		sourceHash: "source-hash",
		importBatchId: "batch",
		imported: true,
	});
	useKnowledgeStore.setState({
		categories: [{ id: "category", name: "Работа", order: 1 }],
		binds: [original],
	});
	const updated = knowledgeService.updateBind(original.id, {
		title: "Личный ответ",
	});
	expect(updated.id).not.toBe(original.id);
	expect(updated).toMatchObject({
		ownerId: accountId,
		sourceBindId: original.id,
		sourceHash: "source-hash",
		importBatchId: "batch",
		imported: true,
	});
	expect(updated.translations[0]).toMatchObject({
		title: "Личный ответ",
		agentInstructions: "Внутренние шаги",
	});
	expect(updated.history?.[0].translations).toEqual(original.translations);
	expect(updated.history?.[0].translations).not.toBe(original.translations);
	expect(original.translations[0].title).toBe("Ответ");
	expect(useKnowledgeStore.getState().selectedBind).toBe(updated.id);
	await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
	expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
		action: "knowledge-save",
		binds: [{ id: updated.id, ownerId: accountId, sourceBindId: "shared" }],
	});
});

it("keeps history restoration and duplicate translations independent of their source", async () => {
	mocks.fetch.mockImplementation(async () => new Response("{}"));
	const entry = {
		id: "history",
		createdAt: "2026-09-01T12:00:00Z",
		slug: "old",
		tags: ["old"],
		translations: [
			{
				language: "ru",
				title: "Старая версия",
				content: "Старый текст",
				updatedAt: "2026-09-01T12:00:00Z",
			},
		],
	};
	const original = bind("first", { history: [entry] });
	useKnowledgeStore.setState({
		categories: [{ id: "category", name: "Работа", order: 1 }],
		binds: [original],
	});
	const restored = knowledgeService.restoreBindHistory("first", "history");
	expect(restored.translations).toEqual(entry.translations);
	expect(restored.translations).not.toBe(entry.translations);
	expect(restored.history?.[0].translations).toEqual(original.translations);
	const duplicate = knowledgeService.duplicateBind("first");
	expect(duplicate.translations).toEqual([
		{ ...restored.translations[0], updatedAt: expect.any(String) },
	]);
	expect(duplicate.translations).not.toBe(restored.translations);
	expect(duplicate.slug).toBe("old-copy");
	await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
});
