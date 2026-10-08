// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("./authenticated-fetch", () => ({ authenticatedFetch: fetcher }));

import {
	beginCritical,
	confirmedAccountAction,
} from "./critical-confirmation.service";

beforeEach(() => {
	vi.resetAllMocks();
	fetcher.mockResolvedValue(
		Response.json({ id: "request", status: "pending", token: "one-use" }),
	);
});
it("uses the authenticated API and excludes account-creation passwords from generic confirmation", async () => {
	await beginCritical({
		action: "user.create",
		payload: {
			email: "new@example.test",
			roles: ["support"],
			password: "synthetic-secret",
		},
	});
	expect(fetcher.mock.calls[0][0]).toBe("/api/accounts?action=critical");
	expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
		operation: "begin",
		action: "user.create",
		payload: {
			email: "new@example.test",
			roles: ["support"],
			display_name: "",
		},
	});
	expect(fetcher.mock.calls[0][1].body).not.toContain("synthetic-secret");
});
it("submits only the one-time confirmation to an action endpoint, without caller-supplied actor/session", async () => {
	await confirmedAccountAction("revoke-other-sessions", {
		id: "request",
		token: "one-use",
	});
	expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
		confirmation: { id: "request", token: "one-use" },
	});
});
it("propagates denial instead of returning success", async () => {
	fetcher.mockResolvedValue(
		Response.json({ error: "Подтверждение истекло" }, { status: 410 }),
	);
	await expect(
		confirmedAccountAction("telegram-unlink", {
			id: "request",
			token: "one-use",
		}),
	).rejects.toThrow("Подтверждение истекло");
});
