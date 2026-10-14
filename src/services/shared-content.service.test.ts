import { beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import type { BonusProject } from "@/entities/bonus";
import type { ProjectEmailRecord } from "@/entities/project-email";
import type { BonusToolsData } from "./bonus-tools.service";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("./authenticated-fetch", () => ({ authenticatedFetch: fetcher }));

import { contentApi, type Publication } from "./shared-content.service";

beforeEach(() => vi.resetAllMocks());

it("keeps the legacy email adapter and publication metadata", async () => {
	fetcher.mockResolvedValue(
		Response.json({
			id: "emails",
			data: [{ id: "project", supportEmail: "support@example.com" }],
			version: 4,
			updated_at: "stamp",
			serverField: "retained",
		}),
	);
	const result = await contentApi("emails");
	expectTypeOf(result).toEqualTypeOf<Publication<ProjectEmailRecord> | null>();
	expect(result).toMatchObject({ version: 4, serverField: "retained" });
	expect(result?.data[0].addresses).toEqual([
		expect.objectContaining({
			type: "Support",
			email: "support@example.com",
			order: 0,
		}),
	]);
});

it("types bonus and tools responses without converting their records", async () => {
	const publication = {
		id: "bonuses",
		data: [{ id: "project", custom: "retained" }],
		version: 2,
		updated_at: "stamp",
	};
	fetcher.mockResolvedValueOnce(Response.json(publication));
	const bonuses = await contentApi("bonuses");
	expectTypeOf(bonuses).toEqualTypeOf<Publication<BonusProject> | null>();
	expect(bonuses).toEqual(publication);
	fetcher.mockResolvedValueOnce(Response.json({ ...publication, id: "tools" }));
	const tools = await contentApi("bonus-tools");
	expectTypeOf(tools).toEqualTypeOf<Publication<BonusToolsData> | null>();
	expect(tools?.data).toEqual(publication.data);
});

it("preserves empty documents, personal writes and server conflict messages", async () => {
	fetcher.mockResolvedValueOnce(Response.json(null));
	expect(await contentApi("bonuses")).toBeNull();
	fetcher.mockResolvedValueOnce(
		Response.json({ error: "Версия уже изменена" }, { status: 409 }),
	);
	await expect(contentApi("bonuses", [], 4, "personal")).rejects.toThrow(
		"Версия уже изменена",
	);
	expect(fetcher.mock.calls[1][0]).toBe(
		"/api/content?dataset=bonuses&scope=personal",
	);
	expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
		dataset: "bonuses",
		data: [],
		expected: 4,
		scope: "personal",
		action: "save",
	});
});
