import { requireUser } from '../_auth.js';
import { config, db } from '../agent-monitor/_server.js';
import { can } from '../../shared/access.js';
import { addressOf, completeGoogle, composeRaw, gmail, googleConfig, mailboxToken, mailError, mailMetadata, readMessage, startGoogle, validAddress } from './google.js';

const mailboxFields = 'id,address,provider,updated_at';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const idPattern = /^[a-z0-9_-]{1,1600}$/i;
const pageSize = 16;
const statsCache = new Map();

function safeId(raw) {
	if (typeof raw !== 'string' || !idPattern.test(raw)) throw mailError('Некорректный ID письма или ярлыка.');
	return raw;
}

const safeAttachmentId = (raw) => typeof raw === 'string' && /^inline-\d+(?:\.\d+){0,16}$/.test(raw) ? raw : safeId(raw);

async function collect(items, worker, concurrency = 6) {
	const results = [];
	for (let offset = 0; offset < items.length; offset += concurrency)
		results.push(...await Promise.all(items.slice(offset, offset + concurrency).map(worker)));
	return results;
}

async function accessMailboxes(env, actor, admin, withToken = false) {
	const select = withToken ? `${mailboxFields},encrypted_token` : mailboxFields;
	if (admin) return db(env, `supportos_mailboxes?select=${select}&order=address`);
	const rows = await db(env, `supportos_mailbox_members?select=mailbox:supportos_mailboxes(${select})&user_id=eq.${actor}`);
	return rows.map(({ mailbox }) => mailbox).filter(Boolean).sort((a, b) => a.address.localeCompare(b.address));
}

async function accessMailbox(env, actor, admin, mailboxId) {
	if (!uuid.test(mailboxId ?? '')) throw mailError('Выберите почтовый ящик.');
	if (!admin) {
		const [membership] = await db(env, `supportos_mailbox_members?select=user_id&user_id=eq.${actor}&mailbox_id=eq.${mailboxId}&limit=1`);
		if (!membership) throw mailError('К этому ящику нет доступа.', 403);
	}
	const [mailbox] = await db(env, `supportos_mailboxes?select=${mailboxFields},encrypted_token&id=eq.${mailboxId}&limit=1`);
	if (!mailbox) throw mailError('Почтовый ящик не найден.', 404);
	return mailbox;
}

async function folder(g, url) {
	const label = url.searchParams.get('label') ?? 'INBOX';
	const search = (url.searchParams.get('q') ?? '').trim();
	const token = url.searchParams.get('page');
	if (search.length > 300 || (token && token.length > 512)) throw mailError('Слишком длинный поисковый запрос.');
	const params = new URLSearchParams({ maxResults: String(pageSize) });
	if (token) params.set('pageToken', token);
	if (search) params.set('q', search);
	if (label === 'DRAFT') {
		const result = await g(`/drafts?${params}`);
		const rows = await collect(result.drafts ?? [], async (item) => {
			try {
				const fields = encodeURIComponent('id,message(id,threadId,labelIds,snippet,internalDate,payload(headers))');
				const draft = await g(`/drafts/${safeId(item.id)}?format=full&fields=${fields}`);
				return { ...mailMetadata(draft.message), draftId: draft.id, count: 1 };
			} catch (error) { if (error.status === 404) return null; throw error; }
		});
		return { rows: rows.filter(Boolean), next: result.nextPageToken ?? null };
	}
	if (label === 'STARRED') params.set('q', `${search} is:starred`.trim());
	else if (label === 'SNOOZED') params.set('q', `${search} in:snoozed`.trim());
	else if (label !== 'ALL') {
		params.append('labelIds', safeId(label));
		if (label.startsWith('CATEGORY_')) params.append('labelIds', 'INBOX');
	}
	if (label === 'TRASH' || label === 'SPAM') params.set('includeSpamTrash', 'true');
	params.set('fields', 'threads(id,snippet),nextPageToken');
	const result = await g(`/threads?${params}`);
	const rows = await collect(result.threads ?? [], async (item) => {
		try {
			const filter = encodeURIComponent('id,messages(id,threadId,labelIds,snippet,internalDate,payload(headers))');
			const thread = await g(`/threads/${safeId(item.id)}?format=metadata&fields=${filter}`);
			const messages = thread.messages ?? [];
			const message = messages.at(-1);
			return message ? { ...mailMetadata(message), labels: [...new Set(messages.flatMap(({labelIds}) => labelIds ?? []))], count: messages.length, snippet: item.snippet ?? message.snippet } : null;
		} catch (error) { if (error.status === 404) return null; throw error; }
	});
	return { rows: rows.filter(Boolean), next: result.nextPageToken ?? null };
}

