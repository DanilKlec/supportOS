import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, test, vi } from 'vitest';
import { completeGoogle, composeRaw, googleConfig, readMessage, seal, startGoogle } from './google.js';
import { plainFromMailHtml, sanitizeMailHtml } from './mail-html.js';
import { defaultMailLayout, normalizeMailLayout, renderMailLayout } from '../../shared/mail-layout.js';
import handler from './index.js';
import callback from './callback.js';

const identities = vi.hoisted(() => ({ actor: undefined, sessions: new Map() }));
vi.mock('../_auth.js', () => ({ requireUser: async (request) => identities.sessions.get(request.headers?.authorization) ?? identities.actor }));
const address = 'queue@gmail.example';
const mailboxId = '40000000-0000-4000-8000-000000000001';
const userId = '40000000-0000-4000-8000-000000000002';
const testEnv = {
	MAIL_GOOGLE_CLIENT_ID: 'example-client', MAIL_GOOGLE_CLIENT_SECRET: 'example-secret',
	MAIL_GOOGLE_REDIRECT_URL: 'https://support.example/api/mail/callback', MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
	SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
};

afterEach(() => { identities.sessions.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test('Google authorization binds the intended mailbox, actor, expiration and PKCE', async () => {
	const cfg = googleConfig(testEnv);
	const { url, state } = startGoogle(cfg, 'actor', address);
	const consent = new URL(url);
	expect(consent.hostname).toBe('accounts.google.com');
	expect(consent.searchParams.get('access_type')).toBe('offline');
	expect(consent.searchParams.get('code_challenge_method')).toBe('S256');
	expect(consent.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.modify');
	const fetch = vi.fn(async (url, options) => {
		if (new URL(url).hostname === 'oauth2.googleapis.com') {
			expect(options.body.get('code_verifier')).toHaveLength(64);
			return Response.json({ refresh_token: 'example-refresh', access_token: 'example-access', scope: consent.searchParams.get('scope') });
		}
		return Response.json({ emailAddress: address });
	});
	vi.stubGlobal('fetch', fetch);
	await expect(completeGoogle(cfg, 'different-actor', 'test-code', state)).rejects.toMatchObject({ status: 403 });
	expect(fetch).not.toHaveBeenCalled();
	const result = await completeGoogle(cfg, 'actor', 'test-code', state);
	expect(result.address).toBe(address);
	expect(result.sealedToken).not.toContain('example-refresh');
	fetch.mockImplementationOnce(async () => Response.json({ access_token: 'test', refresh_token: 'test', scope: consent.searchParams.get('scope') }));
	fetch.mockImplementationOnce(async () => Response.json({ emailAddress: 'wrong@example.invalid' }));
	await expect(completeGoogle(cfg, 'actor', 'different-code', state)).rejects.toMatchObject({ status: 409 });
});

test('Google authorization returns to mailbox settings with the payload in the fragment', () => {
	const headers = new Map();
	const res = { setHeader: (name, value) => headers.set(name, value), end() {} };
	callback({ method: 'GET', url: '/api/mail/callback?code=google%2Bcode%2Fsample&state=sample-state' }, res);
	expect(res.statusCode).toBe(303);
	expect(headers.get('Location')).toBe('/admin#mailboxes?mail_code=google%2Bcode%2Fsample&mail_state=sample-state');
	expect(headers.get('Cache-Control')).toBe('no-store');
	callback({ method: 'GET', url: '/api/mail/callback?error=access_denied' }, res);
	expect(headers.get('Location')).toBe('/admin#mailboxes?mail_error=denied');
});

test('compose generates threaded MIME and rejects header injection', () => {
	const raw = composeRaw(address, { to: '"Name, First" <person@example.invalid>', subject: 'Привет', text: 'Ответ', replyId: '<original@test.invalid>', attachments: [{ name: 'отчёт.txt', data: 'dGVzdA==' }] }, false);
	const mime = Buffer.from(raw, 'base64url').toString();
	expect(mime).toContain('To: person@example.invalid');
	expect(mime).toContain('References: <original@test.invalid>');
	expect(mime).toContain('multipart/mixed');
	expect(mime).toContain('dGVzdA==');
	expect(() => composeRaw(address, { to: 'person@example.invalid\r\nBcc: other@example.invalid' }, false)).toThrow();
	expect(() => composeRaw(address, { subject: 'bad\nheader', to: 'person@example.invalid' }, false)).toThrow();
	expect(() => composeRaw(address, {}, false)).toThrow();
	expect(() => composeRaw(address, {}, true)).not.toThrow();
});

test('reads both MIME body alternatives and names inline downloads', () => {
	const part = (mimeType, value) => ({ mimeType, body: { data: Buffer.from(value).toString('base64url') } });
	const message = readMessage({ id: 'm', payload: { headers: [{ name: 'Subject', value: 'Original' }], parts: [part('text/plain', 'hello'), part('text/html', '<p>hello</p>'), { filename: 'a.txt', partId: '2', body: { size: 2 }, mimeType: 'text/plain' }] } });
	expect(message).toMatchObject({ subject: 'Original', text: 'hello', html: '<p>hello</p>', attachments: [{ id: 'inline-2', name: 'a.txt' }] });
});

async function call(method, action, query = '', body, authorization) {
	const res = { setHeader() {}, end(text) { this.body = JSON.parse(text); } };
	await handler({ method, url: `/api/mail?action=${action}${query}`, body, headers: { authorization } }, res);
	return { status: res.statusCode, body: res.body };
}

test('50 employees can open a shared inbox while counters refresh for 50 mailboxes', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	identities.actor = { id: userId, access: { status: 'active', permissions: ['work'] } };
	const cfg = googleConfig(testEnv);
	const boxes = Array.from({ length: 50 }, (_, index) => {
		const id = `40000000-0000-4000-8100-${String(index + 1).padStart(12, '0')}`;
		const address = `desk-${index}@example.invalid`;
		return { id, address, encrypted_token: seal(cfg, String(index), `gmail:${address}`) };
	});
	const sessions = boxes.map(({ id }, index) => {
		const authorization = `test-session-${index}`;
		identities.sessions.set(authorization, { ...identities.actor, id });
		return authorization;
	});
	const deniedId = '40000000-0000-4000-8300-000000000001';
	identities.sessions.set('denied-session', { ...identities.actor, id: deniedId });
	const threads = Array.from({ length: 16 }, (_, index) => ({ id: `thread-${index}` }));
	const calls = { list: 0, metadata: 0, counters: 0 };
	let concurrentCounters = 0;
	let peakCounters = 0;
	let unread = true;
	const fetch = vi.fn(async (url, options) => {
		const parsed = new URL(url);
		if (parsed.hostname === 'database.invalid') {
			if (parsed.searchParams.get('select') === 'user_id') {
				const actor = parsed.searchParams.get('user_id').slice(3);
				return Response.json(actor === deniedId ? [] : [{ user_id: actor }]);
			}
			if (parsed.searchParams.has('id')) return Response.json([boxes[0]]);
			return Response.json(boxes.map((mailbox) => ({ mailbox })));
		}
		if (parsed.hostname === 'oauth2.googleapis.com') return Response.json({
			access_token: options.body.get('refresh_token'), expires_in: 3600,
		});
		const path = parsed.pathname.replace('/gmail/v1/users/me', '');
		const token = options.headers.Authorization.slice(7);
		if (path === '/threads' || path.startsWith('/threads/')) {
			await new Promise((resolve) => setTimeout(resolve, 8));
			if (options.method === 'POST') {
				unread = false;
				return Response.json({ messages: [{ labelIds: ['INBOX'] }] });
			}
			if (path === '/threads') { calls.list++; return Response.json({ threads }); }
			calls.metadata++;
			const id = path.split('/').at(-1);
			return Response.json({ messages: [{ id, threadId: id, internalDate: '1500000000000',
				labelIds: unread ? ['INBOX', 'UNREAD'] : ['INBOX'] }] });
		}
		calls.counters++;
		peakCounters = Math.max(peakCounters, ++concurrentCounters);
		try {
			await new Promise((resolve) => setTimeout(resolve, 10));
			if (token === '49') return Response.json({}, { status: 429 });
			if (path.startsWith('/labels/')) return Response.json({ messagesUnread: 5 });
			if (path === '/messages') return Response.json({ messages: [{ id: 'recent' }] });
			if (path === '/messages/recent') return Response.json({ internalDate: '1500000000000' });
			throw new Error(`Unexpected request ${path}`);
		} finally { concurrentCounters--; }
	});
	vi.stubGlobal('fetch', fetch);
	const query = `&box=${boxes[0].id}`;
	const counters = Promise.all(sessions.map((session) => call('GET', 'stats', '', undefined, session)));
	const inboxes = await Promise.all(sessions.map((session) => call('GET', 'folder', query, undefined, session)));
	for (const { status, body } of inboxes) {
		expect(status).toBe(200);
		expect(body.rows).toHaveLength(16);
	}
	const snapshots = await counters;
	for (const { status, body } of snapshots) {
		expect(status).toBe(200);
		expect(body.stats).toHaveLength(50);
		expect(body.stats[0].unread).toBe(5);
		expect(body.stats.find(({ id }) => id === boxes[49].id)?.unread).toBeNull();
	}
	expect(calls).toEqual({ list: 1, metadata: 16, counters: 149 });
	expect(peakCounters).toBeLessThanOrEqual(16);
	expect((await call('GET', 'folder', query, undefined, 'denied-session')).status).toBe(403);
	const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
	await call('GET', 'stats');
	clock.mockRestore();
	expect(calls.counters).toBe(249);
	await call('POST', 'change-thread', query, { id: 'thread-0', operation: 'read' });
	const refreshed = await call('GET', 'folder', query);
	expect(refreshed.body.rows[0].labels).not.toContain('UNREAD');
	expect(calls.list).toBe(2);
});

test('mailbox membership is checked before mail is read or sent and support cannot grant access', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	identities.actor = { id: userId, access: { status: 'active', permissions: ['work'] } };
	const fetch = vi.fn(async (url) => {
		const parsed = new URL(url);
		expect(parsed.hostname).toBe('database.invalid');
		return Response.json(parsed.searchParams.get('select') === 'user_id' ? [] : [{ mailbox: { id: mailboxId, address } }]);
	});
	vi.stubGlobal('fetch', fetch);
	expect(await call('GET', 'list')).toMatchObject({ status: 200, body: { admin: false, mailboxes: [{ id: mailboxId }] } });
	expect((await call('GET', 'folder', `&box=${mailboxId}`)).status).toBe(403);
	expect((await call('POST', 'send', `&box=${mailboxId}`, {})).status).toBe(403);
	expect((await call('POST', 'grant', `&box=${mailboxId}`, { email: address })).status).toBe(403);
	expect((await call('POST', 'oauth-start', '', { address })).status).toBe(403);
	expect((await call('POST', 'create-label', `&box=${mailboxId}`, { name: 'Private' })).status).toBe(403);
	expect(fetch).toHaveBeenCalledTimes(4);
});

test('attributes new and drafted mail to the employee who sent it without changing the outgoing MIME', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	const alice = { id: userId, access: { status: 'active', permissions: ['work'], display_name: 'Алина' } };
	const boris = { id: '40000000-0000-4000-8000-000000000003', access: { ...alice.access, display_name: 'Борис' } };
	identities.actor = alice;
	const encrypted_token = seal(googleConfig(testEnv), 'example-refresh', `gmail:${address}`);
	const message = (id, label, participant) => ({
		id, threadId: 'thread', labelIds: [label], internalDate: '1500000000000',
		snippet: `Текст ${id}`, payload: { headers: [{ name: label === 'SENT' ? 'To' : 'From', value: participant }] },
	});
	const history = [
		message('sent-1', 'SENT', 'one@example.invalid'),
		message('sent-2', 'SENT', 'two@example.invalid'),
		message('incoming', 'INBOX', 'three@example.invalid'),
	];
	const senders = [];
	let lookupCount = 0;
	const fetch = vi.fn(async (url, options) => {
		const parsed = new URL(url);
		if (parsed.hostname === 'database.invalid') {
			if (parsed.pathname.endsWith('/supportos_mail_senders')) {
				if (options.method === 'POST') {
					senders.push(JSON.parse(options.body));
					return new Response(null, { status: 201 });
				}
				lookupCount += 1;
				expect(parsed.searchParams.get('mailbox_id')).toBe(`eq.${mailboxId}`);
				const ids = parsed.searchParams.get('gmail_message_id').slice(4, -1).split(',');
				expect(ids).not.toContain('incoming');
				return Response.json(senders.filter(({ gmail_message_id }) => ids.includes(gmail_message_id)));
			}
			return Response.json(parsed.searchParams.get('select') === 'user_id'
				? [{ user_id: identities.actor.id }]
				: [{ id: mailboxId, address, encrypted_token }]);
		}
		if (parsed.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'test', expires_in: 3600 });
		expect(parsed.hostname).toBe('gmail.googleapis.com');
		if (parsed.pathname.endsWith('/threads/thread')) return Response.json({ messages: history });
		if (parsed.pathname.endsWith('/threads')) return Response.json({ threads: [{ id: 'thread', snippet: 'Текст incoming' }] });
		const payload = JSON.parse(options.body);
		const raw = payload.raw ?? payload.message?.raw;
		if (raw) {
			const mime = Buffer.from(raw, 'base64url').toString('utf8');
			expect(mime).toContain(`From: ${address}`);
			for (const privateValue of ['Алина', 'Борис', alice.id, boris.id, 'Подмена']) expect(mime).not.toContain(privateValue);
		}
		if (parsed.pathname.endsWith('/messages/send')) return Response.json({ id: 'sent-1' });
		if (parsed.pathname.endsWith('/drafts/send')) return Response.json({ id: 'sent-2' });
		if (parsed.pathname.endsWith('/drafts') || parsed.pathname.endsWith('/drafts/draft')) return Response.json({ id: 'draft' });
		throw new Error(`Unexpected Gmail request: ${parsed.pathname}`);
	});
	vi.stubGlobal('fetch', fetch);
	const query = `&box=${mailboxId}`;
	const draft = { to: 'one@example.invalid', subject: 'Test', text: 'Message', staffSender: 'Подмена' };
	expect(await call('POST', 'save-draft', query, draft)).toMatchObject({ status: 200, body: { id: 'draft' } });
	expect(senders).toEqual([]);
	expect(await call('POST', 'send', query, draft)).toEqual({ status: 200, body: { id: 'sent-1' } });
	identities.actor = boris;
	expect(await call('POST', 'send', query, { ...draft, draftId: 'draft', to: 'two@example.invalid' })).toEqual({ status: 200, body: { id: 'sent-2' } });
	expect(senders).toEqual([
		{ mailbox_id: mailboxId, gmail_message_id: 'sent-1', sender_id: alice.id, sender_name: 'Алина' },
		{ mailbox_id: mailboxId, gmail_message_id: 'sent-2', sender_id: boris.id, sender_name: 'Борис' },
	]);
	const thread = await call('GET', 'thread', `${query}&id=thread`);
	expect(thread.body.messages.map(({ staffSender }) => staffSender)).toEqual(['Алина', 'Борис', undefined]);
	expect((await call('GET', 'folder', `${query}&label=SENT`)).body.rows).toMatchObject([
		{ id: 'sent-2', to: 'two@example.invalid', staffSender: 'Борис', snippet: 'Текст sent-2' },
	]);
	const inbox = await call('GET', 'folder', `${query}&label=INBOX`);
	expect(inbox.body.rows[0]).not.toHaveProperty('staffSender');
	expect(lookupCount).toBe(2);
});

