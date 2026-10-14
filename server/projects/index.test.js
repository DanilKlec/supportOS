import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), db: vi.fn() }));
vi.mock("../_auth.js", () => ({ requireUser: mocks.requireUser }));
vi.mock("../agent-monitor/_server.js", () => ({
	config: () => ({ SUPABASE_URL: "https://example.test" }),
	db: mocks.db,
}));

import handler from "./index.js";

beforeEach(() => {
	vi.resetAllMocks();
	mocks.requireUser.mockResolvedValue({ id: "verified" });
});
afterEach(() => vi.unstubAllGlobals());

async function run(method = "GET") {
	const response = { setHeader: vi.fn(), end: vi.fn(), statusCode: 0 };
	await handler({ method, headers: {} }, response);
	return {
		status: response.statusCode,
		body: JSON.parse(response.end.mock.calls[0][0]),
	};
}

it("returns the canonical project IDs, names and slugs to authenticated users", async () => {
	mocks.db.mockResolvedValue([
		{ id: "project-a", name: "Alpha", slug: "alpha" },
	]);
	expect(await run()).toEqual({
		status: 200,
		body: { projects: [{ id: "project-a", name: "Alpha", slug: "alpha" }] },
	});
	expect(mocks.requireUser).toHaveBeenCalledWith(
		expect.anything(),
		{ permission: null },
	);
	expect(mocks.db.mock.calls[0][1]).toContain("supportos_projects?select=id,name,slug");
});

it("does not allow writes", async () => {
	expect((await run("POST")).status).toBe(405);
	expect(mocks.requireUser).not.toHaveBeenCalled();
});
