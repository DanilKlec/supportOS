import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, test, vi } from 'vitest';
import { defaultInvitation } from '../../shared/staff-invitation.js';
import { googleConfig, seal } from '../mail/google.js';
import { getInvitationSettings, saveInvitationSettings, sendCustomInvitation } from './invitation.js';

const senderId = '30000000-0000-4000-8000-000000000001';
const user = { id: '30000000-0000-4000-8000-000000000002', email: 'staff@example.invalid' };
const from = 'invites@example.invalid';
const redirectTo = 'https://support.example.invalid/login?invite=1';
const env = {
	SUPABASE_URL: 'https://project.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
	MAIL_GOOGLE_CLIENT_ID: 'synthetic', MAIL_GOOGLE_CLIENT_SECRET: 'synthetic',
	MAIL_GOOGLE_REDIRECT_URL: 'https://support.example.invalid/api/mail/callback',
	MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};
afterEach(() => vi.unstubAllGlobals());

test('stores only validated settings and prevents overwriting another administrator’s revision', async () => {
	let revision = 1;
	const fetch = vi.fn(async (input, options) => {
		const url = new URL(input);
		if (url.pathname.endsWith('/supportos_mailboxes'))
			return Response.json([{ id: senderId, address: from }]);
		if (options.method === 'GET')
			return Response.json([{ revision, template: {}, sender_id: null }]);
		if (url.searchParams.get('revision') !== `eq.${revision}`) return Response.json([]);
		expect(options.headers.Prefer).toBe('return=representation');
		revision = JSON.parse(options.body).revision;
		return Response.json([{ revision }]);
	});
	vi.stubGlobal('fetch', fetch);
	const settings = await getInvitationSettings(env);
	expect(settings).toMatchObject({ revision: 1, senderId: null, gmailConfigured: true, senders: [{ id: senderId, address: from }] });
	const input = { revision: 1, senderId, template: { ...defaultInvitation, button: 'Начать работу' } };
	await expect(saveInvitationSettings(env, input)).resolves.toMatchObject({ senderId, revision: 2 });
	await expect(saveInvitationSettings(env, input)).rejects.toMatchObject({ status: 409 });
	await expect(saveInvitationSettings(env, { ...input, senderId: null, template: { ...input.template, accent: 'bad' } })).rejects.toMatchObject({ status: 400 });
});

test('sends personalized HTML and text via the selected Gmail account and keeps the invite bound to the intended user', async () => {
	const box = { id: senderId, address: from, encrypted_token: seal(googleConfig(env), 'synthetic-refresh', `gmail:${from}`) };
	const settings = { senderId, template: { ...defaultInvitation, body: 'Здравствуйте, {{name}}! Адрес {{email}}.' } };
	const href = `${env.SUPABASE_URL}/auth/v1/verify?${new URLSearchParams({ token: 'synthetic-invite', type: 'invite', redirect_to: redirectTo })}`;
	const admin = { generateLink: vi.fn().mockResolvedValue({ data: { user, properties: { action_link: href } } }) };
	let claims = 0;
	const fetch = vi.fn(async (input, options) => {
		const url = new URL(input);
		if (url.pathname.endsWith('/supportos_mailboxes')) return Response.json([box]);
		if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'synthetic', expires_in: 3600 });
		if (url.pathname.endsWith('/supportos_claim_staff_invitation')) return Response.json(++claims !== 2);
		if (options.method === 'PATCH') return new Response(null, { status: 204 });
		expect(url.pathname).toBe('/gmail/v1/users/me/messages/send');
		const mime = Buffer.from(JSON.parse(options.body).raw, 'base64url').toString();
		expect(mime).toContain(`From: SupportOS <${from}>`);
		expect(mime).toContain(`To: ${user.email}`);
		const body = [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)]
			.map(([, content]) => Buffer.from(content, 'base64').toString());
		expect(body[0]).toContain(href);
		expect(body[1]).toContain('href="' + href.replaceAll('&', '&amp;') + '"');
		expect(body[1]).toContain('&lt;Анна&gt;');
		expect(body[1]).toContain(user.email);
		return Response.json({ id: 'synthetic-message' });
	});
	vi.stubGlobal('fetch', fetch);
	await sendCustomInvitation(env, settings, admin, user, '<Анна>', redirectTo);
	expect(admin.generateLink).toHaveBeenCalledExactlyOnceWith({ type: 'invite', email: user.email, options: { redirectTo } });
	await expect(sendCustomInvitation(env, settings, admin, user, 'Анна', redirectTo)).rejects.toMatchObject({ status: 429 });
	admin.generateLink.mockResolvedValueOnce({ data: { user: { id: 'different-user' }, properties: { action_link: href } } });
	await expect(sendCustomInvitation(env, settings, admin, user, 'Анна', redirectTo)).rejects.toMatchObject({ status: 502 });
	expect(fetch.mock.calls.filter(([input]) => new URL(input).pathname.endsWith('messages/send'))).toHaveLength(1);
});

test('the migration locks duplicate invitation attempts and restricts template data to the service role', async () => {
	const pg = new PGlite();
	try {
		await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
			create schema auth; create table auth.users(id uuid primary key);
			create table public.supportos_mailboxes(id uuid primary key);
			insert into auth.users values ('${user.id}');`);
		const migration = await readFile(new URL('../../supabase/migrations/20261127160457_staff_invitation_template.sql', import.meta.url), 'utf8');
		await pg.exec(migration);
		await pg.exec('set role authenticated');
		await expect(pg.query('select * from public.supportos_staff_invitation_settings')).rejects.toMatchObject({ code: '42501' });
		await pg.exec('set role service_role');
		const claim = () => pg.query('select public.supportos_claim_staff_invitation($1) as claimed', [user.id]);
		expect((await claim()).rows).toEqual([{ claimed: true }]);
		expect((await claim()).rows).toEqual([{ claimed: false }]);
	} finally {
		await pg.close();
	}
});