test('mailbox members create Gmail labels and move a thread without removing its other labels', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	identities.actor = { id: userId, access: { status: 'active', permissions: ['work'] } };
	const encrypted_token = seal(googleConfig(testEnv), 'example-refresh', `gmail:${address}`);
	const mutations = [];
	const colors = { backgroundColor: '#a4c2f4', textColor: '#0d3472' };
	vi.stubGlobal('fetch', vi.fn(async (url, options) => {
		const parsed = new URL(url);
		if (parsed.hostname === 'database.invalid') {
			return Response.json(parsed.searchParams.get('select') === 'user_id'
				? [{ user_id: userId }]
				: [{ id: mailboxId, address, encrypted_token }]);
		}
		if (parsed.hostname === 'oauth2.googleapis.com')
			return Response.json({ access_token: 'example-access', expires_in: 3600 });
		expect(parsed.hostname).toBe('gmail.googleapis.com');
		const folders = [{ id: 'Label_1', type: 'user' }, { id: 'Label_2', type: 'user' }, { id: 'UNREAD', type: 'system' }];
		if (options.method === 'GET') {
			if (parsed.pathname.endsWith('/labels/Label_1')) {
				expect(parsed.searchParams.get('fields')).toBe('color');
				return Response.json({ color: colors });
			}
			expect(parsed.searchParams.get('fields')).toBe('labels(id,type)');
			return Response.json({ labels: folders });
		}
		const payload = JSON.parse(options.body);
		mutations.push([parsed.pathname, payload]);
		if (parsed.pathname.endsWith('/labels'))
			return Response.json({ ...folders[1], name: payload.name });
		if (options.method === 'PATCH')
			return Response.json({ id: 'Label_1', name: 'Проекты', type: 'user', color: payload.color });
		return Response.json({ id: 'thread' });
	}));
	const query = `&box=${mailboxId}`;
	expect(await call('POST', 'create-label', query, { name: '  Проекты/Разбор  ' })).toMatchObject({
		status: 200, body: { id: 'Label_2', name: 'Проекты/Разбор', type: 'user' },
	});
	const move = { id: 'thread', operation: 'move-label', label: 'Label_2', source: 'Label_1' };
	expect((await call('POST', 'change-thread', query, move)).status).toBe(200);
	expect((await call('POST', 'change-thread', query, { ...move, label: 'UNREAD' })).status).toBe(400);
	const changes = { id: 'thread', operation: 'set-labels', add: ['Label_1'], remove: ['Label_2'] };
	expect((await call('POST', 'change-thread', query, changes)).status).toBe(200);
	expect((await call('POST', 'change-thread', query, { ...changes, add: ['TRASH'] })).status).toBe(400);
	expect((await call('POST', 'change-thread', query, { ...changes, add: changes.remove })).status).toBe(400);
	expect(await call('GET', 'label-colors', `${query}&ids=Label_1`)).toMatchObject({
		status: 200, body: { colors: { Label_1: colors } },
	});
	expect(await call('POST', 'set-label-color', query, { id: 'Label_1', color: colors })).toMatchObject({
		status: 200, body: { color: colors },
	});
	expect(mutations).toEqual([
		['/gmail/v1/users/me/labels', { name: 'Проекты/Разбор', labelListVisibility: 'labelShow', messageListVisibility: 'show' }],
		['/gmail/v1/users/me/threads/thread/modify', { addLabelIds: ['Label_2'], removeLabelIds: ['Label_1'] }],
		['/gmail/v1/users/me/threads/thread/modify', { addLabelIds: ['Label_1'], removeLabelIds: ['Label_2'] }],
		['/gmail/v1/users/me/labels/Label_1', { color: colors }],
	]);
});

