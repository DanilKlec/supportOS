import { beforeEach, expect, expectTypeOf, it, vi } from "vitest";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: fetcher,
}));

import { accessApi } from "./access-api";
import type { AccessMutationResponse, AccessResponses } from "./account-types";

beforeEach(() => vi.resetAllMocks());

it("types catalog and audit responses without stripping server fields", async () => {
	const catalog = { roles: [], permissions: [], revision: "server" };
	fetcher.mockResolvedValueOnce(Response.json(catalog));
	const result = await accessApi("catalog");
	expectTypeOf(result).toEqualTypeOf<AccessResponses["catalog"]>();
	expect(result).toEqual(catalog);
	const audit = {
		rows: [
			{
				id: 1,
				before_data: null,
				after_data: { roles: [{ id: "support" }], extra: "retained" },
			},
		],
		hasMore: false,
	};
	fetcher.mockResolvedValueOnce(Response.json(audit));
	const rows = await accessApi("audit");
	expectTypeOf(rows).toEqualTypeOf<AccessResponses["audit"]>();
	expect(rows).toEqual(audit);
});

it("keeps users paging, query parameters and cancellation intact", async () => {
	fetcher.mockResolvedValue(
		Response.json({ users: [], total: 21, hasMore: true }),
	);
	const signal = new AbortController().signal;
	const result = await accessApi(
		"users",
		undefined,
		{ page: "2", search: "a b" },
		signal,
	);
	expectTypeOf(result).toEqualTypeOf<AccessResponses["users"]>();
	expect(result.total).toBe(21);
	expect(fetcher).toHaveBeenCalledWith(
		"/api/accounts?action=users&page=2&search=a+b",
		expect.objectContaining({ method: "GET", body: undefined, signal }),
	);
});

it("preserves mutation warnings and critical confirmation errors", async () => {
	fetcher.mockResolvedValueOnce(
		Response.json({ ok: true, warning: "Проверьте изменения" }),
	);
	const body = { action: "user.update", payload: { id: "user" } };
	const result = await accessApi("users", body);
	expectTypeOf(result).toEqualTypeOf<AccessMutationResponse>();
	expect(result.warning).toBe("Проверьте изменения");
	expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(body);
	fetcher.mockResolvedValueOnce(
		Response.json(
			{ error: "Подтвердите действие", code: "critical_confirmation_required" },
			{ status: 403 },
		),
	);
	await expect(accessApi("users", body)).rejects.toMatchObject({
		message: "Подтвердите действие",
		status: 403,
		code: "critical_confirmation_required",
	});
});
