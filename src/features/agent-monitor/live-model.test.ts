import { describe, expect, it } from "vitest";
import {
	csvCell,
	currentShift,
	currentStatus,
	intervals,
	type Observation,
	workDay,
} from "./live-model";
import { bounds } from "./model";

describe("LiveChat coverage", () => {
	it("assigns the early morning to the preceding night", () => {
		const at = Date.parse("2026-09-09T08:59:59+03:00");
		expect(workDay(at)).toBe("2026-09-08");
		expect(currentShift(at)).toBe("night");
		expect(workDay(at + 1000)).toBe("2026-09-09");
		expect(currentShift(at + 1000)).toBe("day");
	});
	it("stops counting when observations go stale and resumes without filling the gap", () => {
		const { start } = bounds("2026-09-08", "day");
		const row = (
			at: number,
			status: Observation["status"],
			id: number,
		): Observation => ({
			id,
			agent_id: "a",
			at: new Date(at).toISOString(),
			status,
			source: "poll",
			changed: true,
		});
		const totals = intervals(
			[
				row(start, "on", 1),
				row(start + 30000, "off", 2),
				row(start + 180000, "on", 3),
			],
			"a",
			"2026-09-08",
			"day",
			start + 210000,
		);
		expect(totals).toEqual({
			on: 60000,
			off: 90000,
			offline: 0,
			unknown: 60000,
		});
	});
	it("counts an incoming observation only within the shift and never counts future time", () => {
		const { start } = bounds("2026-09-08", "day");
		const rows: Observation[] = [
			{
				id: 1,
				agent_id: "a",
				at: new Date(start - 30000).toISOString(),
				status: "offline",
				source: "poll",
				changed: true,
			},
		];
		expect(intervals(rows, "a", "2026-09-08", "day", start + 10000)).toEqual({
			on: 0,
			off: 0,
			offline: 10000,
			unknown: 0,
		});
		expect(intervals(rows, "a", "2026-09-08", "day", start - 1)).toEqual({
			on: 0,
			off: 0,
			offline: 0,
			unknown: 0,
		});
	});
	it("never displays an old snapshot as current", () => {
		expect(
			currentStatus(
				{
					id: "a",
					name: "A",
					status: "on",
					observed_at: new Date(0).toISOString(),
					changed_at: null,
				},
				90000,
			),
		).toBe("unknown");
	});
	it("escapes spreadsheet formula injection", () => {
		expect(csvCell("=1+1")).toBe('"\'=1+1"');
	});
});
