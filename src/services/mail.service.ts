import { authenticatedFetch } from "./authenticated-fetch";

export type Mailbox = { id: string; address: string; provider: "gmail" };
export type MailStats = {
	id: string;
	unread: number | null;
	recentId?: string;
	recentDate?: number | null;
	reconnect?: boolean;
};
export type MailLabel = { id: string; name: string; type: "system" | "user" };
export type StaffMember = { id: string; email: string; display_name: string };
export type MailRow = {
	id: string;
	threadId: string;
	draftId?: string;
	labels: string[];
	count: number;
	date: number;
	from: string;
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	snippet: string;
	replyTo: string | null;
	messageId: string | null;
	inReplyTo?: string | null;
};
export type MailAttachment = {
	id: string;
	name: string;
	type: string;
	size: number;
};
export type MailMessage = Omit<MailRow, "count"> & {
	text: string;
	html: string;
	attachments: MailAttachment[];
	clipped?: boolean;
};
export type MailDraft = {
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	text: string;
	threadId?: string;
	replyId?: string;
	draftId?: string;
	attachments: { name: string; data: string }[];
	preservedAttachments?: boolean;
};

async function request<T>(
	action: string,
	query: Record<string, string> = {},
	body?: unknown,
	signal?: AbortSignal,
): Promise<T> {
	const response = await authenticatedFetch(
		`/api/mail?${new URLSearchParams({ action, ...query })}`,
		body === undefined
			? {
					signal: signal
						? AbortSignal.any([signal, AbortSignal.timeout(55_000)])
						: AbortSignal.timeout(55_000),
				}
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
	);
	const result = await response.json().catch(() => ({}));
	if (!response.ok)
		throw Object.assign(
			new Error(result.error ?? "Не удалось загрузить почту."),
			{ code: result.code, status: response.status },
		);
	return result;
}

export const mailService = {
	list: (signal?: AbortSignal) =>
		request<{ configured: boolean; admin: boolean; mailboxes: Mailbox[] }>(
			"list",
			{},
			undefined,
			signal,
		),
	stats: (signal?: AbortSignal) =>
		request<{ stats: MailStats[] }>("stats", {}, undefined, signal),
	start: (address: string) =>
		request<{ url: string; state: string }>("oauth-start", {}, { address }),
	finish: (code: string, state: string) =>
		request<Mailbox>("oauth-finish", {}, { code, state }),
	members: (box: string) =>
		request<{ members: StaffMember[] }>("members", { box }),
	grant: (box: string, email: string) => request("grant", { box }, { email }),
	revoke: (box: string, userId: string) =>
		request("revoke", { box }, { userId }),
	labels: (box: string, signal?: AbortSignal) =>
		request<{ labels: MailLabel[] }>("labels", { box }, undefined, signal),
	folder: (
		box: string,
		label: string,
		q: string,
		page: string,
		signal?: AbortSignal,
	) =>
		request<{ rows: MailRow[]; next: string | null }>(
			"folder",
			{ box, label, q, page },
			undefined,
			signal,
		),
	thread: (box: string, id: string, before = "", signal?: AbortSignal) =>
		request<{ id: string; messages: MailMessage[]; before: string | null }>(
			"thread",
			{ box, id, before },
			undefined,
			signal,
		),
	draft: (box: string, id: string) =>
		request<{ id: string; message: MailMessage }>("draft", { box, id }),
	change: (box: string, id: string, operation: string, label?: string) =>
		request("change-thread", { box }, { id, operation, label }),
	deleteDraft: (box: string, id: string) =>
		request("delete-draft", { box }, { id }),
	save: (box: string, draft: MailDraft) =>
		request<{ id: string }>("save-draft", { box }, draft),
	send: (box: string, draft: MailDraft) => request("send", { box }, draft),
	attachment: (box: string, message: string, id: string) =>
		request<{ data: string }>("attachment", { box, message, id }),
};
