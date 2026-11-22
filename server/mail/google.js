import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

const scope = 'https://www.googleapis.com/auth/gmail.modify';
const tokens = new Map();

export function mailError(message, status = 400, code) {
	return Object.assign(new Error(message), { status, code });
}

export function googleConfig(env = process.env) {
	const { MAIL_GOOGLE_CLIENT_ID: clientId, MAIL_GOOGLE_CLIENT_SECRET: secret, MAIL_GOOGLE_REDIRECT_URL: callback, MAIL_ENCRYPTION_KEY: rawKey } = env;
	if (!clientId || !secret || !callback || !rawKey) return null;
	const key = Buffer.from(rawKey, 'base64');
	let url;
	try { url = new URL(callback); } catch { return null; }
	if (key.length !== 32 || url.username || url.password || url.search || url.hash || url.pathname !== '/api/mail/callback' ||
		!(url.protocol === 'https:' || (env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:'))) return null;
	return { clientId, secret, callback: url.href, key };
}

export function seal(cfg, value, purpose) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', cfg.key, iv);
	cipher.setAAD(Buffer.from(purpose));
	const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

function unseal(cfg, token, purpose) {
	const data = Buffer.from(token, 'base64url');
	const decipher = createDecipheriv('aes-256-gcm', cfg.key, data.subarray(0, 12));
	decipher.setAAD(Buffer.from(purpose));
	decipher.setAuthTag(data.subarray(12, 28));
	return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
}

export function startGoogle(cfg, actor, address) {
	const verifier = randomBytes(48).toString('base64url');
	const state = seal(cfg, { actor, address, verifier, expires: Date.now() + 15 * 60_000 }, 'mail-oauth');
	const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
	auth.search = new URLSearchParams({
		client_id: cfg.clientId, redirect_uri: cfg.callback, response_type: 'code', scope,
		access_type: 'offline', prompt: 'consent select_account', state, login_hint: address,
		code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
	}).toString();
	return { url: auth.href, state };
}

async function googleToken(cfg, params) {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST', body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.secret, ...params }),
		signal: AbortSignal.timeout(10_000), redirect: 'error',
	});
	const body = await response.json();
	if (response.ok && typeof body.access_token === 'string') return body;
	if (body.error === 'invalid_grant' && params.refresh_token) throw mailError('Подключите ящик заново через администратора.', 409, 'reconnect');
	if (body.error === 'invalid_grant') throw mailError('Разрешение Google истекло. Начните подключение заново.', 409);
	throw mailError('Google не подтвердил подключение. Проверьте настройки OAuth.', 502);
}

export async function completeGoogle(cfg, actor, code, state) {
	if (typeof code !== 'string' || !code || code.length > 2048 || typeof state !== 'string' || state.length > 1800)
		throw mailError('Некорректный ответ Google. Начните подключение заново.');
	let challenge;
	try { challenge = unseal(cfg, state, 'mail-oauth'); } catch { throw mailError('Подключение Google не подтверждено.', 403); }
	if (challenge.actor !== actor || challenge.expires < Date.now()) throw mailError('Подключение Google истекло или открыто в другом аккаунте.', 403);
	const token = await googleToken(cfg, { code, grant_type: 'authorization_code', redirect_uri: cfg.callback, code_verifier: challenge.verifier });
	if (!token.refresh_token || !String(token.scope).split(' ').includes(scope)) throw mailError('Google не выдал доступ к Gmail. Подтвердите нужное разрешение и повторите подключение.', 409);
	const { emailAddress } = await gmail(token.access_token, '/profile');
	const address = emailAddress?.trim().toLowerCase();
	if (address !== challenge.address) throw mailError('Выбран другой адрес Gmail. Начните подключение с нужным аккаунтом.', 409);
	return { address, sealedToken: seal(cfg, token.refresh_token, `gmail:${address}`) };
}

export async function mailboxToken(cfg, mailbox) {
	const existing = tokens.get(mailbox.id);
	if (existing?.version === mailbox.encrypted_token && existing.expires > Date.now()) return existing.promise;
	let refresh;
	try { refresh = unseal(cfg, mailbox.encrypted_token, `gmail:${mailbox.address}`); }
	catch { throw mailError('Подключите ящик заново через администратора.', 409, 'reconnect'); }
	const record = { version: mailbox.encrypted_token, expires: Date.now() + 12_000 };
	record.promise = googleToken(cfg, { refresh_token: refresh, grant_type: 'refresh_token' })
		.then(({ access_token, expires_in }) => { record.expires = Date.now() + Math.max(0, Number(expires_in) - 60) * 1000; return access_token; })
		.catch((error) => { if (tokens.get(mailbox.id) === record) tokens.delete(mailbox.id); throw error; });
	if (tokens.size >= 200) tokens.delete(tokens.keys().next().value);
	tokens.set(mailbox.id, record);
	return record.promise;
}

export async function gmail(token, path, { method = 'GET', body } = {}) {
	const result = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
		method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
		body: body && JSON.stringify(body), signal: AbortSignal.timeout(12_000), redirect: 'error',
	});
	const status = result.status;
	if (!result.ok) {
		if (status === 401) throw mailError('Доступ Google истёк. Подключите ящик заново.', 409, 'reconnect');
		if (status === 404) throw mailError('Письмо, ярлык или черновик больше недоступны.', 404);
		if (status === 429 || status === 403) throw mailError('Gmail временно ограничил доступ. Повторите позже или проверьте разрешения ящика.', 429);
		if (status === 409 && path === '/labels' && method === 'POST') throw mailError('Ярлык с таким названием уже существует.', 409);
		if (status === 400) throw mailError('Gmail не принял запрос. Проверьте данные письма или фильтр.', 400);
		throw mailError('Gmail временно недоступен.', 502);
	}
	const text = await result.text();
	return text ? JSON.parse(text) : {};
}

