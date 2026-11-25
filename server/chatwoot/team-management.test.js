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
	vi.stubEnv('SUPABASE_URL', 'https://db.example');
	vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function saveNativeCapacity() {
	const response = { setHeader: vi.fn(), end: vi.fn() };
	await handler({ url: '/api/chatwoot?action=chatwoot-capacity', method: 'POST', body: { policyId: 5, inboxId: 9, limit: 180 } }, response);
	return { status: response.statusCode, body: JSON.parse(response.end.mock.calls[0][0]) };
}

test('persists the limit on the selected Chatwoot policy and requires its confirmation', async () => {
	const fetch = vi.fn()
		.mockResolvedValueOnce(Response.json({ inbox_capacity_limits: [{ id: 12, inbox_id: 9, conversation_limit: 20 }] }))
		.mockResolvedValueOnce(Response.json({ conversation_limit: 180 }));
	vi.stubGlobal('fetch', fetch);
	expect(await saveNativeCapacity()).toEqual({ status: 200, body: { limit: 180 } });
	expect(fetch).toHaveBeenNthCalledWith(2, 'https://chat.example/api/v1/accounts/3/agent_capacity_policies/5/inbox_limits/12', expect.objectContaining({
		method: 'PUT', body: JSON.stringify({ conversation_limit: 180 }),
	}));
});

test('does not allow SupportOS agents to modify native policies', async () => {
	member.access.roles = [{ id: 'support' }];
	const fetch = vi.fn();
	vi.stubGlobal('fetch', fetch);
	expect((await saveNativeCapacity()).status).toBe(403);
	expect(fetch).not.toHaveBeenCalled();
});

async function replyToPlayer() {
	const response = { setHeader: vi.fn(), end: vi.fn() };
	await handler({ url: '/api/chatwoot?action=message', method: 'POST', body: { conversationId: 10, content: 'Ответ' } }, response);
	return response.statusCode;
}

test('uses the verified personal Chatwoot token as the message author', async () => {
	vi.stubEnv('CHATWOOT_AGENT_TOKENS', JSON.stringify({ [member.email]: 'personal-test-token' }));
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json({ email: member.email }))
		.mockResolvedValueOnce(Response.json({ id: 11 }));
	vi.stubGlobal('fetch', fetch);
	expect(await replyToPlayer()).toBe(200);
	expect(fetch).toHaveBeenNthCalledWith(3, 'https://chat.example/api/v1/accounts/3/conversations/10/messages', expect.objectContaining({
		headers: expect.objectContaining({ Authorization: 'Bearer personal-test-token' }),
	}));
});

test('does not send a message when a personal token belongs to another operator', async () => {
	vi.stubEnv('CHATWOOT_AGENT_TOKENS', JSON.stringify({ [member.email]: 'other-test-token' }));
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: 10, status: 'open' }))
		.mockResolvedValueOnce(Response.json({ email: 'someone-else@example.com' }));
	vi.stubGlobal('fetch', fetch);
	expect(await replyToPlayer()).toBe(409);
	expect(fetch).toHaveBeenCalledTimes(2);
});
