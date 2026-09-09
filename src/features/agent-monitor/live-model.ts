import { bounds, dayKey, type ShiftId } from "./model";
export type RoutingStatus = "on" | "off" | "offline" | "unknown";
export interface Observation {
	id: number;
	agent_id: string;
	at: string;
	status: RoutingStatus;
	source: "poll" | "webhook";
	changed: boolean;
}
export interface LiveAgent {
	id: string;
	name: string;
	status: RoutingStatus;
	observed_at: string | null;
	changed_at: string | null;
}
export interface MonitorData {
	currentAssignments?: {
		day: string;
		agent_id: string;
		shift: ShiftId;
		actor: string;
	}[];
	totals: {
		agent_id: string;
		shift: ShiftId;
		on_ms: number;
		off_ms: number;
		offline_ms: number;
		unknown_ms: number;
	}[];
	historyLimited: boolean;
	agents: LiveAgent[];
	observations: Observation[];
	assignments: {
		day: string;
		agent_id: string;
		shift: ShiftId;
		actor: string;
	}[];
	audit: {
		id: number;
		agent_id: string;
		shift: ShiftId;
		operation: string;
		actor: string;
		at: string;
	}[];
	lastSync: string | null;
	lastWebhook?: string | null;
	serverTime: number;
}
export const labels: Record<RoutingStatus, string> = {
	on: "Принимает чаты",
	off: "Приём выключен",
	offline: "Не в сети",
	unknown: "Нет данных",
};
export function workDay(now = Date.now()) {
	return dayKey(now - 9 * 3600000);
}
export function currentShift(now = Date.now()): ShiftId {
	const minutes =
		new Date(now + 3 * 3600000).getUTCHours() * 60 +
		new Date(now).getUTCMinutes();
	return minutes >= 1380 || minutes < 540
		? "night"
		: minutes >= 960
			? "evening"
			: "day";
}
export function currentStatus(agent: LiveAgent, now: number): RoutingStatus {
	return agent.observed_at && now - Date.parse(agent.observed_at) < 90000
		? agent.status
		: "unknown";
}
export function intervals(
	observations: Observation[],
	agentId: string,
	day: string,
	shift: ShiftId,
	now: number,
) {
	const { start, end } = bounds(day, shift);
	const stop = Math.max(start, Math.min(end, now));
	const rows = observations
		.filter((item) => item.agent_id === agentId)
		.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id);
	const totals: Record<RoutingStatus, number> = {
		on: 0,
		off: 0,
		offline: 0,
		unknown: stop - start,
	};
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const at = Date.parse(row.at);
		const from = Math.max(start, at);
		const to = Math.min(
			stop,
			at + 90000,
			rows[i + 1] ? Date.parse(rows[i + 1].at) : Infinity,
		);
		if (to <= from || row.status === "unknown") continue;
		totals[row.status] += to - from;
		totals.unknown -= to - from;
	}
	return totals;
}
export function csvCell(value: unknown) {
	let text = String(value ?? "");
	if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
}
