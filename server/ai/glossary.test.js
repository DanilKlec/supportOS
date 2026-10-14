import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ requireUser: vi.fn(), read: vi.fn() }));
vi.mock("../_auth.js", () => ({ requireUser: mock.requireUser }));
vi.mock("./_glossary.js", () => ({ readPublishedGlossary: mock.read }));

import handler from "./glossary.js";

beforeEach(() => vi.resetAllMocks());

async function run(method = "GET") {
	const response = { setHeader: vi.fn(), end: vi.fn(), statusCode: 0 };
	await handler({ method }, response);
	return {
		status: response.statusCode,
		body: JSON.parse(response.end.mock.calls[0][0]),
	};
}

it("returns only published database terms to an authorized user", async () => {
	mock.requireUser.mockResolvedValue({ access: { status: "active", permissions: ["binds.read"] } });
	mock.read.mockResolvedValue([{ id: "term", source: "KYC", target: "Проверка" }]);
	expect(await run()).toEqual({
		status: 200,
		body: { terms: [{ id: "term", source: "KYC", target: "Проверка" }] },
	});
	expect(mock.requireUser).toHaveBeenCalledWith(expect.anything(), { permission: null });
});

it("rejects users without glossary access before querying the database", async () => {
	mock.requireUser.mockResolvedValue({ access: { status: "active", permissions: [] } });
	expect((await run()).status).toBe(403);
	expect(mock.read).not.toHaveBeenCalled();
});
