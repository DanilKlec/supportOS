import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import handler from './index.js';

const { member } = vi.hoisted(() => ({
	member: { id: '00000000-0000-4000-8000-000000000001', email: 'agent@example.com', access: { status: 'active', permissions: ['work'], roles: [{ id: 'admin' }] } },
}));
vi.mock('../_auth.js', () => ({ requireUser: async () => member }));

beforeEach(() => {
	member.access.roles = [{ id: 'admin' }];
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://chat.example');
	vi.stubEnv('CHATWOOT_ACCOUNT_ID', '3');
	vi.stubEnv('CHATWOOT_ACCESS_TOKEN', 'mock');
	vi.stubEnv('CHATWOOT_AGENT_TOKENS', '');
	vi.stubEnv('CHATWOOT_PLATFORM_APP_TOKEN', '');
	vi.stubEnv('CHATWOOT_PLATFORM_PILOT_EMAIL', '');
	vi.stubEnv('SUPABASE_URL', 'https://db.example');
	vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function stubFetch(upstream, storage = () => Response.json([])) {
	vi.stubGlobal('fetch', (url, init) => String(url).includes('/rest/v1/supportos_chatwoot_personal_profiles?')
		? storage(url, init)
		: upstream(url, init));
}

async function saveNativeCapacity() {
	const response = { setHeader: vi.fn(), end: vi.fn() };
	await handler({ url: '/api/chatwoot?action=chatwoot-capacity', method: 'POST', body: { policyId: 5, inboxId: 9, limit: 180 } }, response);
	return { status: response.statusCode, body: JSON.parse(response.end.mock.calls[0][0]) };
}

test('persists the limit on the selected Chatwoot policy and requires its confirmation', async () => {
	const fetch = vi.fn()
		.mockResolvedValueOnce(Response.json({ inbox_capacity_limits: [{ id: 12, inbox_id: 9, conversation_limit: 20 }] }))
		.mockResolvedValueOnce(Response.json({ conversation_limit: 180 }));
	stubFetch(fetch);
	expect(await saveNativeCapacity()).toEqual({ status: 200, body: { limit: 180 } });
	expect(fetch).toHaveBeenNthCalledWith(2, 'https://chat.example/api/v1/accounts/3/agent_capacity_policies/5/inbox_limits/12', expect.objectContaining({
		method: 'PUT', body: JSON.stringify({ conversation_limit: 180 }),
	}));
});

test('does not allow SupportOS agents to modify native policies', async () => {
	member.access.roles = [{ id: 'support' }];
	const fetch = vi.fn();
	stubFetch(fetch);
	expect((await saveNativeCapacity()).status).toBe(403);
	expect(fetch).not.toHaveBeenCalled();
});

test('returns account totals for each active status while the queue is filtered by project', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://conversation-counts.example');
	const fetch = vi.fn(async (url) => {
		const { pathname, searchParams } = new URL(url);
		if (pathname.endsWith('/agents')) return Response.json([]);
		expect(pathname).toBe('/api/v1/accounts/3/conversations/meta');
		const isOpen = searchParams.get('status') === 'open';
		const hasProject = searchParams.get('inbox_id') === '9';
		return Response.json({ meta: { all_count: isOpen ? (hasProject ? 2 : 11) : 0, unassigned_count: isOpen ? 1 : 0 } });
	});
	stubFetch(fetch);
	const response = { setHeader: vi.fn(), end: vi.fn() };
	await handler({ url: '/api/chatwoot?action=conversation-counts&inbox_id=9', method: 'GET' }, response);
	expect(response.statusCode).toBe(200);
	expect(JSON.parse(response.end.mock.calls[0][0])).toEqual({
		queueCount: 1, mineCount: null, activeCount: 11, openCount: 11, pendingCount: 0,
	});
	expect(fetch).toHaveBeenCalledTimes(5);
});

async function replyToPlayer(options = {}) {
	const response = { setHeader: vi.fn(), end: vi.fn() };
	await handler({ url: '/api/chatwoot?action=message', method: 'POST', body: { conversationId: 10, content: 'Ответ', ...options } }, response);
	return response.statusCode;
}

test('queues native translation for public replies with attachments and leaves notes as written', async () => {
	const base = 'https://native-translation.example';
	vi.stubEnv('CHATWOOT_BASE_URL', base);
	const fetch = vi.fn()
		.mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json({ settings: { auto_translate: true }, features: { auto_translate: true, captain_tasks: true } }))
		.mockResolvedValueOnce(Response.json({ id: 11 }))
		.mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json({ id: 12 }));
	stubFetch(fetch);
	expect(await replyToPlayer({ autoTranslate: true, attachments: [{ name: 'info.txt', type: 'text/plain', contentBase64: 'SGVsbG8=' }] })).toBe(200);
	const [url, request] = fetch.mock.calls[2];
	expect(url).toBe(`${base}/api/v1/accounts/3/conversations/10/messages`);
	expect(JSON.parse(request.body.get('content_attributes'))).toEqual({ translation_pending: true });
	expect(request.body.get('attachments[]').name).toBe('info.txt');
	expect(await replyToPlayer({ autoTranslate: true, private: true })).toBe(200);
	expect(JSON.parse(fetch.mock.calls[4][1].body)).toMatchObject({ private: true, content: 'Ответ' });
	expect(JSON.parse(fetch.mock.calls[4][1].body)).not.toHaveProperty('content_attributes');
});

