import { beforeEach, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("./authenticated-fetch", () => ({ authenticatedFetch: fetcher }));

import { loadActiveSessions } from "./active-sessions.service";

beforeEach(() => vi.resetAllMocks());

it("shows a safe Russian error when fetching or JSON decoding fails", async () => {
	fetcher.mockRejectedValue(new Error("synthetic internal error"));
	await expect(loadActiveSessions()).rejects.toThrow(
		"Не удалось загрузить активные сессии",
	);
	fetcher.mockResolvedValue({
		ok: true,
		json: async () => {
			throw new SyntaxError("synthetic invalid JSON");
		},
	});
	await expect(loadActiveSessions()).rejects.toThrow(
		"Не удалось загрузить активные сессии",
	);
});

it("requests the authenticated own-session API without a browser-selected user and caches only safe fields", async () => {
	fetcher.mockResolvedValue({
		ok: true,
		json: async () => ({
			sessions: [
				{
					id: "session",
					created_at: null,
					updated_at: null,
					refreshed_at: null,
					user_agent: "Browser",
					is_current: true,
					refresh_token: "synthetic-refresh",
					access_token: "synthetic-access",
				},
			],
		}),
	});
	const signal = new AbortController().signal;
	const sessions = await loadActiveSessions(signal);
	expect(fetcher).toHaveBeenCalledWith("/api/accounts?action=sessions", {
		cache: "no-store",
		signal,
	});
	expect(sessions).toEqual([
		{
			id: "session",
			created_at: null,
			updated_at: null,
			refreshed_at: null,
			user_agent: "Browser",
			is_current: true,
		},
	]);
});
it.each([
	401, 403, 500,
])("handles HTTP %s without forwarding server internals", async (status) => {
	fetcher.mockResolvedValue({
		ok: false,
		status,
		json: async () => ({ error: "synthetic-secret" }),
	});
	await expect(loadActiveSessions()).rejects.toThrow(
		status === 401
			? "Войдите снова"
			: status === 403
				? "Нет доступа"
				: "Повторите попытку",
	);
});
it.each([
	{},
	{ sessions: [null] },
	{ sessions: [{ id: 123 }] },
])("rejects malformed session responses", async (body) => {
	fetcher.mockResolvedValue({ ok: true, json: async () => body });
	await expect(loadActiveSessions()).rejects.toThrow(
		"Не удалось загрузить активные сессии",
	);
});
