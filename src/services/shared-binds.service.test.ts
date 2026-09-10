import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
	getSession: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	updateWhere: vi.fn(),
}));
vi.mock("./supabase.service", () => ({ supabaseService: mock }));
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
});
it("rejects shared writes by Support before making a request", async () => {
	mock.getSession.mockReturnValue({
		user: { access: { status: "active", permissions: ["binds.read"] } },
	});
	await expect(sharedBindsService.save(draft)).rejects.toThrow("Нет права");
	expect(mock.insert).not.toHaveBeenCalled();
});
it("only confirms a shared save after the server returns it", async () => {
	mock.insert.mockRejectedValue(new Error("offline"));
	await expect(sharedBindsService.save(draft)).rejects.toThrow("offline");
});
it("detects a concurrent shared edit instead of silently overwriting it", async () => {
	mock.updateWhere.mockResolvedValue([]);
	await expect(
		sharedBindsService.save({
			...draft,
			original: {
				id: "base",
				ownerId: null,
				updatedAt: "2026-09-10T10:00:00Z",
			} as never,
		}),
	).rejects.toThrow("уже изменён");
	expect(mock.updateWhere.mock.calls[0][1]).toMatchObject({
		updated_at: "eq.2026-09-10T10:00:00Z",
		owner_id: "is.null",
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
	mock.select
		.mockResolvedValueOnce(
			Array.from({ length: 500 }, (_, i) => ({ ...row, id: String(i) })),
		)
		.mockResolvedValueOnce([row]);
	expect(await sharedBindsService.list()).toHaveLength(501);
	expect(mock.select.mock.calls[1][1]).toMatchObject({
		offset: 500,
		owner_id: "is.null",
	});
});
