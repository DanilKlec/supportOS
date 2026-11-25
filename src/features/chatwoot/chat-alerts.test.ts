import { expect, test } from "vitest";
import type { ChatwootConversation } from "@/services/chatwoot.service";
import { getChatAlerts } from "./chat-alerts";

test("alerts for newly assigned chats and recent incoming messages, independent of page focus", () => {
	const now = 1_795_000_000_000;
	const chat = (id: number, messageId: number, type = 0, note = false): ChatwootConversation => ({
		id,
		status: "open",
		last_non_activity_message: {
			id: messageId,
			message_type: type,
			created_at: now / 1000 - 1,
			private: note,
		},
	});
	const initial = getChatAlerts(null, [chat(1, 10), chat(2, 20), chat(3, 30)], now);
	expect(initial.alerts).toEqual([]);
	const next = getChatAlerts(initial.next, [
		chat(1, 11), chat(2, 21, 1), chat(3, 31, 0, true), chat(4, 40),
	], now);
	expect(next.alerts).toEqual([
		{ key: "1:message:11", assignment: false },
		{ key: "4:assigned", assignment: true },
	]);
	expect(getChatAlerts(next.next, [chat(1, 11), chat(4, 40)], now).alerts).toEqual([]);
});