test('keeps the reply unsent when the dialog has disabled native translation', async () => {
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open', additional_attributes: { auto_translate_disabled: true } }));
	stubFetch(fetch);
	expect(await replyToPlayer({ autoTranslate: true })).toBe(409);
	expect(fetch).toHaveBeenCalledTimes(1);
});

test('uses the verified personal Chatwoot token as the message author', async () => {
	vi.stubEnv('CHATWOOT_AGENT_TOKENS', JSON.stringify({ [member.email]: 'personal-test-token' }));
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json({ email: member.email }))
		.mockResolvedValueOnce(Response.json({ id: 11 }));
	stubFetch(fetch);
	expect(await replyToPlayer()).toBe(200);
	expect(fetch).toHaveBeenNthCalledWith(3, 'https://chat.example/api/v1/accounts/3/conversations/10/messages', expect.objectContaining({
		headers: expect.objectContaining({ Authorization: 'Bearer personal-test-token' }),
	}));
});

test('does not send a message when a personal token belongs to another operator', async () => {
	vi.stubEnv('CHATWOOT_AGENT_TOKENS', JSON.stringify({ [member.email]: 'other-test-token' }));
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json({ email: 'someone-else@example.com' }));
	stubFetch(fetch);
	expect(await replyToPlayer()).toBe(409);
	expect(fetch).toHaveBeenCalledTimes(2);
});

test('sends as the pilot operator after obtaining and verifying a token through the Platform App', async () => {
	vi.stubEnv('CHATWOOT_PLATFORM_APP_TOKEN', 'platform-test-token');
	vi.stubEnv('CHATWOOT_PLATFORM_PILOT_EMAIL', member.email.toUpperCase());
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json([{ id: 32, email: member.email }]))
		.mockResolvedValueOnce(Response.json({ access_token: 'pilot-test-token', user: { id: 32, email: member.email } }))
		.mockResolvedValueOnce(Response.json({ id: 32, email: member.email }))
		.mockResolvedValueOnce(Response.json({ id: 11 }));
	stubFetch(fetch);
	expect(await replyToPlayer()).toBe(200);
	expect(fetch).toHaveBeenNthCalledWith(3, 'https://chat.example/platform/api/v1/users/32/token', expect.objectContaining({
		method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer platform-test-token' }),
	}));
	expect(fetch).toHaveBeenNthCalledWith(5, 'https://chat.example/api/v1/accounts/3/conversations/10/messages', expect.objectContaining({
		headers: expect.objectContaining({ Authorization: 'Bearer pilot-test-token' }),
	}));
});

