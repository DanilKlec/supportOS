import { describe, expect, it } from "vitest";
import { bounds, type Event, report } from "./model";

describe("shift history", () => {
	it("uses fixed GMT+3 in winter and summer", () => {
		for (const day of ["2026-01-10", "2026-07-10"])
			expect(new Date(bounds(day, "day").start).toISOString()).toBe(
				`${day}T06:00:00.000Z`,
			);
	});
	it("ends the night on the following date", () => {
		const range = bounds("2026-09-08", "night");
		expect(new Date(range.end).toISOString()).toBe("2026-09-09T06:00:00.000Z");
		expect(range.end - range.start).toBe(10 * 3600000);
	});
	it("preserves the half-hour overlap", () => {
		expect(
			bounds("2026-09-08", "day").end - bounds("2026-09-08", "evening").start,
		).toBe(1800000);
	});
	it("carries state into the shift and does not count future time", () => {
		const events: Event[] = [
			{
				id: "1",
				agentId: "a",
				at: 5,
				status: "on",
				actor: "test",
				reason: "test",
			},
			{
				id: "2",
				agentId: "a",
				at: 20,
				status: "off",
				actor: "test",
				reason: "test",
			},
		];
		expect(report(events, "a", 10, 40, 30)).toEqual({
			on: 10,
			off: 10,
			unknown: 0,
		});
		expect(report([], "a", 10, 40, 30)).toEqual({ on: 0, off: 0, unknown: 20 });
	});
});
