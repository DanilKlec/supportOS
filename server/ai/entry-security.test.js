import { afterEach, expect, it, vi } from "vitest";
import handler from "../../api/ai/[endpoint].js";

afterEach(() => vi.restoreAllMocks());

it.each([
	["status", "GET"],
	["glossary", "GET"],
	["knowledge", "GET"],
	["generate", "POST"],
])("keeps /api/ai/%s protected by the real server authentication guard", async (endpoint, method) => {
	const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected network request"));
	const response = {
		statusCode: 0,
		setHeader: vi.fn(),
		end: vi.fn(),
		status(code) { this.statusCode = code; return this; },
		json(body) { this.end(JSON.stringify(body)); },
	};
	await handler({
		url: `https://app.test/api/ai/${endpoint}`,
		method,
		headers: {},
		query: { endpoint },
		body: { purpose: "composer", preview: true },
	}, response);
	expect(response.statusCode).toBe(401);
	expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({ error: "Войдите в SupportOS" });
	expect(fetch).not.toHaveBeenCalled();
});