test('blocks pilot replies when the Platform App has no grant', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://grant-test.example');
	vi.stubEnv('CHATWOOT_PLATFORM_APP_TOKEN', 'platform-test-token');
	vi.stubEnv('CHATWOOT_PLATFORM_PILOT_EMAIL', member.email);
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json([{ id: 32, email: member.email }]))
		.mockResolvedValueOnce(Response.json({ error: 'Non permissible resource' }, { status: 401 }));
	stubFetch(fetch);
	expect(await replyToPlayer()).toBe(403);
	expect(fetch).toHaveBeenCalledTimes(3);
});

test('blocks pilot replies when the returned credential authenticates a different agent', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://identity-test.example');
	vi.stubEnv('CHATWOOT_PLATFORM_APP_TOKEN', 'platform-test-token');
	vi.stubEnv('CHATWOOT_PLATFORM_PILOT_EMAIL', member.email);
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json([{ id: 32, email: member.email }]))
		.mockResolvedValueOnce(Response.json({ access_token: 'invalid-user-test-token', user: { id: 32, email: member.email } }))
		.mockResolvedValueOnce(Response.json({ id: 33, email: 'someone-else@example.com' }));
	stubFetch(fetch);
	expect(await replyToPlayer()).toBe(409);
	expect(fetch).toHaveBeenCalledTimes(4);
});

test('keeps existing chat credentials for an operator outside the pilot', async () => {
	vi.stubEnv('CHATWOOT_PLATFORM_APP_TOKEN', 'platform-test-token');
	vi.stubEnv('CHATWOOT_PLATFORM_PILOT_EMAIL', 'someone-else@example.com');
	vi.stubEnv('CHATWOOT_AGENT_TOKENS', '');
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json({ id: 11 }));
	stubFetch(fetch);
	expect(await replyToPlayer()).toBe(200);
	expect(fetch).toHaveBeenNthCalledWith(2, 'https://chat.example/api/v1/accounts/3/conversations/10/messages', expect.objectContaining({
		headers: expect.objectContaining({ Authorization: 'Bearer mock' }),
	}));
});

async function editAppearance(method, body) {
	const response = { setHeader: vi.fn(), end: vi.fn() };
	await handler({ url: '/api/chatwoot?action=agent-profile', method, body }, response);
	return { status: response.statusCode, body: JSON.parse(response.end.mock.calls[0][0]) };
}

test('returns only the appearance fields for the signed-in agent', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://profile-read.example');
	stubFetch(vi.fn().mockResolvedValueOnce(Response.json([{ id: 32, email: member.email }]))
		.mockResolvedValueOnce(Response.json({ id: 32, email: member.email, name: 'Имя', display_name: 'Ник', avatar_url: 'https://chat.example/avatar.png', access_token: 'private', pubsub_token: 'private' })));
	expect(await editAppearance('GET')).toEqual({ status: 200, body: { name: 'Имя', displayName: 'Ник', avatarUrl: 'https://chat.example/avatar.png', connection: 'managed' } });
});

test('never updates a different Chatwoot user with the shared token', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://profile-owner.example');
	const fetch = vi.fn().mockResolvedValueOnce(Response.json([{ id: 32, email: member.email }]))
		.mockResolvedValueOnce(Response.json({ id: 40, email: 'integration@example.com' }));
	stubFetch(fetch);
	expect((await editAppearance('PUT', { displayName: 'Ник' })).status).toBe(409);
	expect(fetch).toHaveBeenCalledTimes(2);
});

