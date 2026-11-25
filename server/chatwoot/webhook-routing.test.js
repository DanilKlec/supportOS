import { createHmac } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import webhook from './webhook.js';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

test('an authenticated incoming webhook assigns the oldest waiting chat without a browser poll', async () => {
	vi.stubEnv('CHATWOOT_BASE_URL', 'https://chat.invalid');
	vi.stubEnv('CHATWOOT_ACCOUNT_ID', '3');
	vi.stubEnv('CHATWOOT_ACCESS_TOKEN', 'test-account-token');
	vi.stubEnv('SUPABASE_URL', 'https://database.invalid');
	vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-storage-token');
	const secret = 'test-signing-secret';
	const waiting = [41, 42].map((id) => ({ id, inbox_id: 7, status: 'open', created_at: 1764000000 + id }));
	const assigned = [];
	const routeCompleted = [];
	const fetchMock = vi.fn(async (input, init) => {
		const url = new URL(input);
		const path = url.pathname;
		const body = init.body && JSON.parse(init.body);
		if (path.endsWith('supportos_chatwoot_webhook_config')) return Response.json([{ signing_secret: secret }]);
		if (path.endsWith('supportos_chatwoot_webhook_events')) return Response.json([body]);
		if (path.endsWith('acquire_router_lease') || path.endsWith('release_router_lease')) return Response.json(true);
		if (path.endsWith('expire_presence') || path.endsWith('supportos_chatwoot_operations')) return Response.json([]);
		if (path.endsWith('supportos_chatwoot_presence'))
			return Response.json([{ chatwoot_agent_id: 101, heartbeat_at: new Date().toISOString() }]);
		if (path.endsWith('supportos_chatwoot_agent_limits'))
			return Response.json([{ chatwoot_agent_id: 101, max_active_chats: 1 }]);
		if (path.endsWith('supportos_chatwoot_router_state')) return Response.json([]);
		if (path.endsWith('/inboxes')) return Response.json([{ id: 7 }]);
		if (path.endsWith('/inbox_members/7')) return Response.json([{ id: 101 }]);
		if (path.endsWith('/meta')) return Response.json({ meta: { unassigned_count: 1 } });
		if (path.endsWith('/conversations')) {
			const unassigned = url.searchParams.get('assignee_type') === 'unassigned';
			const conversations = unassigned && url.searchParams.get('status') === 'open' ? waiting : [];
			return Response.json({ payload: conversations, meta: { assigned_count: 0, unassigned_count: conversations.length } });
		}
		if (path.endsWith('reserve_conversation')) {
			expect(body.p_agent_ids).toEqual([101]);
			expect(body.p_active_counts).toEqual({ 101: 0 });
			return Response.json({ reserved: true, agentId: 101 });
		}
		if (path.endsWith('/conversations/41')) return Response.json(waiting[0]);
		if (path.endsWith('/conversations/41/assignments')) {
			assigned.push(body);
			return Response.json({ id: 101 });
		}
		if (path.endsWith('finish_conversation_operation')) {
			routeCompleted.push(body.p_conversation_id);
			return Response.json(true);
		}
		throw new Error(`Unexpected request to ${path}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	const rawBody = JSON.stringify({ event: 'message_created', message_type: 'incoming', account: { id: 3 }, inbox: { id: 7 }, conversation: { id: 42 } });
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signature = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
	const res = { setHeader: vi.fn(), end: vi.fn() };
	await webhook({ method: 'POST', rawBody, headers: { 'x-chatwoot-timestamp': timestamp, 'x-chatwoot-signature': `sha256=${signature}` } }, res);
	expect(res.statusCode).toBe(200);
	expect(assigned).toEqual([{ assignee_id: 101 }]);
	expect(routeCompleted).toEqual([41]);
});
