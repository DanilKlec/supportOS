import { requireUser } from '../_auth.js';
import { config, db } from '../supabase-rest.js';
import { can } from '../../shared/access.js';
import { addressOf, completeGoogle, composeRaw, gmail, googleConfig, mailboxToken, mailError, mailMetadata, readMessage, startGoogle, validAddress } from './google.js';
import { importTemplateHtml, mailTemplates } from './templates.js';
import { folderCount, invalidateFolderCounts } from './folder-counts.js';

const mailboxFields = 'id,address,provider,updated_at';
const decoratedMailboxFields = `${mailboxFields},icon`;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const idPattern = /^[a-z0-9_-]{1,1600}$/i;
const pageSize = 16;
const senderTable = 'supportos_mail_senders';
const statsCache = new Map();
const labelColorCache = new Map();
const folderPages = new Map();
const snapshotWaiters = [];
const snapshotConcurrency = 8;
let runningSnapshots = 0;

function labelColor(input) {
	const { backgroundColor, textColor } = input ?? {};
	const hex = /^#[0-9a-f]{6}$/i;
	if (typeof backgroundColor !== 'string' || !hex.test(backgroundColor) ||
		typeof textColor !== 'string' || !hex.test(textColor))
		throw mailError('Выберите цвет из палитры Gmail.');
	return { backgroundColor, textColor };
}

function mailboxIcon(value) {
	if (value === null) return null;
	const { text, tone, color, image } = value ?? {};
	if (typeof text !== 'string' || !/^[\p{L}\p{N}]{0,3}$/u.test(text.trim().toUpperCase()) ||
		!Number.isInteger(tone) || tone < 0 || tone > 6)
		throw mailError('Выберите цвет значка и укажите до трёх букв или цифр.');
	if (color != null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)))
		throw mailError('Введите цвет значка в формате RGB.');
	if (image != null) {
		const prefix = 'data:image/png;base64,';
		if (typeof image !== 'string' || image.length > 7800 || !image.startsWith(prefix) ||
			!/^[a-z0-9+/]+={0,2}$/i.test(image.slice(prefix.length)))
			throw mailError('Выберите изображение для значка заново.');
		const png = Buffer.from(image.slice(prefix.length), 'base64');
		if (png.length < 33 || png.subarray(0, 16).toString('hex') !== '89504e470d0a1a0a0000000d49484452' ||
			png.readUInt32BE(16) !== 36 || png.readUInt32BE(20) !== 36)
			throw mailError('Выберите изображение для значка заново.');
	}
	return { text: text.trim().toUpperCase(), tone, ...(color ? { color: color.toLowerCase() } : {}), ...(image ? { image } : {}) };
}

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
	const select = withToken ? `${mailboxFields},encrypted_token` : decoratedMailboxFields;
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

async function addStaffSenders(env, boxId, messages) {
	const ids = messages.filter(({ id, labels }) => labels.includes('SENT') && typeof id === 'string' && idPattern.test(id)).map(({ id }) => id);
	if (!ids.length) return messages;
	const query = new URLSearchParams({
		select: 'gmail_message_id,sender_name', mailbox_id: `eq.${boxId}`, gmail_message_id: `in.(${ids.join(',')})`,
	});
	try {
		const rows = await db(env, `${senderTable}?${query}`);
		const senders = new Map(rows.map(({ gmail_message_id, sender_name }) => [gmail_message_id, sender_name]));
		return messages.map((message) => senders.has(message.id)
			? { ...message, staffSender: senders.get(message.id) }
			: message);
	} catch (error) {
		console.error('Mail sender lookup failed', error.storageCode ?? error.name);
		return messages;
	}
}

