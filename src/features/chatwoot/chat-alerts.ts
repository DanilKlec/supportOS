import type { ChatwootConversation } from "@/services/chatwoot.service";

export const CHAT_SOUND_PREFERENCE = "supportos:chatwoot:sound";
export const assignedChats = { scope: "mine", status: "open", page: 1 } as const;
export const assignedChatsKey = ["chatwoot", "conversations", assignedChats] as const;

export function getChatAlerts(
	previous: Map<number, number | undefined> | null,
	rows: ChatwootConversation[],
	now: number,
) {
	const next = new Map(previous ?? []);
	const alerts: Array<{ key: string; assignment: boolean }> = [];
	for (const row of rows) {
		const message = row.last_non_activity_message;
		const assignment = !next.has(row.id);
		const changed =
			message?.id !== undefined && message.id !== next.get(row.id);
		next.set(row.id, message?.id);
		if (!previous) continue;
		if (assignment) {
			alerts.push({ key: `${row.id}:assigned`, assignment: true });
			continue;
		}
		const timestamp = Number(message?.created_at);
		const age = now - (timestamp > 1e12 ? timestamp : timestamp * 1000);
		if (
			changed &&
			!message?.private &&
			[0, "0", "incoming"].includes(message?.message_type ?? "") &&
			age < 120_000
		)
			alerts.push({
				key: `${row.id}:message:${message?.id}`,
				assignment: false,
			});
	}
	return { next, alerts };
}
