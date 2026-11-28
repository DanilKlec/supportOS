import type { MailLayout } from "../../shared/mail-layout.js";
import { authenticatedFetch } from "./authenticated-fetch";

export type MailboxIcon = {
	text: string;
	tone: number;
	color?: string;
	image?: string;
};
export type Mailbox = {
	id: string;
	address: string;
	provider: "gmail";
	icon?: MailboxIcon | null;
};
export type MailStats = {
	id: string;
	unread: number | null;
	recentId?: string;
	recentDate?: number | null;
	reconnect?: boolean;
};
export type MailLabelColor = { backgroundColor: string; textColor: string };
export type MailLabel = {
	id: string;
	name: string;
	type: "system" | "user";
	color?: MailLabelColor;
};
export type MailLabelChanges = { add: string[]; remove: string[] };
export type MailTemplateScope = "shared" | "personal";
export type MailTemplateSummary = {
	id: string;
	title: string;
	subject: string;
	revision: number;
};
export type MailTemplate = MailTemplateSummary & {
	body: string;
	html?: string | null;
	layout?: MailLayout | null;
};
export type MailTemplateInput = Pick<
	MailTemplate,
	"title" | "subject" | "body" | "html" | "layout"
> &
	Partial<Pick<MailTemplate, "id" | "revision">>;
export type StaffMember = { id: string; email: string; display_name: string };
export type MailRow = {
	id: string;
	threadId: string;
	draftId?: string;
	labels: string[];
	count: number;
	date: number;
	from: string;
	staffSender?: string;
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
	html?: string;
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
	folderCounts: (box: string, ids: string, signal?: AbortSignal) =>
		request<{ counts: Record<string, number | null> }>(
			"folder-counts",
			{ box, ids },
			undefined,
			signal,
		),
	start: (address: string) =>
		request<{ url: string; state: string }>("oauth-start", {}, { address }),
	finish: (code: string, state: string, icon?: MailboxIcon | null) =>
		request<Mailbox>("oauth-finish", {}, { code, state, icon }),
	setIcon: (box: string, icon: MailboxIcon | null) =>
		request<Mailbox>("set-mailbox-icon", { box }, { icon }),
	members: (box: string) =>
		request<{ members: StaffMember[] }>("members", { box }),
	grant: (box: string, email: string) => request("grant", { box }, { email }),
	revoke: (box: string, userId: string) =>
		request("revoke", { box }, { userId }),
	templates: (
		box: string,
		scope: MailTemplateScope,
		q: string,
		offset: number,
		signal?: AbortSignal,
	) =>
		request<{ templates: MailTemplateSummary[]; next: number | null }>(
			"templates",
			{ box, scope, q, offset: String(offset) },
			undefined,
			signal,
		),
	template: (
		box: string,
		scope: MailTemplateScope,
		id: string,
		signal?: AbortSignal,
	) =>
		request<MailTemplate>("templates", { box, scope, id }, undefined, signal),
	importTemplateHtml: (box: string, html: string) =>
		request<{ html: string }>("import-template-html", { box }, { html }),
	saveTemplate: (
		box: string,
		scope: MailTemplateScope,
		draft: MailTemplateInput,
	) => request<MailTemplate>("save-template", { box, scope }, draft),
	deleteTemplate: (
		box: string,
		scope: MailTemplateScope,
		{ id, revision }: MailTemplateSummary,
	) => request("delete-template", { box, scope }, { id, revision }),
	labels: (box: string, signal?: AbortSignal) =>
		request<{ labels: MailLabel[] }>("labels", { box }, undefined, signal),
	labelColors: (box: string, ids: string, signal?: AbortSignal) =>
		request<{ colors: Record<string, MailLabelColor | null> }>(
			"label-colors",
			{ box, ids },
			undefined,
			signal,
		),
	createLabel: (box: string, name: string, color?: MailLabelColor) =>
		request<MailLabel>("create-label", { box }, { name, color }),
	editLabel: (box: string, id: string, name: string, color?: MailLabelColor) =>
		request<MailLabel>("edit-label", { box }, { id, name, color }),
	deleteLabel: (box: string, id: string) =>
		request("delete-label", { box }, { id }),
	setLabelColor: (box: string, id: string, color: MailLabelColor) =>
		request<MailLabel>("set-label-color", { box }, { id, color }),
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
	change: (
		box: string,
		id: string,
		operation: string,
		label?: string,
		source?: string,
		labels?: MailLabelChanges,
	) =>
		request(
			"change-thread",
			{ box },
			{ id, operation, label, source, ...labels },
		),
	deleteDraft: (box: string, id: string) =>
		request("delete-draft", { box }, { id }),
	save: (box: string, draft: MailDraft) =>
		request<{ id: string }>("save-draft", { box }, draft),
	send: (box: string, draft: MailDraft) =>
		request<{ id: string; staffSenderMissing?: boolean }>(
			"send",
			{ box },
			draft,
		),
	attachment: (box: string, message: string, id: string) =>
		request<{ data: string }>("attachment", { box, message, id }),
};