async function folder(env, boxId, g, url) {
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
			const message = label === 'SENT'
				? messages.findLast(({ labelIds }) => labelIds?.includes('SENT'))
				: messages.at(-1);
			return message ? {
				...mailMetadata(message), count: messages.length,
				snippet: label === 'SENT' ? message.snippet ?? '' : item.snippet ?? message.snippet ?? '',
				threadLabels: [...new Set(messages.flatMap(({ labelIds }) => labelIds ?? []))],
			} : null;
		} catch (error) { if (error.status === 404) return null; throw error; }
	});
	const messages = await addStaffSenders(env, boxId, rows.filter(Boolean));
	return { rows: messages.map(({ threadLabels, ...row }) => ({ ...row, labels: threadLabels })), next: result.nextPageToken ?? null };
}

function folderPage(env, cfg, box, url) {
	const load = async () => {
		const token = await mailboxToken(cfg, box);
		return folder(env, box.id, (path) => gmail(token, path), url);
	};
	const label = url.searchParams.get('label') ?? 'INBOX';
	if (label === 'DRAFT' || url.searchParams.get('page') || url.searchParams.get('q')?.trim()) return load();
	safeId(label);
	let mailbox = folderPages.get(box.id);
	if (mailbox?.version !== box.encrypted_token) {
		if (!mailbox && folderPages.size >= 200) folderPages.delete(folderPages.keys().next().value);
		mailbox = { version: box.encrypted_token, pages: new Map() };
		folderPages.set(box.id, mailbox);
	}
	const { pages } = mailbox;
	const cached = pages.get(label);
	if (cached?.expires > Date.now()) return cached.promise;
	if (!cached && pages.size >= 6) pages.delete(pages.keys().next().value);
	const entry = { expires: Infinity };
	entry.promise = load().then((result) => {
		entry.expires = Date.now() + 8_000;
		return result;
	}).catch((error) => {
		if (pages.get(label) === entry) pages.delete(label);
		throw error;
	});
	pages.set(label, entry);
	return entry.promise;
}

async function withSnapshotSlot(read) {
	if (runningSnapshots < snapshotConcurrency) runningSnapshots++;
	else await new Promise((resolve) => snapshotWaiters.push(resolve));
	try {
		return await read();
	} finally {
		const next = snapshotWaiters.shift();
		if (next) next();
		else runningSnapshots--;
	}
}

async function readSnapshot(cfg, mailbox, previous) {
	const signal = AbortSignal.timeout(4_000);
	const expired = new Promise((_, reject) => {
		signal.addEventListener('abort', () => reject(signal.reason), { once: true });
	});
	const token = await Promise.race([mailboxToken(cfg, mailbox), expired]);
	const g = (path) => gmail(token, path, { signal });
	const [label, latest] = await Promise.allSettled([
		g('/labels/INBOX?fields=messagesUnread'),
		g('/messages?labelIds=INBOX&maxResults=1&fields=messages(id)'),
	]);
	if (label.status === 'rejected') throw label.reason;
	if (latest.status === 'rejected') throw latest.reason;
	const recentId = latest.value.messages?.[0]?.id;
	let recentDate = null;
	if (recentId) {
		recentDate = previous?.recentId === recentId && previous.recentDate != null
			? previous.recentDate
			: Number((await g(`/messages/${safeId(recentId)}?format=minimal&fields=internalDate`)).internalDate) || null;
	}
	return { id: mailbox.id, unread: label.value.messagesUnread ?? 0, recentId, recentDate };
}