test('HTML composition preserves background and GIF through MIME, and supplies a plain alternative', () => {
	const layout = normalizeMailLayout({
		...defaultMailLayout,
		backgroundImage: 'https://images.example.invalid/background.gif',
		blocks: [
			{ id: 'heading', type: 'heading', text: 'Привет', url: '' },
			{ id: 'image', type: 'image', text: 'Анимация', url: 'https://images.example.invalid/banner.gif' },
			{ id: 'button', type: 'button', text: 'Подробности', url: 'https://example.invalid/details' },
		],
	});
	const html = renderMailLayout(layout);
	const clean = sanitizeMailHtml(`${html}<script>Отклонённый блок</script><p>Обычный текст</p>`);
	expect(clean).toContain('background-image');
	expect(clean).toContain('https://images.example.invalid/background.gif');
	expect(clean).toContain('https://images.example.invalid/banner.gif');
	expect(clean).toContain('https://example.invalid/details');
	expect(clean).not.toContain('Отклонённый блок');
	expect(plainFromMailHtml(clean)).toContain('Анимация');
	const raw = Buffer.from(composeRaw(address, {
		to: 'recipient@example.invalid',
		subject: 'HTML письмо',
		html: clean,
		attachments: [{ name: 'notice.txt', data: 'YQ==' }],
	}, false), 'base64url').toString('utf8');
	expect(raw).toContain('multipart/mixed;');
	expect(raw).toContain('multipart/alternative;');
	const plainPart = raw.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--supportos-alt-/)?.[1];
	const htmlPart = raw.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--supportos-alt-/)?.[1];
	expect(Buffer.from(plainPart, 'base64').toString()).toContain('Привет');
	expect(Buffer.from(htmlPart, 'base64').toString()).toContain('banner.gif');
	expect(raw).toContain('notice.txt');
});