async function unreadSnapshot(cfg, mailbox) {
	const cached = statsCache.get(mailbox.id);
	if (cached?.version === mailbox.encrypted_token && cached.expires > Date.now()) return cached.promise;
	const entry = { version: mailbox.encrypted_token, expires: Date.now() + 30_000 };
	entry.promise = (async () => {
		try {
			const token = await mailboxToken(cfg, mailbox);
			const [inbox, latest] = await Promise.all([
				gmail(token, '/labels/INBOX?fields=threadsUnread'),
				gmail(token, '/messages?labelIds=INBOX&maxResults=1&fields=messages(id)'),
			]);
			const recentId = latest.messages?.[0]?.id;
			let recentDate = null;
			if (recentId) recentDate = Number((await gmail(token, `/messages/${safeId(recentId)}?format=minimal&fields=internalDate`)).internalDate) || null;
			return { id: mailbox.id, unread: inbox.threadsUnread ?? 0, recentId, recentDate };
		} catch (error) { return { id: mailbox.id, unread: null, reconnect: error.code === 'reconnect' }; }
	})();
	if (statsCache.size >= 200) statsCache.delete(statsCache.keys().next().value);
	statsCache.set(mailbox.id, entry);
	return entry.promise;
}

async function getAttachment(g, mid, id) {
	if (!id.startsWith('inline-')) return g(`/messages/${mid}/attachments/${id}`);
	const message = await g(`/messages/${mid}?format=full`);
	const parts = [message.payload];
	for (const part of parts) {
		if (`inline-${part?.partId}` === id) return part.body;
		parts.push(...(part?.parts ?? []));
	}
	return null;
}

const adminOnly = new Set(['oauth-start', 'oauth-finish', 'members', 'grant', 'revoke']);
const postActions = new Set(['oauth-start', 'oauth-finish', 'grant', 'revoke', 'change-thread', 'save-draft', 'send', 'delete-draft']);

