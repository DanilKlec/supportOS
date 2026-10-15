import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	token: vi.fn(async () => "synthetic-token"),
}));
vi.mock("./supabase.service", () => ({
	supabaseService: { getAccessToken: mock.token },
}));

import { authenticatedFetch } from "./authenticated-fetch";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it("bounds API reads, preserves caller cancellation, and leaves writes without an implicit deadline", async () => {
	vi.stubGlobal("window", { location: { origin: "https://app.test" } });
	const request = vi.fn<typeof fetch>(async () => new Response("{}"));
	vi.stubGlobal("fetch", request);
	await authenticatedFetch("/api/content?dataset=emails");
	expect(request.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
	expect(
		(request.mock.calls[0][1]?.headers as Headers).get("Authorization"),
	).toBe("Bearer synthetic-token");
	const controller = new AbortController();
	await authenticatedFetch("/api/binds", { signal: controller.signal });
	expect(request.mock.calls[1][1]?.signal).toBe(controller.signal);
	await authenticatedFetch("/api/binds", { method: "POST", body: "{}" });
	expect(request.mock.calls[2][1]?.signal).toBeUndefined();
});

it("does not attach credentials or alter requests to external sites", async () => {
	vi.stubGlobal("window", { location: { origin: "https://app.test" } });
	const request = vi.fn(async () => new Response("{}"));
	vi.stubGlobal("fetch", request);
	await authenticatedFetch("https://example.test/api/content");
	expect(mock.token).not.toHaveBeenCalled();
	expect(request).toHaveBeenCalledWith(
		"https://example.test/api/content",
		undefined,
	);
});
