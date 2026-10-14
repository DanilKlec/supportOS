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
it("sends explicit location and color without assigning the catch-all category", async () => {
	mock.request.mockResolvedValue(
		Response.json({
			id: "base",
			owner_id: null,
			category_id: "chosen",
			folder_id: "folder",
			color: "#10B981",
			translations: draft.translations,
			tags: [],
			created_at: "",
			updated_at: "",
		}),
	);
	const saved = await sharedBindsService.save({
		...draft,
		categoryId: "chosen",
		folderId: "folder",
		color: "#10B981",
	});
	expect(JSON.parse(mock.request.mock.calls[0][1].body)).toMatchObject({
		categoryId: "chosen",
		folderId: "folder",
		color: "#10B981",
	});
	expect(saved).toMatchObject({
		categoryId: "chosen",
		folderId: "folder",
		color: "#10B981",
	});
});
it("keeps absent legacy metadata absent and sends null to clear an explicit color/folder", async () => {
	mock.request.mockImplementation(async () =>
		Response.json({ id: "base", translations: [], tags: [] }),
	);
	await sharedBindsService.save(draft);
	expect(JSON.parse(mock.request.mock.calls[0][1].body)).not.toHaveProperty(
		"categoryId",
	);
	expect(JSON.parse(mock.request.mock.calls[0][1].body)).not.toHaveProperty(
		"color",
	);
	await sharedBindsService.save({
		...draft,
		categoryId: "chosen",
		folderId: null,
		color: null,
	});
	expect(JSON.parse(mock.request.mock.calls[1][1].body)).toMatchObject({
		categoryId: "chosen",
		folderId: null,
		color: null,
	});
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

it("adapts branch rows and history snapshots without dropping response metadata", async () => {
	const row = {
		id: "base",
		owner_id: null,
		slug: "base",
		category_id: "shared",
		translations: null,
		tags: null,
		created_at: "created",
		updated_at: "updated",
	};
	mock.request.mockResolvedValueOnce(
		Response.json({
			choices: { base: "branch" },
			outgoing: [],
			serverField: "retained",
			incoming: [{ id: "branch", sourceId: "base", sender: "sender", row }],
		}),
	);
	const branches = await sharedBindsService.branches();
	expect(branches).toMatchObject({ serverField: "retained" });
	expect(branches.incoming[0]).toMatchObject({
		row,
		bind: {
			id: "base",
			tags: [],
			translations: [],
			favorite: false,
			archived: false,
		},
	});
	mock.request.mockResolvedValueOnce(
		Response.json([
			{
				id: 1,
				owner_id: null,
				created_at: "stamp",
				operation: "save",
				snapshot: row,
				extra: "retained",
			},
		]),
	);
	expect((await sharedBindsService.history("base"))[0]).toMatchObject({
		extra: "retained",
		snapshot: { id: "base", createdAt: "created", updatedAt: "updated" },
	});
});
