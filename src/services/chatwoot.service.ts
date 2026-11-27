import { authenticatedFetch } from "@/services/authenticated-fetch";

export type ChatwootStatus = "open" | "pending" | "resolved" | "snoozed";
export type ChatwootPriority = "low" | "medium" | "high" | "urgent";
type SiteActivityMetrics = { online: number | null; active: number | null; queue: number | null };
export type ChatTeamStatus = { online: number; accepting: number; bots: number | null };
export type ChatSiteActivity = SiteActivityMetrics & {
	updatedAt: string;
	sites: Array<SiteActivityMetrics & { id: number; name: string; url?: string | null }>;
};
export type ActiveChatMode = "all" | "open" | "pending" | "watching";
export type ChatwootConversationCounts = {
	queueCount: number | null;
	mineCount: number | null;
	activeCount: number | null;
	openCount: number | null;
	pendingCount: number | null;
};
export type ActiveChatSort = "last_activity_at_desc" | "last_activity_at_asc" | "created_at_asc" | "created_at_desc" | "priority_desc" | "waiting_since_asc";
export type ActiveChatRow = {
	id: number; inboxId?: number; player?: string; email?: string; agent?: string; team?: string; project?: string;
	status: ChatwootStatus; priority?: ChatwootPriority; startedAt?: number; activityAt?: number; waitingSince?: number;
	country?: string; region?: string; city?: string; referrer?: string; device?: string; lastPage?: string; visits?: number; tags: string[];
};
export type ActiveChatFilters = {
	mode: ActiveChatMode; sort: ActiveChatSort; page: number;
	inbox: string; agent: string; team: string; label: string; priority: string; search: string;
};
export type ChatwootCapabilities = {
	role: "support" | "shift" | "qc" | "admin" | "creator";
	supervise: boolean;
	manageRouting: boolean;
	manageProjects: boolean;
	manageWebhooks: boolean;
	deleteProjects: boolean;
	manageAllChats: boolean;
	reviewNotes: boolean;
};

export type ChatwootConversation = {
	id: number;
	status: string;
	priority?: ChatwootPriority | null;
	snoozed_until?: string | number | null;
	access?: { read: boolean; write: boolean; note: boolean; take: boolean; seeIp: boolean };
	coachRecipient?: { id: number; name: string | null } | null;
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
		team?: { id: number; name?: string };
	};
	messages?: ChatwootMessage[];
	last_non_activity_message?: ChatwootMessage;
	additional_attributes?: Record<string, unknown>;
	custom_attributes?: Record<string, unknown>;
	visitor?: { page?: string; ip?: string; city?: string; country?: string; browser?: string; device?: string; platform?: string; login?: string };
	crm?: "adwa" | "whitelabels" | "vortexino" | null;
	created_at?: number;
	updated_at?: number;
	waiting_since?: number | null;
	first_reply_created_at?: number | string | null;
};

export type ChatwootMessage = {
	id: number;
	content?: string;
	message_type?: number | string;
	private?: boolean;
	content_attributes?: {
		deleted?: boolean;
		source_language?: string;
		translation_pending?: boolean;
		translation_failed?: boolean;
	};
	created_at?: number;
	sender?: { name?: string; available_name?: string; type?: string; avatar_url?: string; thumbnail?: string };
	attachments?: Array<{
		data_url?: string;
		file_name?: string;
		file_type?: string;
		file_size?: number;
		extension?: string;
	}>;
};

export type ChatwootCoachingNote = {
	id: string;
	author: string;
	content: string;
	createdAt: string;
	own: boolean;
};

export type ChatwootAgent = {
	id: number;
	name: string;
	available_name?: string;
	thumbnail?: string;
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
export type ChatwootCapacityPolicy = {
	id: number;
	name: string;
	assigned_agent_count: number;
	inbox_capacity_limits: Array<{ id: number; inbox_id: number; conversation_limit: number }>;
};
export type ChatDirectoryKind = "chat-team" | "chat-label";
export type ChatDirectoryItem = { id: number; name?: string; title?: string; description?: string; color?: string; show_on_sidebar?: boolean };
export type ChatTagScope = "b2b" | "b2c" | "all";
export type ChatwootInbox = { id: number; name: string; channel_type?: string; website_url?: string | null; tagScope?: ChatTagScope };

export type ChatwootOperations = {
	revision: string;
	agents: Record<number, { skills: string[]; zone: string; shifts: { day: number; start: string; end: string }[] }>;
	inboxes: Record<number, { skills: string[]; responseMinutes: number; crm: NonNullable<ChatwootConversation["crm"]> | ""; tagScope?: ChatTagScope | "" }>;
};

export type ChatwootSupervisor = {
	queue: number | null;
	active: number | null;
	truncated: boolean;
	agents: { id: number; online: boolean; accepting: boolean; onShift: boolean; used: number; limit: number }[];
	sla: { id: number; inboxId: number; agentId: number | null; seconds: number; goal: number; overdue: boolean }[];
};
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
export type ChatwootContactFields = Partial<Pick<ChatwootContact, "name" | "email" | "phone_number">>;
export type ChatwootContactHistory = Pick<ChatwootConversation, "id" | "inbox_id" | "status" | "created_at">[];
export type ChatwootContactNote = { id: number; content: string; created_at: number; author?: string };

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
	email?: string;
	query?: string;
};

