import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, test, vi } from 'vitest';
import { completeGoogle, composeRaw, googleConfig, readMessage, seal, startGoogle } from './google.js';
import handler from './index.js';

const identities = vi.hoisted(() => ({ actor: undefined }));
vi.mock('../_auth.js', () => ({ requireUser: async () => identities.actor }));
const address = 'queue@gmail.example';
const mailboxId = '40000000-0000-4000-8000-000000000001';
const userId = '40000000-0000-4000-8000-000000000002';
const testEnv = {
	MAIL_GOOGLE_CLIENT_ID: 'example-client', MAIL_GOOGLE_CLIENT_SECRET: 'example-secret',
	MAIL_GOOGLE_REDIRECT_URL: 'https://support.example/api/mail/callback', MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
	SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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

async function call(method, action, query = '', body) {
	const res = { setHeader() {}, end(text) { this.body = JSON.parse(text); } };
	await handler({ method, url: `/api/mail?action=${action}${query}`, body }, res);
	return { status: res.statusCode, body: res.body };
}

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

test('migration grants service access only and reconnect keeps the original mailbox and operators', async () => {
	const sql = await readFile(new URL('../../supabase/migrations/20261119222248_shared_mailboxes.sql', import.meta.url), 'utf8');
	const db = new PGlite();
	try {
		await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create table public.supportos_users (id uuid primary key); insert into public.supportos_users values ('${userId}');`);
		await db.exec(sql);
		const first = await db.query('select public.supportos_connect_gmail_mailbox($1,$2,$3) as id', [address, 'encoded-token-a', userId]);
		const id = first.rows[0].id;
		await db.query('insert into public.supportos_mailbox_members (mailbox_id,user_id) values ($1,$2)', [id, userId]);
		const second = await db.query('select public.supportos_connect_gmail_mailbox($1,$2,$3) as id', [address, 'encoded-token-b', userId]);
		expect(second.rows[0].id).toBe(id);
		expect((await db.query('select mailbox_id from public.supportos_mailbox_members')).rows).toEqual([{ mailbox_id: id }]);
		const acl = await db.query(`select has_table_privilege('authenticated','public.supportos_mailboxes','select') as browser, has_table_privilege('service_role','public.supportos_mailboxes','select') as server, has_function_privilege('anon','public.supportos_connect_gmail_mailbox(text,text,uuid)','execute') as connect`);
		expect(acl.rows[0]).toEqual({ browser: false, server: true, connect: false });
	} finally { await db.close(); }
}, 15000);
