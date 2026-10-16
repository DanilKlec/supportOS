// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bind } from "@/entities/bind";
import { useKnowledgeStore } from "@/store/knowledge.store";

const mock = vi.hoisted(() => ({ fetch: vi.fn(), actor: "actor" }));
vi.mock("./authenticated-fetch", () => ({ authenticatedFetch: mock.fetch }));
vi.mock("./supabase.service", () => ({
	supabaseService: { getSession: () => ({ user: { id: mock.actor } }) },
}));

import { fetchBindWorkspace } from "./bind-workspace.service";

let client: QueryClient;
const workspace = {
	categories: [],
	folders: [],
	binds: [
		{ id: "common", ownerId: null },
		{ id: "own", ownerId: "actor", sourceBindId: "common" },
	] as Bind[],
	branches: { choices: {}, incoming: [], outgoing: [] },
};
beforeEach(() => {
	vi.resetAllMocks();
	mock.actor = "actor";
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());
it("joins concurrent bootstrap and workspace consumers, seeds feature caches, and reuses fresh data", async () => {
	const runtime = useKnowledgeStore.getState().binds;
	mock.fetch.mockResolvedValue(Response.json(workspace));
	const results = await Promise.all([
		fetchBindWorkspace(client, "actor"),
		fetchBindWorkspace(client, "actor"),
		fetchBindWorkspace(client, "actor"),
	]);
	expect(results).toEqual([workspace, workspace, workspace]);
	await fetchBindWorkspace(client, "actor");
	expect(mock.fetch).toHaveBeenCalledExactlyOnceWith(
		"/api/binds?action=workspace",
		{ signal: expect.any(AbortSignal) },
	);
	expect(client.getQueryData(["shared-binds", "actor"])).toEqual([
		workspace.binds[0],
	]);
	expect(client.getQueryData(["personal-binds", "actor", "actor"])).toEqual([
		workspace.binds[1],
	]);
	expect(client.getQueryData(["bind-branches", "actor"])).toEqual(
		workspace.branches,
	);
	expect(useKnowledgeStore.getState().binds).toBe(runtime);
});
it("does not overwrite an edit or branch choice that completed while a background read was in flight", async () => {
	let finish!: (response: Response) => void;
	mock.fetch.mockImplementation(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	const request = fetchBindWorkspace(client, "actor");
	client.setQueryData(
		["shared-binds", "actor"],
		[{ id: "edited", ownerId: null }],
	);
	client.setQueryData(["bind-branches", "actor"], {
		choices: { common: "mine" },
		incoming: [],
		outgoing: [],
	});
	finish(Response.json(workspace));
	await request;
	expect(client.getQueryData(["shared-binds", "actor"])).toEqual([
		{ id: "edited", ownerId: null },
	]);
	expect(client.getQueryData(["bind-branches", "actor"])).toMatchObject({
		choices: { common: "mine" },
	});
	expect(client.getQueryData(["personal-binds", "actor", "actor"])).toEqual([
		workspace.binds[1],
	]);
});
it("never fills feature caches after an account switch during a request", async () => {
	let finish!: (response: Response) => void;
	mock.fetch.mockImplementation(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	const request = fetchBindWorkspace(client, "actor");
	mock.actor = "other";
	finish(Response.json(workspace));
	await expect(request).rejects.toThrow("Аккаунт изменился");
	expect(client.getQueryData(["shared-binds", "actor"])).toBeUndefined();
	expect(
		client.getQueryData(["personal-binds", "other", "other"]),
	).toBeUndefined();
});
it.each([
	401, 403, 500,
])("propagates API error %s without caching empty data", async (status) => {
	mock.fetch.mockResolvedValue(
		Response.json({ error: "Доступ отозван" }, { status }),
	);
	await expect(fetchBindWorkspace(client, "actor")).rejects.toMatchObject({
		status,
	});
	expect(client.getQueryData(["shared-binds", "actor"])).toBeUndefined();
});
