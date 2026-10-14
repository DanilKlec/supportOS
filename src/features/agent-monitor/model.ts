export const shifts = [
	{ id: "day", label: "Дневная", start: 540, end: 990, time: "09:00–16:30" },
	{
		id: "evening",
		label: "Вечерняя",
		start: 960,
		end: 1380,
		time: "16:00–23:00",
	},
	{
		id: "night",
		label: "Ночная",
		start: 1380,
		end: 1980,
		time: "23:00–09:00 (+1 день)",
	},
] as const;
export type ShiftId = (typeof shifts)[number]["id"];
export type Status = "on" | "off";
export interface Agent {
	id: string;
	name: string;
	shift: ShiftId;
}
export interface Event {
	id: string;
	agentId: string;
	at: number;
	status: Status;
	actor: string;
	reason: string;
}
export const zone = "Etc/GMT-3";
export function dayKey(at: number) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: zone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(at);
}
// Convert a wall-clock time using the zone's actual offset, including DST.
function zonedTime(day: string, minutes: number) {
	const [year, month, date] = day.split("-").map(Number);
	const wall = Date.UTC(year, month - 1, date, 0, minutes);
	let utc = wall;
	for (let i = 0; i < 4; i++) {
		const parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: zone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		}).formatToParts(utc);
		const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
		const displayed = Date.UTC(
			+p.year,
			+p.month - 1,
			+p.day,
			+p.hour,
			+p.minute,
			+p.second,
		);
		utc += wall - displayed;
	}
	return utc;
}
export function bounds(day: string, shift: ShiftId) {
	const definition = shifts.find((item) => item.id === shift) ?? shifts[0];
	return {
		start: zonedTime(day, definition.start),
		end: zonedTime(day, definition.end),
	};
}
export function report(
	events: Event[],
	agentId: string,
	start: number,
	end: number,
	now: number,
) {
	const stop = Math.min(end, now);
	const ordered = events
		.filter((event) => event.agentId === agentId)
		.sort((a, b) => a.at - b.at);
	let state: Status | "unknown" = "unknown";
	let cursor = start;
	const totals = { on: 0, off: 0, unknown: 0 };
	for (const event of ordered) {
		if (event.at <= start) {
			state = event.status;
			continue;
		}
		if (event.at > stop) break;
		totals[state] += Math.max(0, event.at - cursor);
		cursor = event.at;
		state = event.status;
	}
	totals[state] += Math.max(0, stop - cursor);
	return totals;
}
export function duration(ms: number) {
	const minutes = Math.floor(ms / 60000);
	return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`;
}