test('template API validates and reconstructs a saved block layout', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	identities.actor = { id: userId, access: { status: 'active', permissions: ['work'] } };
	vi.stubGlobal('fetch', vi.fn(async (url, options) => {
		const parsed = new URL(url);
		expect(parsed.hostname).toBe('database.invalid');
		if (parsed.pathname.endsWith('/supportos_mailbox_members')) return Response.json([{ user_id: userId }]);
		if (parsed.pathname.endsWith('/supportos_mailboxes')) return Response.json([{ id: mailboxId }]);
		const record = JSON.parse(options.body);
		expect(record.owner_id).toBe(userId);
		return Response.json([record]);
	}));
	const query = `&box=${mailboxId}&scope=personal`;
	const layout = { ...defaultMailLayout, blocks: [{ id: 'copy', type: 'text', text: 'Шаблон', url: '' }] };
	const saved = await call('POST', 'save-template', query, { title: 'Дизайн', layout, html: '<p>Устаревший код</p>' });
	expect(saved).toMatchObject({ status: 200, body: { body: 'Шаблон', layout } });
	expect(saved.body.html).not.toContain('Устаревший код');
	const campaign = {
		...defaultMailLayout,
		paper: '#152023',
		foreground: '#f4ede3',
		accent: '#f4c879',
		backgroundPlacement: 'canvas',
		backgroundImage: 'https://images.example.invalid/paper.png',
		headingFont: 'serif',
		blocks: [
			{ id: 'brand', type: 'brand', text: 'Nocturne', url: 'https://images.example.invalid/logo.png' },
			{ id: 'cover', type: 'hero', text: 'Открытие <зала>', url: 'https://images.example.invalid/cover.gif', align: 'center', heroHeight: 'tall', imagePosition: 'left', shade: 'strong', eyebrow: 'Приглашение', accentLine: 'Nocturne Club', description: 'Добро пожаловать' },
			{ id: 'offer', type: 'offer', text: 'Ваше участие', url: 'https://images.example.invalid/card.png', offerImagePlacement: 'above', description: 'Подтвердите участие до пятницы' },
			{ id: 'action', type: 'button', text: 'Подтвердить', url: 'https://example.invalid/rsvp', buttonWidth: 'full', buttonShape: 'pill' },
			{ id: 'team', type: 'signature', text: 'Анна', url: '', description: 'Ваш менеджер' },
			{ id: 'links', type: 'footer', text: 'Nocturne', url: '', links: [{ text: 'Условия', url: 'https://example.invalid/terms' }] },
		],
	};
	const campaignResult = await call('POST', 'save-template', query, { title: 'Приглашение', layout: campaign });
	expect(campaignResult).toMatchObject({ status: 200, body: { layout: campaign } });
	const { body: fallback, html } = campaignResult.body;
	expect(fallback).toContain('Открытие <зала>');
	expect(fallback).toContain('Подтвердите участие до пятницы');
	expect(fallback).toContain('https://example.invalid/terms');
	expect(html).toContain('Открытие &lt;зала&gt;');
	expect(html).toContain('font-family:Georgia,Times New Roman,serif');
	expect(html).toContain('height="420" bgcolor="#152023" background="https://images.example.invalid/cover.gif"');
	expect(html).toContain('background-position:left center');
	expect(html).toContain('background-color:rgba(0,0,0,0.65)');
	expect(html).toContain('font-size:30px;font-size:clamp(23px,5.8vw,36px)');
	expect(html).toContain('<span style="color:#f4c879">Nocturne Club</span>');
	expect(html).toContain('display:block;text-align:center;background-color:#f4c879;color:#000000');
	expect(html).toContain('border-radius:999px');
	expect(html).toContain('width="600" cellpadding="0" cellspacing="0" bgcolor="#152023" background="https://images.example.invalid/paper.png"');
	const invalid = structuredClone(campaign);
	invalid.blocks.find(({ type }) => type === 'hero').url = 'http://images.example.invalid/cover.gif';
	expect((await call('POST', 'save-template', query, { title: 'Фон', layout: invalid })).status).toBe(400);
	const imported = await call('POST', 'save-template', query, { title: 'Импорт', html: '<body style="background-color:#eeeeee"><h1>Содержимое</h1></body>' });
	expect(imported).toMatchObject({ status: 200, body: { body: 'Содержимое', layout: null } });
	expect(imported.body.html).toContain('background-color:#eeeeee');
	const input = '<body style="background-color:#112233"><table width="500"><tr><td><a href="https://example.invalid/help">Табличный блок</a><script>Убрать</script></td></tr></table></body>';
	const prepared = await call('POST', 'import-template-html', query, { html: input });
	expect(prepared.status).toBe(200);
	expect(prepared.body.html).toContain('<div style="background-color:#112233"><table width="500">');
	expect(prepared.body.html).not.toContain('Убрать');
	expect((await call('POST', 'import-template-html', query, { html: '<script>Убрать</script>' })).status).toBe(400);
	const sourceLayout = {
		...defaultMailLayout,
		frame: 'source',
		blocks: [
			{ id: 'heading', type: 'heading', text: 'Импортированный заголовок', url: '' },
			{ id: 'html', type: 'html', text: '', url: '', html: input.replace('Табличный блок', 'Исправленный текст') },
		],
	};
	const sourceSaved = await call('POST', 'save-template', query, { title: 'Импортированный макет', layout: sourceLayout });
	expect(sourceSaved).toMatchObject({ status: 200, body: { layout: { frame: 'source' } } });
	expect(sourceSaved.body.html).toMatch(/^<h1/);
	expect(sourceSaved.body.html).toContain('<table width="500">');
	expect(sourceSaved.body.layout.blocks[1].html).not.toContain('Убрать');
	expect(sourceSaved.body.body).toContain('Исправленный текст');
	expect(sourceSaved.body.body).toContain('https://example.invalid/help');
	expect((await call('POST', 'save-template', query, { title: 'Пустой', layout: defaultMailLayout })).status).toBe(400);
});

