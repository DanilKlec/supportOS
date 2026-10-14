import { expect, it } from "vitest";
import { qcSections } from "@/features/operations/sections";
import { canAccessPage } from "../../../shared/access.js";
import { materialTabs, problemTabs, qcDestination } from "./navigation";

it("keeps QC focused on working materials without AI tools", () => {
	expect(qcSections.map((s) => s.label)).toEqual([
		"Обзор",
		"Очередь проверки",
		"Материалы",
		"Проблемы материалов",
		"История",
	]);
	expect(materialTabs.map((s) => s.id)).toEqual(["binds", "emails", "bonuses"]);
	expect(problemTabs.map((s) => s.id)).toEqual(["duplicates", "languages"]);
});
it("preserves legacy hashes and queue selection", () => {
	for (const [hash, section, tab] of [
		["proposals", "inbox", "inbox"],
		["gaps", "inbox", "inbox"],
		["duplicates", "problems", "duplicates"],
		["languages", "problems", "languages"],
	])
		expect(qcDestination(hash)).toMatchObject({ section, tab });
	expect(qcDestination("proposals")).toMatchObject({ filter: "proposal" });
	expect(qcDestination("gaps")).toMatchObject({ filter: "gap" });
	expect(qcDestination("inbox?item=proposal%3Aabc")).toMatchObject({
		item: "proposal:abc",
	});
});
it("keeps Support outside QC and respects each nested tool permission", () => {
	const support = {
		status: "active",
		permissions: ["work", "binds.read", "projects.read", "bonuses.read"],
	};
	for (const id of [...qcSections, ...materialTabs, ...problemTabs].map(
		(s) => s.id,
	))
		expect(canAccessPage(support, "/qc", id)).toBe(false);
	expect(
		canAccessPage(
			{ status: "active", permissions: ["ai.rules"] },
			"/qc",
			"materials",
		),
	).toBe(false);
	expect(
		canAccessPage(
			{ status: "active", permissions: ["ai.rules"] },
			"/qc",
			"knowledge",
		),
	).toBe(false);
	expect(
		canAccessPage(
			{ status: "active", permissions: ["knowledge.write"] },
			"/qc",
			"emails",
		),
	).toBe(false);
	expect(
		canAccessPage(
			{ status: "active", permissions: ["knowledge.write", "projects.read"] },
			"/qc",
			"emails",
		),
	).toBe(true);
	expect(
		canAccessPage(
			{ status: "active", permissions: ["knowledge.write"] },
			"/qc",
			"inbox?item=gap%3A1",
		),
	).toBe(true);
});
