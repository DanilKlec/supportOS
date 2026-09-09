import { expect, it } from "vitest";
import { parseSchedule, sheetMonth } from "./import-schedule";
const header = [
	null,
	null,
	"Сентябрь",
	...Array.from({ length: 30 }, (_, i) => i + 1),
];
const directory = [
	[null, "Иван Иванов (sup)", null, "personal@example.com", "work@example.com"],
];
const agents = [{ id: "work@example.com" }];
it("reads corporate emails, all four shift codes and days off", () => {
	const result = parseSchedule(
		[header, [null, null, "Иван Иванов (sup)", 7, 6.5, 9, 13, 0], [null, null, "Руководитель (shift)", 7]],
		directory,
		"September 26",
		agents,
	);
	expect(result.issues).toEqual([]);
	expect(result.payload.people).toEqual(["work@example.com"]);
	expect(result.payload.records.map((r) => [r.day, r.shift])).toEqual([
		["2026-09-01", "day"],
		["2026-09-02", "evening"],
		["2026-09-03", "night"],
		["2026-09-04", "day"],
		["2026-09-04", "evening"],
	]);
});
it("blocks unknown codes, missing agents, ambiguous names and incomplete calendars", () => {
	expect(
		parseSchedule(
			[header, [null, null, "Иван Иванов (sup)", 8]],
			directory,
			"September 26",
			[],
		).issues,
	).toHaveLength(2);
	expect(
		parseSchedule(
			[header, [null, null, "Иван Иванов (sup)", 7]],
			[...directory, [null, "Иван Иванов", null, null, "second@example.com"]],
			"September 26",
			agents,
		).issues.length,
	).toBeGreaterThan(0);
	expect(() =>
		parseSchedule([header.slice(0, -1)], directory, "September 26", agents),
	).toThrow();
	expect(sheetMonth("Archive")).toBeNull();
});