test('template actions use mailbox membership and reject overwriting a newer version', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	identities.actor = { id: userId, access: { status: 'active', permissions: ['work'] } };
	const templateId = '40000000-0000-4000-8000-000000000010';
	const input = { title: 'Проверка', subject: 'Уточнение', body: 'Проверяем обращение.' };
	let template;
	vi.stubGlobal('fetch', vi.fn(async (url, options) => {
		const parsed = new URL(url);
		expect(parsed.hostname).toBe('database.invalid');
		const params = parsed.searchParams;
		if (parsed.pathname.endsWith('/supportos_mailbox_members'))
			return Response.json(params.get('mailbox_id') === `eq.${mailboxId}` ? [{ user_id: userId }] : []);
		if (parsed.pathname.endsWith('/supportos_mailboxes')) return Response.json([{ id: mailboxId }]);
		expect(parsed.pathname).toBe('/rest/v1/supportos_mail_templates');
		if (options.method === 'POST') {
			expect(options.headers.Prefer).toBe('return=representation');
			expect(JSON.parse(options.body)).toEqual({ ...input, mailbox_id: mailboxId });
			template = { id: templateId, ...input, revision: 1 };
			return Response.json([template]);
		}
		expect(params.get('mailbox_id')).toBe(`eq.${mailboxId}`);
		if (options.method === 'GET') {
			if (params.get('id')) return Response.json(template ? [template] : []);
			expect(params.get('select')).toBe('id,title,subject,revision');
			expect(params.get('title')).toBe('ilike.%Провер%');
			return Response.json([{ id: template.id, title: template.title, subject: template.subject, revision: template.revision }]);
		}
		expect(options.headers.Prefer).toBe('return=representation');
		expect(params.get('id')).toBe(`eq.${templateId}`);
		if (params.get('revision') !== `eq.${template.revision}`) return Response.json([]);
		if (options.method === 'PATCH') {
			template = { ...template, ...JSON.parse(options.body) };
			return Response.json([template]);
		}
		expect(options.method).toBe('DELETE');
		const removed = template;
		template = undefined;
		return Response.json([removed]);
	}));
	const query = `&box=${mailboxId}`;
	expect((await call('POST', 'save-template', query, { ...input, body: ' ' })).status).toBe(400);
	expect((await call('POST', 'save-template', query, input))).toMatchObject({ status: 200, body: { id: templateId, revision: 1 } });
	expect((await call('GET', 'templates', `${query}&q=${encodeURIComponent('Провер')}`))).toMatchObject({ status: 200, body: { templates: [{ id: templateId }], next: null } });
	expect((await call('GET', 'templates', `${query}&id=${templateId}`)).body).toMatchObject(input);
	const update = { ...input, body: 'Обновлённый текст.', id: templateId, revision: 1 };
	expect((await call('POST', 'save-template', query, update)).body).toMatchObject({ revision: 2 });
	expect((await call('POST', 'save-template', query, update)).status).toBe(409);
	expect((await call('POST', 'delete-template', `&box=${userId}`, { id: templateId, revision: 2 })).status).toBe(403);
	expect((await call('POST', 'delete-template', query, { id: templateId, revision: 1 })).status).toBe(409);
	expect((await call('POST', 'delete-template', query, { id: templateId, revision: 2 })).status).toBe(200);
	expect((await call('GET', 'templates', `${query}&id=${templateId}`)).status).toBe(404);
});

