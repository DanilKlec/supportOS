import { expect, it } from "vitest";
import {
	isScheduledNow,
	matchesRoster,
	type ScheduleAssignment,
} from "./schedule";

const assignments: ScheduleAssignment[] = [
	{ day: "2026-09-09", agent_id: "day@example.com", shift: "day" },
	{ day: "2026-09-09", agent_id: "eve@example.com", shift: "evening" },
	{ day: "2026-09-09", agent_id: "night@example.com", shift: "night" },
];
const at = (time: string) => Date.parse(`${time}+03:00`);
it("includes both shifts during overlap, with exclusive end boundaries", () => {
	expect(
		isScheduledNow("day@example.com", assignments, at("2026-09-09T08:59:59")),
	).toBe(false);
	expect(
		isScheduledNow("DAY@example.com", assignments, at("2026-09-09T09:00:00")),
	).toBe(true);
	for (const email of ["day@example.com", "eve@example.com"]) {
		expect(isScheduledNow(email, assignments, at("2026-09-09T16:00:00"))).toBe(
			true,
		);
	}
	expect(
		isScheduledNow("day@example.com", assignments, at("2026-09-09T16:30:00")),
	).toBe(false);
	expect(
		isScheduledNow("eve@example.com", assignments, at("2026-09-09T23:00:00")),
	).toBe(false);
});
it("keeps the previous date's night shift until 09:00 GMT+3", () => {
	for (const time of ["2026-09-09T23:00:00", "2026-09-10T08:59:59"]) {
		expect(isScheduledNow("night@example.com", assignments, at(time))).toBe(
			true,
		);
	}
	expect(
		isScheduledNow("night@example.com", assignments, at("2026-09-10T09:00:00")),
	).toBe(false);
});
it("separates current roster from the historical selected shift and permits online fallback", () => {
	const now = at("2026-09-10T12:00:00");
	expect(
		matchesRoster("day@example.com", "current", [], assignments, "day", now),
	).toBe(false);
	expect(
		matchesRoster("day@example.com", "selected", [], assignments, "day", now),
	).toBe(true);
	expect(
		matchesRoster("day@example.com", "selected", [], assignments, "night", now),
	).toBe(false);
	expect(matchesRoster("unknown", "online", [], [], "day", now)).toBe(true);
});
