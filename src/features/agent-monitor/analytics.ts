import {
	currentStatus,
	type LiveAgent,
	type Observation,
	type RoutingStatus,
} from "./live-model";

export function agentEmail(agent: Pick<LiveAgent, "id">) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agent.id) ? agent.id : "";
}
export function isOnline(agent: LiveAgent, now: number) {
	const status = currentStatus(agent, now);
	return status === "on" || status === "off";
}
export function matchesAgent(agent: LiveAgent, search: string) {
	return `${agent.name} ${agent.id}`
		.toLocaleLowerCase()
		.includes(search.trim().toLocaleLowerCase());
}
export type StatusEvent = Observation & {
	previous?: RoutingStatus;
	action: string;
	toggle: boolean;
};
export function statusEvents(observations: Observation[]): StatusEvent[] {
	const previous = new Map<string, RoutingStatus>();
	const unique = [
		...new Map(observations.map((row) => [row.id, row])).values(),
	];
	return unique
		.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id)
		.map((row) => {
			const before = previous.get(row.agent_id);
			previous.set(row.agent_id, row.status);
			const toggle =
				(before === "on" && row.status === "off") ||
				(before === "off" && row.status === "on");
			const action = toggle
				? row.status === "off"
					? "Приём выключен"
					: "Приём включён"
				: before === undefined
					? "Первое доступное наблюдение"
					: row.status === "offline"
						? "Агент не в сети"
						: before === "offline" &&
								(row.status === "on" || row.status === "off")
							? "Агент появился в сети"
							: "Обнаружен статус";
			return { ...row, previous: before, action, toggle };
		});
}