test('personal templates follow the signed-in owner across mailboxes and are invisible to coworkers', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	const coworker = '40000000-0000-4000-8000-000000000003';
	const otherMailbox = '40000000-0000-4000-8000-000000000004';
	const templateId = '40000000-0000-4000-8000-000000000011';
	const access = { status: 'active', permissions: ['work'] };
	identities.actor = { id: userId, access };
	const draft = { title: 'Личный ответ', subject: '', body: 'Текст.' };
	let row;
	vi.stubGlobal('fetch', vi.fn(async (url, options) => {
		const parsed = new URL(url);
		expect(parsed.hostname).toBe('database.invalid');
		const params = parsed.searchParams;
		if (parsed.pathname.endsWith('/supportos_mailbox_members')) return Response.json([{ user_id: identities.actor.id }]);
		if (parsed.pathname.endsWith('/supportos_mailboxes')) return Response.json([{ id: params.get('id').slice(3) }]);
		expect(parsed.pathname).toBe('/rest/v1/supportos_mail_templates');
		if (options.method === 'POST') {
			expect(JSON.parse(options.body)).toEqual({ ...draft, owner_id: userId });
			row = { ...draft, id: templateId, revision: 1 };
			return Response.json([row]);
		}
		if (params.has('mailbox_id') || params.get('owner_id') !== `eq.${userId}`) return Response.json([]);
		return Response.json(row ? [row] : []);
	}));
	const personal = `&box=${mailboxId}&scope=personal`;
	const sibling = `&box=${otherMailbox}&scope=personal`;
	expect((await call('POST', 'save-template', personal, { ...draft, owner_id: coworker }))).toMatchObject({ status: 200, body: { id: templateId } });
	expect((await call('GET', 'templates', sibling))).toMatchObject({ status: 200, body: { templates: [{ id: templateId }] } });
	expect((await call('GET', 'templates', `&box=${mailboxId}&id=${templateId}`)).status).toBe(404);
	identities.actor = { id: coworker, access };
	expect((await call('GET', 'templates', `${personal}&id=${templateId}`)).status).toBe(404);
	expect((await call('POST', 'save-template', personal, { ...draft, id: templateId, revision: 1 })).status).toBe(409);
	expect((await call('POST', 'delete-template', personal, { id: templateId, revision: 1 })).status).toBe(409);
});