test('saves the nickname and photo together to the verified profile', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://profile-save.example');
	const avatar = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0f8AAAAASUVORK5CYII=';
	const fetch = vi.fn().mockResolvedValueOnce(Response.json([{ id: 32, email: member.email }]))
		.mockResolvedValueOnce(Response.json({ id: 32, email: member.email }))
		.mockResolvedValueOnce(Response.json({ id: 32, name: 'Имя', display_name: 'Новый ник', avatar_url: 'https://chat.example/new.png' }));
	stubFetch(fetch);
	expect(await editAppearance('PUT', { displayName: ' Новый ник ', avatar, email: 'other@example.com' })).toEqual({
		status: 200, body: { name: 'Имя', displayName: 'Новый ник', avatarUrl: 'https://chat.example/new.png', connection: 'managed' },
	});
	const [url, request] = fetch.mock.calls[2];
	expect(url).toBe('https://profile-save.example/api/v1/profile');
	expect(request.method).toBe('PUT');
	expect(request.body.get('profile[display_name]')).toBe('Новый ник');
	expect(request.body.get('profile[email]')).toBeNull();
	expect(request.body.get('profile[avatar]').type).toBe('image/png');
});

test('rejects files that are not supported images without calling Chatwoot', async () => {
	const fetch = vi.fn();
	stubFetch(fetch);
	expect((await editAppearance('PUT', { displayName: 'Ник', avatar: Buffer.from('<svg/>').toString('base64') })).status).toBe(415);
	expect(fetch).not.toHaveBeenCalled();
});

test('connects a personal profile once, encrypts the token, edits it and uses it to author replies', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://personal-link.example');
	const token = 'token-only-for-this-agent';
	let stored = null;
	let profile = { id: 32, email: member.email, name: 'Agent', display_name: 'Before' };
	const upstream = vi.fn(async (url, init) => {
		if (url.endsWith('/agents')) return Response.json([{ id: 32, email: member.email, name: 'Agent' }]);
		if (url.endsWith('/api/v1/profile')) {
			if (init.headers.Authorization !== `Bearer ${token}`) return Response.json({ id: 51, email: 'service@example.com' });
			if (init.method === 'PUT') profile = { ...profile, ...JSON.parse(init.body).profile };
			return Response.json({ ...profile, access_token: token });
		}
		if (url.endsWith('/conversations/10')) return Response.json({ id: 10, status: 'open' });
		if (url.endsWith('/messages')) return Response.json({ id: 11 });
		throw new Error(`Unexpected test URL ${url}`);
	});
	stubFetch(upstream, (url, init) => {
		if (init.method === 'POST') {
			stored = JSON.parse(init.body);
			expect(stored.user_id).toBe(member.id);
			expect(Object.keys(stored)).toEqual(['user_id', 'account_key', 'sealed_token']);
			expect(stored.sealed_token).not.toContain(token);
			return new Response(null, { status: 204 });
		}
		expect(new URL(url).searchParams.get('user_id')).toBe(`eq.${member.id}`);
		if (init.method === 'DELETE') {
			stored = null;
			return new Response(null, { status: 204 });
		}
		return Response.json(stored ? [{ sealed_token: stored.sealed_token }] : []);
	});
	expect((await editAppearance('GET')).body.connection).toBe('required');
	expect(await editAppearance('POST', { token, userId: 'someone-else', agentId: 51 })).toEqual({
		status: 200, body: { name: 'Agent', displayName: 'Before', avatarUrl: '', connection: 'personal' },
	});
	expect((await editAppearance('GET')).body.connection).toBe('personal');
	expect((await editAppearance('PUT', { displayName: 'Updated' })).body.displayName).toBe('Updated');
	expect(await replyToPlayer()).toBe(200);
	expect(upstream).toHaveBeenLastCalledWith(expect.stringMatching(/\/messages$/), expect.objectContaining({
		headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
	}));
	expect((await editAppearance('DELETE')).body.ok).toBe(true);
	expect((await editAppearance('GET')).body.connection).toBe('required');
});

test('rejects a token from another agent before writing to storage', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://personal-link-ownership.example');
	const storage = vi.fn();
	stubFetch(vi.fn().mockResolvedValueOnce(Response.json([{ id: 32, email: member.email }]))
		.mockResolvedValueOnce(Response.json({ id: 51, email: member.email })), storage);
	expect((await editAppearance('POST', { token: 'other-agent-token-12345', agentId: 51 })).status).toBe(409);
	expect(storage).not.toHaveBeenCalled();
});
