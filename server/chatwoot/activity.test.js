import { afterEach, expect, test, vi } from 'vitest';
import { activityBySite, countConnectedBots } from './activity.js';
import { connectChatwootWebhook, directInboxMembers } from './index.js';

afterEach(() => vi.unstubAllGlobals());

test('site activity counts shared contacts once overall and computes active and queue totals by site', async () => {
	const sites = [{ id: 11, name: 'One' }, { id: 22, name: 'Two' }];
	const request = vi.fn(async (path) => {
		if (path.startsWith('/contacts/active')) return {
			meta: { count: 3 },
			payload: [
				{ id: 1, contact_inboxes: [{ inbox: { id: 11 } }, { inbox: { id: 22 } }] },
				{ id: 2, contact_inboxes: [{ inbox: { id: 22 } }] },
				{ id: 3, contact_inboxes: [{ inbox: { id: 33 } }] },
			],
		};
		const query = new URL(path, 'https://chat.invalid').searchParams;
		return { meta: { all_count: query.get('inbox_id') === '11' ? 4 : 2, unassigned_count: query.get('status') === 'open' ? 1 : 0 } };
	});
	expect(await activityBySite(request, sites)).toMatchObject({
		online: 2, active: 12, queue: 2,
		sites: [{ id: 11, online: 1, active: 8, queue: 1 }, { id: 22, online: 2, active: 4, queue: 1 }],
	});
	expect(await countConnectedBots(async () => ({ agent_bot: { id: 4 } }), sites)).toBe(1);
});

test('direct assignments survive when an overlapping group is removed', () => {
	expect(directInboxMembers([1, 2, 3], { direct_operator_ids: [1], group_member_ids: [1, 2] })).toEqual([1, 3]);
	expect(directInboxMembers([1, 2, 3], null)).toEqual([1, 2, 3]);
});

test('webhook setup completes a matching account subscription and preserves its other events', async () => {
	const endpoint = 'https://supportos.invalid/api/chatwoot/webhook';
	const secret = 'example-generated-secret';
	const webhook = { id: 10, name: 'Existing', url: endpoint, secret, subscriptions: ['contact_updated'] };
	const fetchMock = vi.fn(async (_url, init) => init.method === 'GET'
		? Response.json({ payload: { webhooks: [webhook] } })
		: Response.json(webhook));
	vi.stubGlobal('fetch', fetchMock);
	const cfg = { base: 'https://chat.invalid', accountId: '3', token: 'test-token' };
	expect(await connectChatwootWebhook(cfg, endpoint)).toBe(secret);
	const [url, init] = fetchMock.mock.calls.at(-1);
	expect(url).toBe('https://chat.invalid/api/v1/accounts/3/webhooks/10');
	expect(init.method).toBe('PATCH');
	expect(JSON.parse(init.body).webhook.subscriptions).toEqual([
		'contact_updated', 'conversation_created', 'conversation_status_changed', 'conversation_updated', 'message_created', 'message_updated',
	]);
});
