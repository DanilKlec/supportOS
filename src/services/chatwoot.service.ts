import { authenticatedFetch } from "@/services/authenticated-fetch";

export type ChatwootConversation = {
	id: number;
	status: string;
	inbox_id?: number;
	labels?: string[];
	contact_id?: number;
	meta?: {
		sender?: {
			id?: number;
			name?: string;
			email?: string;
			identifier?: string;
			phone_number?: string;
			avatar_url?: string;
			blocked?: boolean;
			additional_attributes?: Record<string, unknown>;
			custom_attributes?: Record<string, unknown>;
		};
		assignee?: {
			id: number;
			name?: string;
			email?: string;
			available_name?: string;
		};
		inbox?: { id: number; name?: string; channel_type?: string };
	};
	messages?: ChatwootMessage[];
	last_non_activity_message?: ChatwootMessage;
	additional_attributes?: Record<string, unknown>;
	custom_attributes?: Record<string, unknown>;
	created_at?: number;
	updated_at?: number;
};

export type ChatwootMessage = {
	id: number;
	content?: string;
	message_type?: number | string;
	private?: boolean;
	created_at?: number;
	sender?: { name?: string; type?: string; avatar_url?: string };
	attachments?: Array<{
		data_url?: string;
		file_type?: string;
		file_size?: number;
		extension?: string;
	}>;
};

export type ChatwootAgent = {
	id: number;
	name: string;
	email?: string;
	role?: string;
	availability_status?: string;
};
export type ChatwootTeam = {
	id: number;
	name: string;
	description?: string;
	allow_auto_assign?: boolean;
	agents?: ChatwootAgent[];
};
export type ChatwootInbox = { id: number; name: string; channel_type?: string };
export type ChatwootWebsiteInbox = {
	id: number;
	name: string;
	website_url?: string | null;
	allowed_domains?: string | null;
};
export type ChatwootContact = {
	id: number;
	name?: string | null;
	email?: string | null;
	phone_number?: string | null;
	identifier?: string | null;
	blocked?: boolean;
	additional_attributes?: Record<string, unknown>;
	custom_attributes?: Record<string, unknown>;
	created_at?: string | number;
	last_activity_at?: string | number;
	label_list?: string[];
};

export type ConversationSearch = {
	scope: "queue" | "mine" | "history" | "supervised";
	status?: string;
	page?: number;
	inboxId?: number;
	agentId?: number;
	label?: string;
	from?: string;
	to?: string;
	query?: string;
};

async function request<T>(
	action: string,
	init?: RequestInit,
	query = "",
): Promise<T> {
	const response = await authenticatedFetch(
		`/api/chatwoot?action=${action}${query}`,
		init,
	);
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.error ?? "Ошибка Chatwoot");
	return data as T;
}

export const chatwootService = {
	health: () =>
		request<{
			configured: boolean;
			profile?: { id: number; name: string; email: string };
			inboxes?: { payload?: Array<{ inbox: ChatwootInbox }> };
		}>("health"),
	conversations: (options: ConversationSearch) =>
		request<{
			data?: { payload?: ChatwootConversation[]; meta?: unknown };
			payload?: ChatwootConversation[];
		}>(
			"conversations",
			undefined,
			`&scope=${options.scope}&status=${encodeURIComponent(options.status ?? "open")}&page=${options.page ?? 1}${options.inboxId ? `&inbox_id=${options.inboxId}` : ""}${options.agentId ? `&agent_id=${options.agentId}` : ""}${options.label ? `&label=${encodeURIComponent(options.label)}` : ""}${options.from ? `&from=${encodeURIComponent(options.from)}` : ""}${options.to ? `&to=${encodeURIComponent(options.to)}` : ""}${options.query ? `&q=${encodeURIComponent(options.query)}` : ""}`,
		),
	conversation: (id: number) =>
		request<{
			id?: number;
			messages?: ChatwootMessage[];
			payload?: { messages?: ChatwootMessage[] };
			meta?: ChatwootConversation["meta"];
		}>("conversation", undefined, `&id=${id}`),
	inboxDirectory: () =>
		request<{
			agents: ChatwootAgent[];
			inboxes: ChatwootInbox[];
			teams: ChatwootTeam[];
			presence: Array<{
				chatwoot_agent_id: number;
				accepting: boolean;
				heartbeat_at: string;
			}>;
		}>("agents"),
	websiteInboxes: () =>
		request<{ inboxes: ChatwootWebsiteInbox[] }>("website-inboxes"),
	setWebsiteDomains: (inboxId: number, domains: string[]) =>
		request<ChatwootWebsiteInbox>("website-domains", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ inboxId, domains }),
		}),
	presence: (accepting?: boolean) =>
		request<{
			current: { agentId: number; accepting: boolean; heartbeatAt: string };
			team: Array<{ agentId: number; accepting: boolean; active: boolean }>;
			routing: { assigned: number };
		}>(
			"presence",
			accepting === undefined
				? undefined
				: {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ accepting }),
					},
		),
	contact: async (id: number) => {
		const result = await request<
			ChatwootContact | { payload?: ChatwootContact }
		>("contact", undefined, `&id=${id}`);
		return "payload" in result && result.payload ? result.payload : result;
	},
	labels: () =>
		request<
			| { payload?: Array<{ title?: string; name?: string; color?: string }> }
			| Array<{ title?: string; name?: string; color?: string }>
		>("labels"),
	inboxes: () =>
		request<{ payload?: ChatwootInbox[] } | ChatwootInbox[]>("inboxes"),
	sendMessage: (conversationId: number, content: string, isPrivate: boolean) =>
		request("message", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, content, private: isPrivate }),
		}),
	setStatus: (
		conversationId: number,
		status: "open" | "resolved" | "snoozed",
	) =>
		request("status", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, status }),
		}),
	assign: (conversationId: number, assigneeId: number | null) =>
		request("assign", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, assigneeId }),
		}),
	setLabels: (conversationId: number, labels: string[]) =>
		request("labels", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, labels }),
		}),
	blockContact: (contactId: number, blocked: boolean) =>
		request("contact-block", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ contactId, blocked }),
		}),
};