test('folder badge counts include unread messages and every draft, with all-mail pagination and refresh after reading', async () => {
	for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
	const box = '40000000-0000-4000-8000-000000000020';
	identities.actor = { id: userId, access: { status: 'active', permissions: ['work'] } };
	const encrypted_token = seal(googleConfig(testEnv), 'counts-refresh', `gmail:${address}`);
	let unread = 3;
	let draftReads = 0;
	vi.stubGlobal('fetch', vi.fn(async (url, options) => {
		const parsed = new URL(url);
		if (parsed.hostname === 'database.invalid') {
			return Response.json(parsed.searchParams.get('select') === 'user_id' ? [{ user_id: userId }] : [{ id: box, address, encrypted_token }]);
		}
		if (parsed.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'counts-access', expires_in: 3600 });
		expect(parsed.hostname).toBe('gmail.googleapis.com');
		if (parsed.pathname.endsWith('/modify')) {
			expect(JSON.parse(options.body).removeLabelIds).toEqual(['UNREAD']);
			unread = 0;
			return Response.json({ messages: [{ labelIds: ['INBOX', 'Label_1'] }] });
		}
		if (parsed.pathname.endsWith('/DRAFT')) {
			draftReads++;
			expect(parsed.searchParams.get('fields')).toBe('messagesTotal');
			return Response.json({ messagesTotal: 4, messagesUnread: 0 });
		}
		if (parsed.pathname.endsWith('/messages')) {
			expect(parsed.searchParams.get('labelIds')).toBe('UNREAD');
			if (unread === 0 || parsed.searchParams.get('q') === 'is:snoozed') return Response.json({ messages: [] });
			return parsed.searchParams.has('pageToken')
				? Response.json({ messages: [{ id: 'three' }] })
				: Response.json({ messages: [{ id: 'one' }, { id: 'two' }], nextPageToken: 'more' });
		}
		expect(parsed.searchParams.get('fields')).toBe('messagesUnread');
		return Response.json({ messagesUnread: unread, threadsUnread: 1 });
	}));
	const query = `&box=${box}`;
	const counts = `${query}&ids=INBOX,DRAFT,Label_1,ALL,SNOOZED`;
	expect((await call('GET', 'folder-counts', counts)).body).toEqual({ counts: { INBOX: 3, DRAFT: 4, Label_1: 3, ALL: 3, SNOOZED: 0 } });
	expect((await call('POST', 'change-thread', query, { id: 'thread', operation: 'read' })).status).toBe(200);
	expect((await call('GET', 'folder-counts', counts)).body).toEqual({ counts: { INBOX: 0, DRAFT: 4, Label_1: 0, ALL: 0, SNOOZED: 0 } });
	expect(draftReads).toBe(1);
});

