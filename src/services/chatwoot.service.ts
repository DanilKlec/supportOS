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
		file_name?: string;
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
	max_active_chats?: number;
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
	widget_color?: string | null;
	widget_position?: "left" | "right";
	widget_type?: "standard" | "expanded_bubble";
	widget_locale?: string;
	launcher_title?: string;
	welcome_title?: string | null;
	welcome_tagline?: string | null;
	greeting_enabled?: boolean;
	greeting_message?: string | null;
	website_token?: string | null;
	operator_ids?: number[];
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

export type ChatwootCustomAttributeDefinition = {
	id: number;
	attribute_display_name: string;
	attribute_key: string;
	attribute_display_type: number;
	attribute_description?: string | null;
	attribute_values?: string[] | null;
	attribute_model: 0 | 1;
};

export type ConversationSearch = {
	scope: "queue" | "mine" | "history" | "active";
	status?: string;
	page?: number;
	inboxId?: number;
	agentId?: number;
	label?: string;
	from?: string;
	to?: string;
	query?: string;
};

export type ChatwootUpload = {
	name: string;
	type: string;
	contentBase64: string;
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
			hasMore?: boolean;
		}>(
			"conversations",
			undefined,
			`&scope=${options.scope}&status=${encodeURIComponent(options.status ?? "open")}&page=${options.page ?? 1}${options.inboxId ? `&inbox_id=${options.inboxId}` : ""}${options.agentId ? `&agent_id=${options.agentId}` : ""}${options.label ? `&label=${encodeURIComponent(options.label)}` : ""}${options.from ? `&from=${encodeURIComponent(options.from)}` : ""}${options.to ? `&to=${encodeURIComponent(options.to)}` : ""}${options.query ? `&q=${encodeURIComponent(options.query)}` : ""}`,
		),
	conversationCounts: (inboxId?: number) =>
		request<{ queueCount: number; mineCount: number | null; activeCount: number | null }>("conversation-counts", undefined, inboxId ? `&inbox_id=${inboxId}` : ""),
	conversation: (id: number) =>
		request<{
			id?: number;
			messages?: ChatwootMessage[];
			payload?: { messages?: ChatwootMessage[] };
			meta?: ChatwootConversation["meta"];
		}>("conversation", undefined, `&id=${id}`),
	conversationMessages: (id: number, before?: number) =>
		request<{
			payload?: ChatwootMessage[];
			messages?: ChatwootMessage[];
			data?: { payload?: ChatwootMessage[] };
		}>("messages", undefined, `&id=${id}${before ? `&before=${before}` : ""}`),
	inboxDirectory: () =>
		request<{
			agents: ChatwootAgent[];
			inboxes: ChatwootInbox[];
			teams: ChatwootTeam[];
			presence: Array<{
				chatwoot_agent_id: number;
				accepting: boolean;
				max_active_chats: number;
				heartbeat_at: string;
			}>;
		}>("agents"),
	websiteInboxes: () =>
		request<{ baseUrl: string; inboxes: ChatwootWebsiteInbox[] }>(
			"website-inboxes",
		),
	websiteInboxMembers: (inboxId: number) =>
		request<{ operatorIds: number[] }>(
			"website-inbox-members",
			undefined,
			`&inboxId=${inboxId}`,
		),
	saveWebsiteSource: (source: {
		id?: number;
		name: string;
		websiteUrl: string;
		allowedDomains: string[];
		widgetColor: string;
		widgetPosition: "left" | "right";
		widgetType: "standard" | "expanded_bubble";
		widgetLocale: string;
		launcherTitle: string;
		welcomeTitle: string;
		welcomeTagline: string;
		greetingEnabled: boolean;
		greetingMessage: string;
		operatorIds: number[];
	}) =>
		request<{ inbox: ChatwootWebsiteInbox }>("website-source", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(source),
		}),
	deleteWebsiteSource: (inboxId: number) =>
		request("website-source", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ inboxId }),
		}),
	setWebsiteDomains: (inboxId: number, domains: string[]) =>
		request<ChatwootWebsiteInbox>("website-domains", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ inboxId, domains }),
		}),
	setAgentCapacity: (agentId: number, maxActiveChats: number) =>
		request<{ agentId: number; maxActiveChats: number }>("agent-capacity", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ agentId, maxActiveChats }),
		}),
	presence: (accepting?: boolean) =>
		request<{
			current: { agentId: number; accepting: boolean; maxActiveChats: number; heartbeatAt: string };
			team: Array<{ agentId: number; accepting: boolean; maxActiveChats: number; active: boolean }>;
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
	sendMessage: (conversationId: number, content: string, isPrivate: boolean, attachments: ChatwootUpload[] = []) =>
		request("message", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, content, private: isPrivate, attachments }),
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
	customAttributes: (model: 0 | 1) =>
		request<{ payload?: ChatwootCustomAttributeDefinition[] }>(
			"custom-attributes",
			undefined,
			`&model=${model}`,
		),
	saveCustomAttribute: (definition: Omit<ChatwootCustomAttributeDefinition, "id"> & { id?: number }) =>
		request("custom-attributes", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(definition),
		}),
	deleteCustomAttribute: (id: number, model: 0 | 1) =>
		request("custom-attributes", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id, model }),
		}),
	setCustomAttributeValues: (values: {
		conversationId?: number;
		contactId?: number;
		attributes: Record<string, string | number | boolean | null>;
	}) =>
		request("custom-attribute-values", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(values),
		}),
};