function unreadSnapshot(cfg, mailbox) {
	const cached = statsCache.get(mailbox.id);
	const sameMailbox = cached?.version === mailbox.encrypted_token;
	if (sameMailbox && cached.expires > Date.now()) return cached.promise;
	const entry = { version: mailbox.encrypted_token, expires: Infinity, previous: sameMailbox ? cached.previous : undefined };
	entry.promise = withSnapshotSlot(async () => {
		try {
			entry.previous = await readSnapshot(cfg, mailbox, entry.previous);
			entry.expires = Date.now() + 30_000;
			return entry.previous;
		} catch (error) {
			const reconnect = error.code === 'reconnect';
			entry.expires = Date.now() + (reconnect ? 75_000 : 15_000);
			return { id: mailbox.id, unread: null, reconnect };
		}
	});
	if (!cached && statsCache.size >= 200) {
		for (const [id, value] of statsCache) {
			if (value.expires === Infinity) continue;
			statsCache.delete(id);
			break;
		}
	}
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

const adminOnly = new Set(['oauth-start', 'oauth-finish', 'set-mailbox-icon', 'members', 'grant', 'revoke']);
const folderManagement = new Set(['create-label', 'edit-label', 'delete-label', 'set-label-color']);
const templateActions = new Set(['templates', 'save-template', 'delete-template']);
const postActions = new Set(['oauth-start', 'oauth-finish', 'set-mailbox-icon', 'grant', 'revoke', 'create-label', 'edit-label', 'delete-label', 'set-label-color', 'change-thread', 'save-draft', 'send', 'delete-draft', 'save-template', 'delete-template', 'import-template-html']);

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
		const canManageFolders = user.access?.roles?.some(role => role.id === 'admin') === true;
		if (folderManagement.has(action) && !canManageFolders) throw mailError('Управление папками доступно только администратору.', 403);
		if (adminOnly.has(action) && !admin) throw mailError('Подключение и выдача доступа доступны администратору.', 403);
		const cfg = googleConfig();
		if (!cfg) {
			if (action === 'list') return send(200, { configured: false, admin, canManageFolders, mailboxes: [] });
			throw mailError('Подключение Gmail ещё не настроено на сервере.', 503);
		}
		const env = config();
		const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
		if (action === 'list') return send(200, { configured: true, admin, canManageFolders, mailboxes: await accessMailboxes(env, user.id, admin) });
		if (action === 'oauth-start') {
			const address = addressOf(body.address);
			if (!validAddress(address)) throw mailError('Введите адрес Gmail или Google Workspace.');
			return send(200, startGoogle(cfg, `${user.id}:${user.sessionId}`, address));
		}
		if (action === 'oauth-finish') {
			const icon = Object.hasOwn(body, 'icon') ? mailboxIcon(body.icon) : undefined;
			const { address, sealedToken } = await completeGoogle(cfg, `${user.id}:${user.sessionId}`, body.code, body.state);
			const args = { mail_address: address, sealed_token: sealedToken, actor: user.id };
			const id = icon === undefined
				? await db(env, 'rpc/supportos_connect_gmail_mailbox', args)
				: await db(env, 'rpc/supportos_connect_gmail_mailbox_with_icon', { ...args, mail_icon: icon });
			return send(200, { id, address, provider: 'gmail', icon });
		}
		if (action === 'set-mailbox-icon') {
			const id = url.searchParams.get('box');
			if (!uuid.test(id ?? '')) throw mailError('Выберите почтовый ящик.');
			const [mailbox] = await db(env, `supportos_mailboxes?select=${decoratedMailboxFields}&id=eq.${id}`,
				{ icon: mailboxIcon(body.icon) }, 'PATCH', { returnRows: true });
			if (!mailbox) throw mailError('Почтовый ящик не найден.', 404);
			return send(200, mailbox);
		}
		if (action === 'stats') {
			const mailboxes = await accessMailboxes(env, user.id, admin, true);
			return send(200, { stats: await Promise.all(mailboxes.map((mailbox) => unreadSnapshot(cfg, mailbox))) });
		}
		const box = await accessMailbox(env, user.id, admin, url.searchParams.get('box'));
		if (action === 'import-template-html') return send(200, importTemplateHtml(body.html));
		if (templateActions.has(action)) return send(200, await mailTemplates(env, box.id, user.id, action, url.searchParams, body));
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
		if (action === 'folder') return send(200, await folderPage(env, cfg, box, url));
		const token = await mailboxToken(cfg, box);
		const g = (path, options) => gmail(token, path, options);
		if (action === 'labels') return send(200, await g('/labels?fields=labels(id,name,type)'));
		if (action === 'folder-counts') {
			const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter(Boolean))].map(safeId);
			if (!ids.length || ids.length > 32 || ids.some((id) => id.length > 80)) throw mailError('Выберите до 32 папок.');
			const values = await collect(ids, async (id) => {
				try {
					return [id, await folderCount(g, box, id)];
				} catch {
					return [id, null];
				}
			});
			return send(200, { counts: Object.fromEntries(values) });
		}
		if (action === 'label-colors') {
			const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter(Boolean))].map(safeId);
			if (ids.length > 32 || ids.some((id) => id.length > 80)) throw mailError('Выберите до 32 ярлыков.');
			const entries = await collect(ids, async (id) => {
				const key = `${box.id}:${id}`;
				const cached = labelColorCache.get(key);
				if (cached?.expires > Date.now()) return [id, await cached.get];
				const record = {
					expires: Date.now() + 5 * 60_000,
					get: g(`/labels/${id}?fields=color`).then(({ color }) => color ?? null).catch(() => {
						if (labelColorCache.get(key) === record) labelColorCache.delete(key);
						return null;
					}),
				};
				if (labelColorCache.size >= 2000) labelColorCache.delete(labelColorCache.keys().next().value);
				labelColorCache.set(key, record);
				return [id, await record.get];
			});
			return send(200, { colors: Object.fromEntries(entries) });
		}
		if (action === 'delete-label' || action === 'edit-label') {
			const id = safeId(body.id);
			const label = await g(`/labels/${id}?fields=type`);
			if (label.type !== 'user') throw mailError('Можно изменять только пользовательские папки.');
			if (action === 'delete-label') {
				await g(`/labels/${id}`, { method: 'DELETE' });
				labelColorCache.delete(`${box.id}:${id}`);
				invalidateFolderCounts(box.id, [id]);
				folderPages.delete(box.id);
				return send(200, { ok: true });
			}
		}
		if (action === 'create-label' || action === 'edit-label') {
			const name = typeof body.name === 'string' ? body.name.trim() : '';
			if (!name || name.length > 225 || /[\r\n\t\0]/.test(name))
				throw mailError('Введите название ярлыка длиной до 225 символов.');
			if (action === 'edit-label') {
				const edited = await g(`/labels/${safeId(body.id)}`, {
					method: 'PATCH', body: { name, ...(body.color ? { color: labelColor(body.color) } : {}) },
				});
				labelColorCache.delete(`${box.id}:${body.id}`);
				return send(200, edited);
			}
			return send(200, await g('/labels', {
				method: 'POST',
				body: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show', ...(body.color ? { color: labelColor(body.color) } : {}) },
			}));
		}
		if (action === 'set-label-color') {
			const id = safeId(body.id);
			const edited = await g(`/labels/${id}`, { method: 'PATCH', body: { color: labelColor(body.color) } });
			labelColorCache.delete(`${box.id}:${id}`);
			return send(200, edited);
		}
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
			return send(200, { id, messages: await addStaffSenders(env, box.id, messages), before: first > 0 ? messages[0].id : null });
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
			let affected;
			let thread;
			if (operation === 'trash' || operation === 'untrash') await g(`/threads/${id}/${operation}`, { method: 'POST' });
			else if (operation === 'move-label') {
				const destination = safeId(body.label);
				const source = body.source == null ? null : safeId(body.source);
				const { labels = [] } = await g('/labels?fields=labels(id,type)');
				const folders = new Set(['INBOX', ...labels.filter(({ type }) => type === 'user').map(({ id }) => id)]);
				if (!folders.has(destination) || (source && !folders.has(source)) || source === destination)
					throw mailError('Выберите другую папку из списка.');
				await g(`/threads/${id}/modify`, {
					method: 'POST',
					body: { addLabelIds: [destination], removeLabelIds: source ? [source] : [] },
				});
				affected = source ? [source, destination] : [destination];
			} else if (operation === 'set-labels') {
				if (!Array.isArray(body.add) || !Array.isArray(body.remove) || body.add.length + body.remove.length > 100)
					throw mailError('Выберите до 100 изменений ярлыков за раз.');
				const addLabelIds = [...new Set(body.add.map(safeId))];
				const removeLabelIds = [...new Set(body.remove.map(safeId))];
				if (addLabelIds.length || removeLabelIds.length) {
					const { labels = [] } = await g('/labels?fields=labels(id,type)');
					const editable = new Set(labels.filter(({ type }) => type === 'user').map(({ id }) => id));
					if ([...addLabelIds, ...removeLabelIds].some((id) => !editable.has(id)) ||
						addLabelIds.some((id) => removeLabelIds.includes(id)))
						throw mailError('Обновите список ярлыков и повторите.');
					await g(`/threads/${id}/modify`, { method: 'POST', body: { addLabelIds, removeLabelIds } });
					affected = [...addLabelIds, ...removeLabelIds];
				}
			} else {
				const changes = {
					read: [[], ['UNREAD']], unread: [['UNREAD'], []], star: [['STARRED'], []], unstar: [[], ['STARRED']],
					archive: [[], ['INBOX']], inbox: [['INBOX'], []], spam: [['SPAM'], ['INBOX']], unspam: [['INBOX'], ['SPAM']],
				};
				const [addLabelIds, removeLabelIds] = operation === 'add-label' ? [[safeId(body.label)], []]
					: operation === 'remove-label' ? [[], [safeId(body.label)]]
					: Object.hasOwn(changes, operation) ? changes[operation] : (() => { throw mailError('Неизвестное действие.'); })();
				thread = await g(`/threads/${id}/modify`, { method: 'POST', body: { addLabelIds, removeLabelIds } });
				if (!['read', 'unread', 'spam', 'unspam'].includes(operation))
					affected = [...addLabelIds, ...removeLabelIds];
			}
			if (!affected && (operation === 'read' || operation === 'unread') && Array.isArray(thread?.messages) && thread.messages.length &&
				thread.messages.every(({ labelIds }) => Array.isArray(labelIds))) {
				affected = ['ALL', 'INBOX', 'SNOOZED', 'SPAM', 'TRASH', ...new Set(thread.messages.flatMap(({ labelIds }) => labelIds ?? []))];
			}
			invalidateFolderCounts(box.id, affected);
			statsCache.delete(box.id);
			folderPages.delete(box.id);
			return send(200, { ok: true });
		}
		if (action === 'delete-draft') {
			await g(`/drafts/${safeId(body.id)}`, { method: 'DELETE' });
			invalidateFolderCounts(box.id, ['DRAFT']);
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
			if (action === 'save-draft') {
				const saved = await g(draftId ? `/drafts/${draftId}` : '/drafts', { method: draftId ? 'PUT' : 'POST', body: { message } });
				invalidateFolderCounts(box.id, ['DRAFT']);
				return send(200, saved);
			}
			if (draftId) await g(`/drafts/${draftId}`, { method: 'PUT', body: { message } });
			const result = await (draftId ? g('/drafts/send', { method: 'POST', body: { id: draftId } }) : g('/messages/send', { method: 'POST', body: message }));
			if (draftId) invalidateFolderCounts(box.id, ['DRAFT']);
			try {
				await db(env, senderTable, {
					mailbox_id: box.id, gmail_message_id: result.id, sender_id: user.id,
					sender_name: (user.access.display_name?.trim() || user.email?.trim() || 'Сотрудник SupportOS').slice(0, 320),
				});
			} catch (error) {
				// Gmail already accepted the message. Do not turn an attribution error into a failed send.
				if (error.storageCode !== '23505') {
					console.error('Mail sender recording failed', error.storageCode ?? error.name);
					return send(200, { ...result, staffSenderMissing: true });
				}
			} finally {
				folderPages.delete(box.id);
			}
			return send(200, result);
		}
		return send(404, { error: 'Неизвестное действие.' });
	} catch (error) {
		return send(error.status ?? 502, { error: error.status ? error.message : 'Почтовый сервис временно недоступен.', code: error.code });
	}
}