export default async function handler(req, res) {
	res.setHeader('Cache-Control', 'private, no-store');
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('X-Content-Type-Options', 'nosniff');
	const send = (status, data) => { res.statusCode = status; return res.end(JSON.stringify(data)); };
	try {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const action = url.searchParams.get('action') ?? 'list';
		if (req.method !== (postActions.has(action) ? 'POST' : 'GET')) return send(405, { error: 'Метод не поддерживается.' });
		const user = await requireUser(req);
		const admin = can(user.access, 'users.manage');
		if (adminOnly.has(action) && !admin) throw mailError('Подключение и выдача доступа доступны администратору.', 403);
		const cfg = googleConfig();
		if (!cfg) {
			if (action === 'list') return send(200, { configured: false, admin, mailboxes: [] });
			throw mailError('Подключение Gmail ещё не настроено на сервере.', 503);
		}
		const env = config();
		const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
		if (action === 'list') return send(200, { configured: true, admin, mailboxes: await accessMailboxes(env, user.id, admin) });
		if (action === 'oauth-start') {
			const address = addressOf(body.address);
			if (!validAddress(address)) throw mailError('Введите адрес Gmail или Google Workspace.');
			return send(200, startGoogle(cfg, `${user.id}:${user.sessionId}`, address));
		}
		if (action === 'oauth-finish') {
			const { address, sealedToken } = await completeGoogle(cfg, `${user.id}:${user.sessionId}`, body.code, body.state);
			const id = await db(env, 'rpc/supportos_connect_gmail_mailbox', { mail_address: address, sealed_token: sealedToken, actor: user.id });
			return send(200, { id, address, provider: 'gmail' });
		}
		if (action === 'stats') {
			const mailboxes = await accessMailboxes(env, user.id, admin, true);
			return send(200, { stats: await collect(mailboxes, (mailbox) => unreadSnapshot(cfg, mailbox), 8) });
		}
		const box = await accessMailbox(env, user.id, admin, url.searchParams.get('box'));
		if (action === 'members') {
			const rows = await db(env, `supportos_mailbox_members?select=user:supportos_users!supportos_mailbox_members_user_id_fkey(id,display_name,email)&mailbox_id=eq.${box.id}&order=created_at`);
			return send(200, { members: rows.map(({ user: member }) => member).filter(Boolean) });
		}
		if (action === 'grant' || action === 'revoke') {
			if (action === 'grant') {
				const email = addressOf(body.email);
				if (!validAddress(email)) throw mailError('Введите почту сотрудника в SupportOS.');
				const [eligible] = await db(env, `supportos_users?select=id&email=eq.${encodeURIComponent(email)}&status=eq.active&limit=1`);
				if (!eligible) throw mailError('Аккаунт сотрудника должен быть активным.', 409);
				await db(env, 'supportos_mailbox_members', { mailbox_id: box.id, user_id: eligible.id, granted_by: user.id })
					.catch((error) => { if (error.storageCode !== '23505') throw error; });
			} else {
				const { userId } = body;
				if (typeof userId !== 'string' || !uuid.test(userId)) throw mailError('Выберите сотрудника.');
				await db(env, `supportos_mailbox_members?mailbox_id=eq.${box.id}&user_id=eq.${userId}`, undefined, 'DELETE');
			}
			return send(200, { ok: true });
		}
		const token = await mailboxToken(cfg, box);
		const g = (path, options) => gmail(token, path, options);
		if (action === 'labels') return send(200, await g('/labels?fields=labels(id,name,type)'));
		if (action === 'folder') return send(200, await folder(g, url));
		if (action === 'thread') {
			const id = safeId(url.searchParams.get('id'));
			const thread = await g(`/threads/${id}?format=full`);
			const rows = thread.messages ?? [];
			const rawBefore = url.searchParams.get('before');
			const byId = rawBefore ? rows.findIndex((message) => message.id === rawBefore) : rows.length;
			const end = byId < 0 ? rows.length : byId;
			const start = Math.max(0, end - 8);
			const messages = rows.slice(start, end).map(readMessage).map((message) => ({
				...message, clipped: message.text.length > 160_000 || message.html.length > 220_000,
				text: message.text.slice(0, 160_000), html: message.html.slice(0, 220_000),
			}));
			// Bound the envelope while continuing to page by message id.
			while (messages.length > 1 && Buffer.byteLength(JSON.stringify(messages)) > 3_000_000) messages.shift();
			const first = rows.findIndex((message) => message.id === messages[0]?.id);
			return send(200, { id, messages, before: first > 0 ? messages[0].id : null });
		}
		if (action === 'draft') {
			const draft = await g(`/drafts/${safeId(url.searchParams.get('id'))}?format=full`);
			return send(200, { id: draft.id, message: readMessage(draft.message) });
		}
		if (action === 'attachment') {
			const mid = safeId(url.searchParams.get('message'));
			const id = safeAttachmentId(url.searchParams.get('id'));
			const attachment = await getAttachment(g, mid, id);
			if (!attachment?.data) throw mailError('Вложение не найдено.', 404);
			if (attachment.data.length > 3_900_000) throw mailError('Большие вложения можно открыть в Gmail.', 413);
			return send(200, attachment);
		}
		if (action === 'change-thread') {
			const id = safeId(body.id);
			const operation = body.operation;
			if (operation === 'trash' || operation === 'untrash') await g(`/threads/${id}/${operation}`, { method: 'POST' });
			else {
				const changes = {
					read: [[], ['UNREAD']], unread: [['UNREAD'], []], star: [['STARRED'], []], unstar: [[], ['STARRED']],
					archive: [[], ['INBOX']], inbox: [['INBOX'], []], spam: [['SPAM'], ['INBOX']], unspam: [['INBOX'], ['SPAM']],
				};
				const [addLabelIds, removeLabelIds] = operation === 'add-label' ? [[safeId(body.label)], []]
					: operation === 'remove-label' ? [[], [safeId(body.label)]]
					: Object.hasOwn(changes, operation) ? changes[operation] : (() => { throw mailError('Неизвестное действие.'); })();
				await g(`/threads/${id}/modify`, { method: 'POST', body: { addLabelIds, removeLabelIds } });
			}
			statsCache.delete(box.id);
			return send(200, { ok: true });
		}
		if (action === 'delete-draft') {
			await g(`/drafts/${safeId(body.id)}`, { method: 'DELETE' });
			return send(200, { ok: true });
		}
		if (action === 'save-draft' || action === 'send') {
			const draftId = body.draftId ? safeId(body.draftId) : null;
			let input = body;
			if (draftId && body.preservedAttachments === true) {
				const current = await g(`/drafts/${draftId}?format=full`);
				const { id, attachments } = readMessage(current.message);
				if (attachments.reduce((sum, item) => sum + item.size, 0) > 2_500_000)
					throw mailError('Откройте черновик с большими вложениями в Gmail.', 413);
				const preserved = await collect(attachments, async (item) => {
					const content = await getAttachment(g, safeId(id), safeAttachmentId(item.id));
					if (!content?.data) throw mailError('Не удалось прочитать вложения черновика.', 502);
					return { name: item.name, data: Buffer.from(content.data, 'base64url').toString('base64') };
				});
				input = { ...body, attachments: [...preserved, ...(Array.isArray(body.attachments) ? body.attachments : [])] };
			}
			const message = { raw: composeRaw(box.address, input, action === 'save-draft'), ...(body.threadId ? { threadId: safeId(body.threadId) } : {}) };
			if (action === 'save-draft') return send(200, await g(draftId ? `/drafts/${draftId}` : '/drafts', { method: draftId ? 'PUT' : 'POST', body: { message } }));
			if (draftId) await g(`/drafts/${draftId}`, { method: 'PUT', body: { message } });
			const result = await (draftId ? g('/drafts/send', { method: 'POST', body: { id: draftId } }) : g('/messages/send', { method: 'POST', body: message }));
			return send(200, result);
		}
		return send(404, { error: 'Неизвестное действие.' });
	} catch (error) {
		return send(error.status ?? 502, { error: error.status ? error.message : 'Почтовый сервис временно недоступен.', code: error.code });
	}
}