const headersOf = (payload) => Object.fromEntries((payload?.headers ?? []).map(({name, value}) => [name.toLowerCase(), value]));

export function mailMetadata(message) {
	const headers = headersOf(message?.payload);
	return {
		id: message.id, threadId: message.threadId, date: Number(message.internalDate), labels: message.labelIds ?? [],
		from: headers.from ?? '', to: headers.to ?? '', cc: headers.cc ?? '', bcc: headers.bcc ?? '', subject: headers.subject ?? '',
		replyTo: headers['reply-to'] ?? null, messageId: headers['message-id'] ?? null, inReplyTo: headers['in-reply-to'] ?? null,
		snippet: message.snippet ?? '',
	};
}

export function readMessage(message) {
	const content = { text: '', html: '', attachments: [] };
	const visit = (part) => {
		if (!part) return;
		const { mimeType, body, filename } = part;
		if (filename && body?.size > 0) content.attachments.push({ id: body.attachmentId ?? `inline-${part.partId}`, name: filename, type: mimeType, size: body.size });
		else if (body?.data && mimeType?.startsWith('text/')) {
			const key = mimeType === 'text/plain' ? 'text' : mimeType === 'text/html' ? 'html' : null;
			if (key && !content[key]) content[key] = Buffer.from(body.data, 'base64url').toString('utf8');
		}
		for (const child of part.parts ?? []) visit(child);
	};
	visit(message.payload);
	return { ...mailMetadata(message), ...content };
}

const addressPattern = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/u;
export function addressOf(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
export function validAddress(value) {
	return typeof value === 'string' && value.length <= 254 && addressPattern.test(value) && !/[\x00-\x1f\x7f]/.test(value);
}

function recipients(value) {
	if (typeof value !== 'string' || value.length > 4000 || /[\r\n\0]/.test(value)) throw mailError('Проверьте список адресатов.');
	return value.split(/[,;](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((raw) => {
		const item = raw.trim();
		const email = /<([^<>]+)>$/.exec(item)?.[1] ?? item;
		if (email && !validAddress(email)) throw mailError('Введите корректные адреса через запятую.');
		return email;
	}).filter(Boolean);
}

function encodedWords(value) {
	const chunks = [];
	let chunk = '';
	for (const letter of value) {
		if (Buffer.byteLength(chunk + letter) > 39) { chunks.push(chunk); chunk = ''; }
		chunk += letter;
	}
	if (chunk) chunks.push(chunk);
	return chunks.map((part) => `=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`).join('\r\n ');
}

const base64Lines = (data) => (data.match(/.{1,76}/g) ?? []).join('\r\n');

export function composeRaw(address, input, allowEmpty) {
	const to = recipients(input.to ?? '');
	const cc = recipients(input.cc ?? '');
	const bcc = recipients(input.bcc ?? '');
	if (!allowEmpty && !to.length && !cc.length && !bcc.length) throw mailError('Добавьте хотя бы одного адресата.');
	const subject = input.subject ?? '';
	const text = input.text ?? '';
	if (typeof subject !== 'string' || subject.length > 500 || /[\r\n\0]/.test(subject) || typeof text !== 'string' || text.length > 200_000)
		throw mailError('Проверьте тему и размер письма.');
	const reply = typeof input.replyId === 'string' && /^<[^<>\s]{1,250}>$/.test(input.replyId) ? input.replyId : null;
	const header = [`From: ${address}`, to.length && `To: ${to.join(',\r\n ')}`, cc.length && `Cc: ${cc.join(',\r\n ')}`, bcc.length && `Bcc: ${bcc.join(',\r\n ')}`,
		`Subject: ${encodedWords(subject)}`, reply && `In-Reply-To: ${reply}`, reply && `References: ${reply}`, 'MIME-Version: 1.0'];
	const textPart = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(text).toString('base64'))];
	const attachments = input.attachments ?? [];
	if (!Array.isArray(attachments) || attachments.length > 8) throw mailError('Добавьте до восьми вложений.');
	const boundary = `supportos-${randomUUID()}`;
	let size = 0;
	const parts = attachments.map((attachment) => {
		const { name, data } = attachment ?? {};
		if (typeof name !== 'string' || !name.trim() || name.length > 200 || typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))
			throw mailError('Не удалось прочитать вложение.');
		size += Buffer.byteLength(data, 'base64');
		if (size > 2_500_000) throw mailError('Общий размер вложений не должен превышать 2,5 МБ.', 413);
		const filename = encodeURIComponent(name.replaceAll(/[\x00-\x1f\x7f]/g, '_')).replaceAll(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
		return [`--${boundary}`, 'Content-Type: application/octet-stream', `Content-Disposition: attachment; filename*=UTF-8''${filename}`, 'Content-Transfer-Encoding: base64', '', base64Lines(data)];
	});
	const mime = parts.length ? [...header, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, ...textPart, ...parts.flat(), `--${boundary}--`] : [...header, ...textPart];
	return Buffer.from(mime.filter((line) => line !== false && line !== null).join('\r\n')).toString('base64url');
}
