import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	getSession: vi.fn(),
	request: vi.fn(),
}));
vi.mock("./supabase.service", () => ({ supabaseService: mock }));
vi.mock("./authenticated-fetch", () => ({
	authenticatedFetch: mock.request,
}));

import { sharedBindsService } from "./shared-binds.service";

const draft = {
	translations: [
		{ language: "ru", title: "Title", content: "Text", updatedAt: "" },
	],
	tags: ["tag"],
};
beforeEach(() => {
	vi.resetAllMocks();
	mock.getSession.mockReturnValue({
		user: {
			id: "admin",
			access: {
				status: "active",
				permissions: ["binds.read", "knowledge.write"],
			},
		},
	});
	mock.request.mockResolvedValue(
		new Response(JSON.stringify({ error: "unexpected request" }), {
			status: 500,
		}),
	);
});
it("rejects shared writes by Support before making a request", async () => {
	mock.getSession.mockReturnValue({
		user: { access: { status: "active", permissions: ["binds.read"] } },
	});
	await expect(sharedBindsService.save(draft)).rejects.toThrow("Нет права");
	expect(mock.request).not.toHaveBeenCalled();
});
it("only confirms a shared save after the server returns it", async () => {
	mock.request.mockRejectedValue(new Error("offline"));
	await expect(sharedBindsService.save(draft)).rejects.toThrow("offline");
});
it("detects a concurrent shared edit instead of silently overwriting it", async () => {
	mock.request.mockResolvedValue(
		new Response(
			JSON.stringify({
				error: "Бинд изменён другим сотрудником или доступ отозван.",
			}),
			{ status: 409 },
		),
	);
	await expect(
		sharedBindsService.save({
			...draft,
			original: {
				id: "base",
				ownerId: null,
				updatedAt: "2026-09-10T10:00:00Z",
			} as never,
		}),
	).rejects.toThrow("Бинд изменён другим сотрудником или доступ отозван");
	expect(JSON.parse(mock.request.mock.calls[0][1].body)).toMatchObject({
		action: "shared-save",
		expected: "2026-09-10T10:00:00Z",
		id: "base",
	});
});
it("paginates the common library and never selects private versions", async () => {
	const row = {
		id: "base",
		owner_id: null,
		slug: "base",
		category_id: "shared",
		translations: [],
		tags: [],
		created_at: "",
		updated_at: "",
	};
	mock.request
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					rows: Array.from({ length: 500 }, (_, i) => ({
						...row,
						id: String(i),
					})),
				}),
			),
		)
		.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [row] })));
	expect(await sharedBindsService.list()).toHaveLength(501);
	expect(mock.request.mock.calls.map(([url]) => url)).toEqual([
		"/api/binds?action=shared&limit=500&offset=0",
		"/api/binds?action=shared&limit=500&offset=500",
	]);
});
