import { beforeEach, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("./authenticated-fetch", () => ({ authenticatedFetch: fetcher }));

import { loadLoginHistory } from "./login-history.service";

beforeEach(() => vi.resetAllMocks());
it("uses the authenticated API with pagination and retains only safe display fields", async () => {
	fetcher.mockResolvedValue({
		ok: true,
		json: async () => ({
			events: [
				{
					id: "10",
					user_id: "user",
					session_id: "session",
					event_type: "login_approved",
					created_at: "2026-10-07T10:00:00Z",
					ip_hash: "a".repeat(64),
					browser: "Chrome",
					os: "Windows",
					telegram_result: "approved",
					ip: "192.0.2.1",
					user_agent: "synthetic-raw-agent",
					access_token: "synthetic-access",
					refresh_token: "synthetic-refresh",
				},
			],
			nextCursor: "10",
		}),
	});
	const signal = new AbortController().signal;
	const result = await loadLoginHistory("user", "12", signal);
	expect(fetcher).toHaveBeenCalledWith(
		"/api/accounts?action=login-history&target=user&before=12",
		{ cache: "no-store", signal },
	);
	expect(result.nextCursor).toBe("10");
	expect(result.events[0].telegram_result).toBe("approved");
	expect(JSON.stringify(result)).not.toMatch(/synthetic-|192\.0\.2/);
});
it.each([
	401, 403, 500,
])("shows a safe Russian error for HTTP %s", async (status) => {
	fetcher.mockResolvedValue({ ok: false, status });
	await expect(loadLoginHistory()).rejects.toThrow(
		status === 401
			? "Войдите снова"
			: status === 403
				? "Нет доступа"
				: "Повторите попытку",
	);
});
it("never invents unknown event types or keeps a raw IP in the cache", async () => {
	fetcher.mockResolvedValue({
		ok: true,
		json: async () => ({
			events: [
				{
					id: "1",
					user_id: "user",
					created_at: "2026-10-07",
					event_type: "untrusted",
				},
			],
		}),
	});
	await expect(loadLoginHistory()).rejects.toThrow(
		"Не удалось загрузить историю входов",
	);
	fetcher.mockResolvedValue({
		ok: true,
		json: async () => ({
			events: [
				{
					id: "1",
					user_id: "user",
					created_at: "2026-10-07",
					event_type: "login_rejected",
					ip_hash: "192.0.2.1",
				},
			],
		}),
	});
	expect((await loadLoginHistory()).events[0].ip_hash).toBeNull();
});
