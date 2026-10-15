// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useKnowledgeStore } from "@/store";

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
	session: { user: { id: "actor" } } as { user: { id: string } } | undefined,
}));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mocks.fetch,
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { getSession: () => mocks.session },
}));

import { databaseKnowledgeService } from "./knowledge-api";

const initialKnowledge = useKnowledgeStore.getState();
beforeEach(() => {
	vi.resetAllMocks();
	mocks.session = { user: { id: "actor" } };
	mocks.fetch.mockImplementation(async () => new Response("{}"));
});
afterEach(() => {
	useKnowledgeStore.setState(initialKnowledge);
	vi.restoreAllMocks();
});

it("returns server query data without reading or hydrating the Zustand runtime cache", async () => {
	const runtime = [{ id: "runtime", name: "Вкладка пользователя", order: 1 }];
	useKnowledgeStore.setState({ categories: runtime });
	const server = {
		categories: [{ id: "server", name: "Сервер", order: 1 }],
		folders: [],
		binds: [],
	};
	mocks.fetch.mockResolvedValue(new Response(JSON.stringify(server)));
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	try {
		const queryKey = ["knowledge", "actor"];
		expect(
			await client.fetchQuery({
				queryKey,
				queryFn: databaseKnowledgeService.loadKnowledge,
			}),
		).toEqual(server);
		expect(client.getQueryData(queryKey)).toEqual(server);
		expect(useKnowledgeStore.getState().categories).toEqual(runtime);
		expect(mocks.fetch).toHaveBeenCalledWith(
			"/api/binds?action=knowledge",
			undefined,
		);
	} finally {
		client.clear();
	}
});

it.each([
	401, 403, 409, 500,
])("preserves API errors and status %s for query callers", async (status) => {
	mocks.fetch.mockResolvedValue(
		new Response(JSON.stringify({ error: "Ошибка сервера" }), { status }),
	);
	await expect(databaseKnowledgeService.loadKnowledge()).rejects.toMatchObject({
		message: "Ошибка сервера",
		status,
	});
});

it("sequences mutations through authenticated API with unchanged payloads", async () => {
	let finish!: (response: Response) => void;
	mocks.fetch.mockImplementationOnce(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	const category = {
		id: "category",
		name: "Работа",
		ownerId: "actor",
		order: 1,
	};
	databaseKnowledgeService.saveMany({
		categories: [category],
		folders: [],
		binds: [],
	});
	databaseKnowledgeService.deleteBind("bind");
	await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
	expect(mocks.fetch.mock.calls[0]).toEqual([
		"/api/binds",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "knowledge-save",
				categories: [category],
			}),
		},
	]);
	finish(new Response("{}"));
	await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
	expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
		action: "knowledge-delete",
		entity: "bind",
		id: "bind",
	});
});

it("skips queued writes if the actor changes before dispatch and never persists a fallback", async () => {
	const storage = vi.spyOn(Storage.prototype, "setItem");
	databaseKnowledgeService.saveCategory({
		id: "category",
		name: "Работа",
		order: 1,
	});
	mocks.session = { user: { id: "another-actor" } };
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mocks.fetch).not.toHaveBeenCalled();
	expect(storage).not.toHaveBeenCalled();
});

it("does not dispatch a mutation without a session", async () => {
	mocks.session = undefined;
	databaseKnowledgeService.deleteFolder("folder");
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(mocks.fetch).not.toHaveBeenCalled();
});

const transferPayload = {
	sources: [{ id: "bind", categoryId: "old" }],
	categoryId: "new",
};
it("waits for previous writes and returns only the confirmed transfer", async () => {
	let finish!: (response: Response) => void;
	mocks.fetch.mockImplementationOnce(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	databaseKnowledgeService.saveCategory({ id: "new", name: "New", order: 1 });
	const result = {
		binds: [{ id: "bind", categoryId: "new", order: 1 }],
		replacements: {},
	};
	mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(result)));
	const request = databaseKnowledgeService.transferBinds(transferPayload);
	await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
	finish(new Response("{}"));
	await expect(request).resolves.toEqual(result);
	expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({
		action: "knowledge-transfer",
		payload: transferPayload,
	});
});
it.each([
	403, 409, 500,
])("propagates transfer failure %s and allows the next transfer", async (status) => {
	mocks.fetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ error: "Не удалось перенести" }), { status }),
	);
	await expect(
		databaseKnowledgeService.transferBinds(transferPayload),
	).rejects.toMatchObject({ message: "Не удалось перенести", status });
	const result = {
		binds: [{ id: "bind", categoryId: "new", order: 1 }],
		replacements: {},
	};
	mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify(result)));
	await expect(
		databaseKnowledgeService.transferBinds(transferPayload),
	).resolves.toEqual(result);
});
it("rejects missing confirmation and does not dispatch a transfer for a changed session", async () => {
	await expect(
		databaseKnowledgeService.transferBinds(transferPayload),
	).rejects.toThrow("Сервер не подтвердил");
	const request = databaseKnowledgeService.transferBinds(transferPayload);
	mocks.session = { user: { id: "another" } };
	await expect(request).rejects.toThrow("Аккаунт изменился");
	expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