test('migrations preserve shared templates and isolate private templates by owner', async () => {
	const sql = await readFile(new URL('../../supabase/migrations/20261119222248_shared_mailboxes.sql', import.meta.url), 'utf8');
	const db = new PGlite();
	try {
		await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create table public.supportos_users (id uuid primary key); insert into public.supportos_users values ('${userId}');`);
		await db.exec(sql);
		await db.exec(await readFile(new URL('../../supabase/migrations/20261120054123_shared_mail_templates.sql', import.meta.url), 'utf8'));
		const first = await db.query('select public.supportos_connect_gmail_mailbox($1,$2,$3) as id', [address, 'encoded-token-a', userId]);
		const id = first.rows[0].id;
		await db.query('insert into public.supportos_mailbox_members (mailbox_id,user_id) values ($1,$2)', [id, userId]);
		const second = await db.query('select public.supportos_connect_gmail_mailbox($1,$2,$3) as id', [address, 'encoded-token-b', userId]);
		expect(second.rows[0].id).toBe(id);
		expect((await db.query('select mailbox_id from public.supportos_mailbox_members')).rows).toEqual([{ mailbox_id: id }]);
		const acl = await db.query(`select has_table_privilege('authenticated','public.supportos_mailboxes','select') as browser, has_table_privilege('service_role','public.supportos_mailboxes','select') as server, has_function_privilege('anon','public.supportos_connect_gmail_mailbox(text,text,uuid)','execute') as connect`);
		expect(acl.rows[0]).toEqual({ browser: false, server: true, connect: false });
		const insert = 'insert into public.supportos_mail_templates (mailbox_id,title,body) values ($1,$2,$3) returning revision';
		const saved = await db.query(insert, [id, 'Проверка', 'Шаблон для ответа.']);
		expect(saved.rows[0].revision).toBe(1);
		await db.exec(await readFile(new URL('../../supabase/migrations/20261120055203_personal_mail_templates.sql', import.meta.url), 'utf8'));
		await db.exec(await readFile(new URL('../../supabase/migrations/20261120225320_html_mail_templates.sql', import.meta.url), 'utf8'));
		expect((await db.query('select html, layout from public.supportos_mail_templates')).rows).toEqual([{ html: null, layout: null }]);
		expect((await db.query('select owner_id, mailbox_id from public.supportos_mail_templates')).rows).toEqual([{ owner_id: null, mailbox_id: id }]);
		const insertPersonal = 'insert into public.supportos_mail_templates (owner_id,title,body) values ($1,$2,$3)';
		await db.query(insertPersonal, [userId, 'Проверка', 'Личный текст.']);
		await expect(db.query(insertPersonal, [userId, 'проверка', 'Дубликат.'])).rejects.toMatchObject({ code: '23505' });
		await expect(db.query('insert into public.supportos_mail_templates (mailbox_id,owner_id,title,body) values ($1,$2,$3,$4)', [id, userId, 'Оба владельца', 'Текст.'])).rejects.toMatchObject({ code: '23514' });
		await expect(db.query(insert, [id, 'проверка', 'Другой текст.'])).rejects.toMatchObject({ code: '23505' });
		const another = await db.query('select public.supportos_connect_gmail_mailbox($1,$2,$3) as id', ['second@example.invalid', 'encoded-token-c', userId]);
		await expect(db.query(insert, [another.rows[0].id, 'проверка', 'Другой ящик.'])).resolves.toMatchObject({ rows: [{ revision: 1 }] });
		const templatesAcl = await db.query(`select has_table_privilege('authenticated','public.supportos_mail_templates','select') as browser, has_table_privilege('service_role','public.supportos_mail_templates','insert') as server`);
		expect(templatesAcl.rows[0]).toEqual({ browser: false, server: true });
	} finally { await db.close(); }
}, 15000);
