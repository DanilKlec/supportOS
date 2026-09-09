import { expect, it } from "vitest";
import { agentEmail, isOnline, matchesAgent, statusEvents } from "./analytics";
import type { LiveAgent, Observation } from "./live-model";
const at = Date.parse("2026-09-09T12:00:00Z");
const agent: LiveAgent = {
	id: "someone@example.com",
	name: "Same Name",
	status: "on",
	observed_at: new Date(at).toISOString(),
	changed_at: new Date(at).toISOString(),
};
it("shows only fresh online agents including those with reception off", () => {
	expect(isOnline(agent, at)).toBe(true);
	expect(isOnline({ ...agent, status: "off" }, at)).toBe(true);
	expect(isOnline({ ...agent, status: "offline" }, at)).toBe(false);
	expect(isOnline({ ...agent, status: "unknown" }, at)).toBe(false);
	expect(isOnline(agent, at + 90000)).toBe(false);
});
it("finds an agent by email and does not invent emails for opaque IDs", () => {
	expect(matchesAgent(agent, " SOMEONE@EXAMPLE ")).toBe(true);
	expect(agentEmail(agent)).toBe("someone@example.com");
	expect(agentEmail({ id: "opaque-id" })).toBe("");
});
it("separates initial observations and reconnects from actual on/off transitions", () => {
	const rows: Observation[] = ["off", "on", "off", "offline", "on"].map(
		(status, i) => ({
			id: i + 1,
			agent_id: agent.id,
			at: new Date(at + i * 1000).toISOString(),
			status: status as Observation["status"],
			source: "poll",
			changed: true,
		}),
	);
	const events = statusEvents([...rows].reverse().concat(rows[1]));
	expect(events).toHaveLength(5);
	expect(events.map((row) => row.toggle)).toEqual([
		false,
		true,
		true,
		false,
		false,
	]);
	expect(events[0].action).toBe("Первое доступное наблюдение");
	expect(events[4].action).toBe("Агент появился в сети");
});
it("keeps previous status per agent", () => {
	const rows: Observation[] = [
		{
			id: 1,
			agent_id: "a",
			at: new Date(at).toISOString(),
			status: "on",
			source: "poll",
			changed: true,
		},
		{
			id: 2,
			agent_id: "b",
			at: new Date(at + 1000).toISOString(),
			status: "off",
			source: "poll",
			changed: true,
		},
	];
	expect(statusEvents(rows)[1].toggle).toBe(false);
});
