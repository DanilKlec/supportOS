import { readdirSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	generate: vi.fn(),
	glossary: vi.fn(),
	knowledge: vi.fn(),
	status: vi.fn(),
}));
vi.mock("./generate.js", () => ({ default: mocks.generate }));
vi.mock("./glossary.js", () => ({ default: mocks.glossary }));
vi.mock("./knowledge.js", () => ({ default: mocks.knowledge }));
vi.mock("./status.js", () => ({ default: mocks.status }));

import handler from "../../api/ai/[endpoint].js";

const endpoints = ["generate", "glossary", "knowledge", "status"];
const response = () => ({ setHeader: vi.fn(), end: vi.fn(), statusCode: 0 });

beforeEach(() => vi.resetAllMocks());

it.each(endpoints)("delegates /api/ai/%s without changing the request", async (endpoint) => {
	const request = {
		url: `/api/ai/${endpoint}?action=feedback-reviews&endpoint=generate`,
		method: endpoint === "generate" ? "POST" : "GET",
		headers: { authorization: "Bearer synthetic", origin: "https://app.test" },
		query: { action: "feedback-reviews", endpoint: "generate" },
		body: { purpose: "composer", action: "save", expected: 7 },
	};
	const original = structuredClone(request);
	const result = response();
	mocks[endpoint].mockResolvedValue("delegated");
	expect(await handler(request, result)).toBe("delegated");
	expect(mocks[endpoint]).toHaveBeenCalledExactlyOnceWith(request, result);
	expect(mocks[endpoint].mock.calls[0][0]).toBe(request);
	expect(request).toEqual(original);
	for (const other of endpoints.filter((name) => name !== endpoint))
		expect(mocks[other]).not.toHaveBeenCalled();
});

it.each(endpoints)("accepts an absolute URL and trailing slash for %s", async (endpoint) => {
	const request = { url: `https://app.test/api/ai/${endpoint}/?action=feedback-reviews` };
	const result = response();
	await handler(request, result);
	expect(mocks[endpoint]).toHaveBeenCalledExactlyOnceWith(request, result);
});

it.each([401, 403, 405, 409, 422, 503])("preserves the delegated HTTP %s response", async (code) => {
	mocks.generate.mockImplementation((_request, result) => {
		result.statusCode = code;
		result.setHeader("Cache-Control", "private, no-store");
		result.end(JSON.stringify({ error: "Synthetic rejection", code: "SYNTHETIC" }));
	});
	const result = response();
	await handler({ url: "/api/ai/generate", method: "POST" }, result);
	expect(result.statusCode).toBe(code);
	expect(result.end).toHaveBeenCalledExactlyOnceWith(
		JSON.stringify({ error: "Synthetic rejection", code: "SYNTHETIC" }),
	);
	expect(result.setHeader).toHaveBeenCalledExactlyOnceWith("Cache-Control", "private, no-store");
});

it.each([
	"/api/ai",
	"/api/ai/unknown?endpoint=status",
	"/api/ai/constructor",
	"/api/ai/__proto__",
	"/api/ai/status/extra",
	"/api/ai/status-other",
	"/api/binds?endpoint=status",
])("rejects unknown path %s without calling a handler", async (url) => {
	const result = response();
	await handler({ url, query: { endpoint: "status" }, body: { endpoint: "status" } }, result);
	expect(result.statusCode).toBe(404);
	expect(JSON.parse(result.end.mock.calls[0][0])).toEqual({ error: "API endpoint не найден" });
	for (const endpoint of endpoints) expect(mocks[endpoint]).not.toHaveBeenCalled();
});

it("does not share request or response state between concurrent calls", async () => {
	mocks.generate.mockImplementation(async (request, result) => {
		await Promise.resolve();
		result.end(request.headers.authorization);
	});
	const results = [response(), response()];
	await Promise.all(results.map((result, index) => handler({
		url: "/api/ai/generate",
		headers: { authorization: `Bearer synthetic-${index}` },
	}, result)));
	expect(results[0].end).toHaveBeenCalledExactlyOnceWith("Bearer synthetic-0");
	expect(results[1].end).toHaveBeenCalledExactlyOnceWith("Bearer synthetic-1");
});

it("keeps exactly 11 deployment entry points within the Hobby limit", () => {
	const entries = readdirSync(new URL("../../api/", import.meta.url), { recursive: true })
		.filter((file) => /\.(?:[cm]?[jt]s|py|go|rb|rs)$/.test(file))
		.map((file) => file.replaceAll("\\", "/"))
		.sort();
	expect(entries).toEqual([
		"accounts/index.js",
		"agent-monitor/index.js",
		"ai/[endpoint].js",
		"binds/index.js",
		"content/index.js",
		"google-sheets/fetch.js",
		"projects/index.js",
		"registration/index.js",
		"sports-betting/live.js",
		"translator/languages.js",
		"translator/translate.js",
	]);
	expect(entries.length).toBeLessThanOrEqual(12);
});
