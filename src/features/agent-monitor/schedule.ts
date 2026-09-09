import { bounds, type ShiftId } from "./model";
export interface ScheduleAssignment {
	day: string;
	agent_id: string;
	shift: ShiftId;
}
export type RosterScope = "current" | "selected" | "online";
export function isScheduledNow(
	agentId: string,
	assignments: ScheduleAssignment[],
	now: number,
) {
	return assignments.some((assignment) => {
		if (assignment.agent_id.toLowerCase() !== agentId.toLowerCase())
			return false;
		const { start, end } = bounds(assignment.day, assignment.shift);
		return now >= start && now < end;
	});
}
export function matchesRoster(
	agentId: string,
	scope: RosterScope,
	current: ScheduleAssignment[],
	selected: ScheduleAssignment[],
	shift: ShiftId,
	now: number,
) {
	if (scope === "online") return true;
	if (scope === "current") return isScheduledNow(agentId, current, now);
	return selected.some(
		(assignment) =>
			assignment.agent_id.toLowerCase() === agentId.toLowerCase() &&
			assignment.shift === shift,
	);
}