export type ChatwootUpload = {
	name: string;
	type: string;
	contentBase64: string;
};

export type ChatwootAgentProfile = {
	connection: "managed" | "personal" | "required";
	name: string;
	displayName: string;
	avatarUrl: string;
};

export async function chatwootFileBase64(file: File) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	return btoa(binary);
}

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
	agentProfile: (signal?: AbortSignal) => request<ChatwootAgentProfile>("agent-profile", { signal }),
	connectAgentProfile: (token: string) =>
		request<ChatwootAgentProfile>("agent-profile", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token }),
		}),
	disconnectAgentProfile: () =>
		request<{ ok: boolean }>("agent-profile", { method: "DELETE" }),
	updateAgentProfile: async (displayName: string, file: File | null) =>
		request<ChatwootAgentProfile>("agent-profile", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ displayName, avatar: file ? await chatwootFileBase64(file) : undefined }),
		}),
	health: () =>
		request<{
			configured: boolean;
			profileUrl?: string;
			lastWebhookAt?: string | null;
			nativeAutoTranslate?: boolean;
			capabilities?: ChatwootCapabilities;
			inboxes?: { payload?: Array<{ inbox: ChatwootInbox }> };
		}>("health"),
	teamStatus: () => request<ChatTeamStatus>("team-status"),
	siteActivity: () => request<ChatSiteActivity>("site-activity"),
	conversations: (options: ConversationSearch, signal?: AbortSignal) => {
		const params = new URLSearchParams({
			scope: options.scope,
			status: options.status ?? "open",
			page: String(options.page ?? 1),
		});
		if (options.inboxId) params.set("inbox_id", String(options.inboxId));
		if (options.agentId) params.set("agent_id", String(options.agentId));
		if (options.label) params.set("label", options.label);
		if (options.from) params.set("from", options.from);
		if (options.to) params.set("to", options.to);
		if (options.email) params.set("email", options.email);
		if (options.query) params.set("q", options.query);
		return request<{
			data?: { payload?: ChatwootConversation[]; meta?: unknown };
			payload?: ChatwootConversation[];
			hasMore?: boolean;
			searchTruncated?: boolean;
		}>(
			"conversations",
			{ signal },
			`&${params}`,
		);
	},
	conversationCounts: (inboxId?: number) =>
		request<ChatwootConversationCounts>("conversation-counts", undefined, inboxId ? `&inbox_id=${inboxId}` : ""),
	conversation: (id: number) =>
		request<ChatwootConversation>("conversation", undefined, `&id=${id}`),
	activeOverview: (filters: ActiveChatFilters, signal?: AbortSignal) => {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(filters)) if (value !== "") params.set(key, String(value));
		return request<{ rows: ActiveChatRow[]; total: number | null; hasMore: boolean; searchTruncated: boolean }>("active-overview", { signal }, `&${params}`);
	},
	supervision: () => request<{ ids: number[] }>("supervision"),
	setSupervision: (conversationId: number, enabled: boolean) => request<{ id: number; watching: boolean }>("supervision", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, enabled }),
	}),
	coachingNotes: (conversationId: number, signal: AbortSignal) => request<{ notes: ChatwootCoachingNote[] }>(
		"coaching-notes", { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) }, `&id=${conversationId}`,
	),
	sendCoachingNote: (conversationId: number, note: { noteId: string; recipientAgentId: number; content: string }) =>
		request<ChatwootCoachingNote>("coaching-notes", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, ...note }),
		}),
	operations: () => request<ChatwootOperations>("chat-operations"),
	supervisor: () => request<ChatwootSupervisor>("chat-supervisor"),
	saveOperations: (settings: ChatwootOperations) => request<ChatwootOperations>("chat-operations", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(settings),
	}),
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
	webhookSettings: () =>
		request<{ configured: boolean; lastReceivedAt: string | null }>("webhook-secret"),
	saveWebhookSecret: (signingSecret: string) =>
		request<{ configured: boolean }>("webhook-secret", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ signingSecret }),
		}),
	connectWebhook: () =>
		request<{ configured: boolean }>("webhook-secret", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ connect: true }),
		}),
	websiteInboxMembers: (inboxId: number) =>
		request<{ operatorIds: number[]; operatorTeamIds: number[] }>(
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
		operatorTeamIds: number[];
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
	inviteAgent: (email: string, name: string) => request<{ alreadyLinked: boolean }>("invite-agent", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name }),
	}),
	capacityPolicies: () => request<{ policies: ChatwootCapacityPolicy[]; unavailable?: boolean }>("chatwoot-capacity"),
	setInboxCapacity: (policyId: number, inboxId: number, limit: number) => request<{ limit: number }>("chatwoot-capacity", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyId, inboxId, limit }),
	}),
	setAgentCapacity: (agentId: number, maxActiveChats: number) =>
		request<{ agentId: number; maxActiveChats: number }>("agent-capacity", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ agentId, maxActiveChats }),
		}),
	presence: (accepting?: boolean) =>
		request<{
			current: { agentId: number; accepting: boolean; maxActiveChats: number; heartbeatAt: string; handoffPending: boolean };
			team: Array<{ agentId: number; accepting: boolean; maxActiveChats: number; active: boolean }>;
			onlineCount: number;
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
	contact: async (id: number, conversationId: number) => {
		const result = await request<ChatwootContact | { payload: ChatwootContact }>(
			"contact", undefined, `&id=${id}&conversationId=${conversationId}`,
		);
		return "payload" in result ? result.payload : result;
	},
	contactHistory: (id: number, conversationId: number) => request<{ payload: ChatwootContactHistory }>(
		"contact-history", undefined, `&id=${id}&conversationId=${conversationId}`,
	),
	contactDirectory: (query: string, page: number, signal?: AbortSignal) => request<{
		payload: ChatwootContact[];
		hasMore: boolean;
	}>("contact-directory", { signal }, `&${new URLSearchParams({ q: query, page: String(page) })}`),
	directoryContactHistory: (id: number, signal?: AbortSignal) => request<{ payload: ChatwootContactHistory }>(
		"directory-contact-history", { signal }, `&id=${id}`,
	),
	directoryContactNotes: (id: number, signal?: AbortSignal) => request<{ notes: ChatwootContactNote[] }>(
		"directory-contact-notes", { signal }, `&id=${id}`,
	),
	addContactNote: (contactId: number, content: string) => request<ChatwootContactNote>("directory-contact-notes", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, content }),
	}),
	mergeContacts: (baseId: number, duplicateId: number) => request<{ ok: true }>("directory-contact-merge", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseId, duplicateId, confirmed: true }),
	}),
	updateContact: (contactId: number, fields: ChatwootContactFields, conversationId?: number) => request<ChatwootContact>(
		conversationId === undefined ? "contact-directory" : "contact-profile", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ contactId, conversationId, fields }),
		},
	),
	labels: () =>
		request<
			| { payload?: Array<{ title?: string; name?: string; color?: string }> }
			| Array<{ title?: string; name?: string; color?: string }>
		>("labels"),
	inboxes: () =>
		request<{ payload?: ChatwootInbox[] } | ChatwootInbox[]>("inboxes"),
	sendMessage: (conversationId: number, content: string, isPrivate: boolean, attachments: ChatwootUpload[] = [], autoTranslate?: boolean) =>
		request("message", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, content, private: isPrivate, attachments, autoTranslate }),
		}),
	setStatus: (
		conversationId: number,
		status: ChatwootStatus,
		snoozedUntil?: number,
	) =>
		request("status", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, status, snoozedUntil }),
		}),
	assign: (conversationId: number, assigneeId: number | null) =>
		request("assign", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, assigneeId }),
		}),
	assignTeam: (conversationId: number, teamId: number | null) => request("assign", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, teamId }),
	}),
	setPriority: (conversationId: number, priority: ChatwootPriority | null) => request("priority", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, priority }),
	}),
	directoryItems: (kind: ChatDirectoryKind) => request<{ payload: ChatDirectoryItem[] }>(kind),
	teamMembers: (id: number) => request<{ memberIds: number[] }>("chat-team", undefined, `&id=${id}`),
	saveDirectoryItem: (kind: ChatDirectoryKind, value: { id?: number; name: string; description: string; color?: string; showOnSidebar?: boolean }) => request(kind, {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
	}),
	saveTeamMembers: (id: number, memberIds: number[]) => request("chat-team", {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, memberIds }),
	}),
	deleteDirectoryItem: (kind: ChatDirectoryKind, id: number) => request(kind, {
		method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
	}),
	take: (conversationId: number) => request("take", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ conversationId }),
	}),
	setLabels: (conversationId: number, labels: string[]) =>
		request("labels", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, labels }),
		}),
	blockContact: (conversationId: number, contactId: number, blocked: boolean) =>
		request("contact-block", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ conversationId, contactId, blocked }),
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
