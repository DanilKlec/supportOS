import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { PGlite } from '@electric-sql/pglite';
import { routeWaitingConversations } from '../server/chatwoot/index.js';
import { normalizeOperations, onShift, slaSnapshot } from '../server/chatwoot/operations.js';
import http from '../server/chatwoot/_http.js';

// The real routing code and migrations run against a disposable database.
// Chatwoot and PostgREST are simulated. No network or production credentials are used.
const pg = new PGlite();
const originalFetch = globalThis.fetch;
const migrate = (name) => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const agentCount = 50;
const limit = 2;
const agents = Array.from({ length: agentCount }, (_, index) => index + 1);
const conversations = new Map();
const assignmentAttempts = new Map();
const inboxMembers = new Map([[1, agents], [2, agents]]);
let acceptingChats = true;
const env = { SUPABASE_URL: 'https://storage.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-only' };
const config = { base: 'https://chatwoot.invalid', accountId: '3', token: 'local-only' };
const webhookSecret = 'local-synthetic-webhook-secret';
const presence = () => agents.map((agent) => ({ chatwoot_agent_id: agent, heartbeat_at: new Date().toISOString() }));

function addChats(start, count, inboxId, status = 'open') {
	for (let id = start; id < start + count; id++)
		conversations.set(id, { id, status, inbox_id: inboxId ?? id % 2 + 1, assignee_id: null });
}
function summary() {
	const open = [...conversations.values()].filter((chat) => ['open', 'pending'].includes(chat.status));
	const agentLoad = new Map(agents.map((id) => [id, open.filter((chat) => chat.assignee_id === id).length]));
	return { queued: open.filter((chat) => !chat.assignee_id).length, assigned: open.filter((chat) => chat.assignee_id).length, maxPerAgent: Math.max(...agentLoad.values()) };
}

const rpcSignatures = {
	supportos_chatwoot_acquire_router_lease: ['uuid', 'integer', 'integer'],
	supportos_chatwoot_release_router_lease: ['uuid'],
	supportos_chatwoot_reserve_conversation: ['uuid', 'bigint', 'bigint[]', 'jsonb', 'uuid'],
	supportos_chatwoot_finish_conversation_operation: ['bigint', 'uuid', 'bigint'],
};
const rpcArguments = {
	supportos_chatwoot_acquire_router_lease: ['p_lease_token', 'p_min_interval_seconds', 'p_lease_seconds'],
	supportos_chatwoot_release_router_lease: ['p_lease_token'],
	supportos_chatwoot_reserve_conversation: ['p_operation_token', 'p_conversation_id', 'p_agent_ids', 'p_active_counts', 'p_lease_token'],
	supportos_chatwoot_finish_conversation_operation: ['p_conversation_id', 'p_operation_token', 'p_assignee_id'],
};
async function rpc(name, input) {
	const signature = rpcSignatures[name].map((type, index) => `$${index + 1}::${type}`).join(', ');
	const values = rpcArguments[name].map((key) => key === 'p_active_counts' ? JSON.stringify(input[key]) : input[key]);
	const result = await pg.query(`select public.${name}(${signature}) as value`, values);
	return result.rows[0].value;
}
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status });

async function fakeFetch(input, init) {
	const url = new URL(input);
	if (url.hostname === 'storage.invalid') {
		const name = url.pathname.split('/').at(-1);
		if (name in rpcSignatures) return reply(await rpc(name, JSON.parse(init.body)));
		if (name === 'supportos_chatwoot_presence') return reply(acceptingChats ? presence() : []);
		if (name === 'supportos_chatwoot_agent_limits') return reply(agents.map((id) => ({ chatwoot_agent_id: id, max_active_chats: limit })));
		if (name === 'supportos_chatwoot_router_state') {
			if (init.method !== 'PATCH') return reply((await pg.query('select last_inbox_id from public.supportos_chatwoot_router_state')).rows);
			const { last_inbox_id } = JSON.parse(init.body);
			const token = url.searchParams.get('router_lease_token').slice(3);
			await pg.query('update public.supportos_chatwoot_router_state set last_inbox_id = $1 where router_lease_token = $2', [last_inbox_id, token]);
			return new Response(null, { status: 204 });
		}
		if (name === 'supportos_chatwoot_operations') return reply((await pg.query('select settings, updated_at from public.supportos_chatwoot_operations')).rows);
		if (name === 'supportos_chatwoot_webhook_config') return reply([{ signing_secret: webhookSecret }]);
		if (name === 'supportos_chatwoot_webhook_events') {
			const event = JSON.parse(init.body);
			const inserted = await pg.query(`insert into public.supportos_chatwoot_webhook_events
				(delivery_id, event_type, account_id, inbox_id, conversation_id)
				values ($1, $2, $3, $4, $5) on conflict do nothing returning delivery_id`,
			[event.delivery_id, event.event_type, event.account_id, event.inbox_id, event.conversation_id]);
			return reply(inserted.rows, 201);
		}
	}
	if (url.hostname === 'chatwoot.invalid') {
		const path = url.pathname.replace('/api/v1/accounts/3/', '');
		if (path === 'inboxes') return reply({ payload: [...inboxMembers.keys()].map((id) => ({ id })) });
		if (path.startsWith('inbox_members/')) return reply({ payload: (inboxMembers.get(Number(path.split('/').at(-1))) ?? []).map((id) => ({ id })) });
		if (path === 'conversations/filter') {
			const filters = JSON.parse(init.body).payload;
			const agent = Number(filters.find((filter) => filter.attribute_key === 'assignee_id').values[0]);
			const statuses = filters.find((filter) => filter.attribute_key === 'status').values;
			const count = [...conversations.values()].filter((chat) => chat.assignee_id === agent && statuses.includes(chat.status)).length;
			return reply({ meta: { count } });
		}
		if (path === 'conversations' || path === 'conversations/meta') {
			const status = url.searchParams.get('status');
			const type = url.searchParams.get('assignee_type');
			const page = Number(url.searchParams.get('page'));
			const inboxId = Number(url.searchParams.get('inbox_id'));
			const items = [...conversations.values()].filter((chat) => chat.status === status && (!inboxId || chat.inbox_id === inboxId));
			const waiting = items.filter((chat) => chat.assignee_id === null);
			const active = items.filter((chat) => chat.assignee_id !== null);
			const selected = type === 'assigned' ? active : type === 'unassigned' ? waiting : items;
			const meta = { all_count: items.length, unassigned_count: waiting.length, assigned_count: active.length };
			if (path.endsWith('/meta')) return reply({ meta });
			return reply({ data: { meta, payload: selected.slice((page - 1) * 25, page * 25) } });
		}
		const match = /^conversations\/(\d+)(\/assignments)?$/.exec(path);
		if (match) {
			const chat = conversations.get(Number(match[1]));
			if (!chat) return reply({}, 404);
			if (!match[2]) return reply(chat);
			assert.equal(chat.assignee_id, null, 'Chat was already assigned');
			const { assignee_id } = JSON.parse(init.body);
			assignmentAttempts.set(chat.id, (assignmentAttempts.get(chat.id) ?? 0) + 1);
			chat.assignee_id = assignee_id;
			await new Promise((resolve) => setTimeout(resolve, 2));
			return reply({ id: assignee_id });
		}
	}
	throw new Error(`Unexpected local request to ${url.pathname}`);
}

const wave = async () => {
	const start = performance.now();
	const results = await Promise.all(agents.map(() => routeWaitingConversations(env, config)));
	assert.equal(results.filter((item) => !item.skipped).length, 1);
	return { milliseconds: Math.round(performance.now() - start), ...summary() };
};

async function deliverWebhook(signature, timestamp, bytes) {
	const response = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
	const utf8Boundary = bytes.indexOf(Buffer.from('С')) + 1;
	const request = Object.assign(Readable.from([bytes.subarray(0, utf8Boundary), bytes.subarray(utf8Boundary)]), {
		method: 'POST', url: '/api/chatwoot?action=webhook', headers: {
		'x-chatwoot-signature': signature,
		'x-chatwoot-timestamp': timestamp,
		'x-chatwoot-delivery': 'load-check-single-delivery',
	}});
	Object.defineProperty(request, 'body', { get: () => { throw new Error('Webhook must use the raw request stream'); } });
	await http(request, response);
	return response;
}

try {
	const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
	assert.deepEqual(vercel.rewrites.find((route) => route.source === '/api/chatwoot/webhook'), {
		source: '/api/chatwoot/webhook', destination: '/api/chatwoot?action=webhook',
	});
	await pg.exec(`
		create role anon;
		create role authenticated;
		create role service_role bypassrls;
		create schema auth;
		create table auth.users (id uuid primary key);
		create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('fixture.user', true), '')::uuid $$;
		grant usage on schema auth to authenticated;
		create schema realtime;
		create table realtime.messages(extension text);
		alter table realtime.messages enable row level security;
		insert into realtime.messages values ('broadcast');
		grant usage on schema realtime to authenticated;
		grant select on realtime.messages to authenticated;
		create function realtime.topic() returns text language sql as $$ select current_setting('fixture.topic', true) $$;
		create table realtime.fixture_events(payload jsonb, event text, topic text, is_private boolean);
		create function realtime.send(jsonb, text, text, boolean) returns void language sql
			as $$ insert into realtime.fixture_events values ($1, $2, $3, $4) $$;
		create table public.supportos_users (id uuid primary key, status text not null, email text, display_name text);
		create table public.supportos_user_roles(user_id uuid, role_id text);
		create table public.supportos_role_permissions(role_id text, permission_id text);
		grant select on public.supportos_users, public.supportos_user_roles, public.supportos_role_permissions to service_role;
	`);
	for (const migration of [
		'20261111185421_chatwoot_agent_routing',
		'20261112120000_chatwoot_widget_settings',
		'20261119045353_chatwoot_webhooks_realtime',
		'20261119045359_chatwoot_atomic_router_leases',
		'20261119045403_chatwoot_supervision',
		'20261119045408_chatwoot_coaching_notes',
	]) await pg.exec(await migrate(migration));
	await pg.exec(`
		insert into auth.users select ('00000000-0000-0000-0000-' || lpad(id::text, 12, '0'))::uuid from generate_series(1, ${agentCount}) as id;
		insert into public.supportos_users select id, 'active', right(id::text, 12) || '@fixture.invalid', 'Agent ' || right(id::text, 12) from auth.users;
		insert into public.supportos_user_roles select id, 'support' from auth.users;
		insert into public.supportos_role_permissions values ('support', 'work');
		insert into public.supportos_chatwoot_presence(user_id, chatwoot_agent_id, accepting)
			select id, right(id::text, 12)::bigint, true from auth.users;
		insert into public.supportos_chatwoot_agent_limits(chatwoot_agent_id, max_active_chats)
			select id, ${limit} from generate_series(1, ${agentCount}) as id;
	`);
	globalThis.fetch = fakeFetch;
	addChats(1, 20);
	const normal = await wave();
	assert.deepEqual(summary(), { assigned: 20, queued: 0, maxPerAgent: 1 });
	await new Promise((resolve) => setTimeout(resolve, 1050));
	addChats(21, 120);
	const peak = await wave();
	assert.deepEqual(summary(), { assigned: 100, queued: 40, maxPerAgent: 2 });

	// Race 50 manual requests for the same queued chat. Exactly one wins.
	const attempts = await Promise.all(agents.map((agent) => {
		const token = randomUUID();
		return rpc('supportos_chatwoot_reserve_conversation', {
			p_operation_token: token, p_conversation_id: 101, p_agent_ids: [agent],
			p_active_counts: {}, p_lease_token: null,
		}).then((result) => ({ ...result, token }));
	}));
	const winners = attempts.filter((item) => item.reserved);
	assert.equal(winners.length, 1);
	const winner = winners[0];
	assert.equal(await rpc('supportos_chatwoot_finish_conversation_operation', {
		p_conversation_id: 101, p_operation_token: randomUUID(), p_assignee_id: winner.agentId,
	}), false, 'A stale writer cannot finish another operation');
	conversations.get(101).assignee_id = winner.agentId;
	await rpc('supportos_chatwoot_finish_conversation_operation', {
		p_conversation_id: 101, p_operation_token: winner.token, p_assignee_id: winner.agentId,
	});
	assert.equal(summary().maxPerAgent, 3, 'A manual take can exceed the automatic limit');

	await new Promise((resolve) => setTimeout(resolve, 1050));
	for (const chat of [...conversations.values()].filter((chat) => chat.assignee_id && chat.assignee_id !== winner.agentId).slice(0, 20))
		chat.status = 'resolved';
	const refill = await wave();
	assert.equal(refill.queued, 19);
	assert.equal(refill.assigned, 101);
	assert.ok([...assignmentAttempts.values()].every((count) => count === 1));

	const shift = { day: 1, start: '22:00', end: '03:00' };
	assert.equal(onShift({ zone: 'UTC', shifts: [shift] }, new Date('2026-11-17T02:00:00Z')), true);
	assert.equal(onShift({ zone: 'UTC', shifts: [shift] }, new Date('2026-11-17T03:00:00Z')), false);
	const settings = normalizeOperations({
		agents: { 1: { zone: 'UTC', shifts: [shift], skills: ['EN', ' en '] } },
		inboxes: { 1: { skills: ['EN'], responseMinutes: 2, crm: '' } },
	});
	assert.deepEqual(settings.agents[1].skills, ['en']);
	assert.equal(slaSnapshot([{ id: 1, inbox_id: 1, waiting_since: 100 }], settings, 221000)[0].overdue, true);
	const outOfShiftDay = (new Date().getUTCDay() + 2) % 7;
	const projectRules = normalizeOperations({
		agents: {
			1: { zone: 'UTC', skills: ['payments'], shifts: [{ day: outOfShiftDay, start: '10:00', end: '11:00' }] },
			2: { zone: 'UTC', skills: ['payments'], shifts: [] },
		},
		inboxes: { 1: { skills: ['payments'], responseMinutes: 2, crm: '' } },
	});
	await pg.query('update public.supportos_chatwoot_operations set settings = $1', [JSON.stringify(projectRules)]);
	for (const chat of conversations.values()) chat.status = 'resolved';
	addChats(300, 410);
	for (let id = 300; id < 710; id++) conversations.get(id).assignee_id = 999;
	await new Promise((resolve) => setTimeout(resolve, 1050));
	addChats(200, 1);
	await wave();
	assert.equal(conversations.get(200).assignee_id, 2, 'Only the agent with the right skill and shift can take the project chat');

	// An older backlog is far deeper than the former 8-page scan. It must
	// remain queued even when nobody is accepting without blocking another source.
	for (const chat of conversations.values()) chat.status = 'resolved';
	await pg.exec(`update public.supportos_chatwoot_operations set settings = '{"agents":{},"inboxes":{}}'`);
	await pg.exec('update public.supportos_chatwoot_router_state set last_inbox_id = null');
	for (let inbox = 3; inbox <= 11; inbox++) inboxMembers.set(inbox, []);
	inboxMembers.set(11, agents);
	addChats(1000, 1500, 3);
	addChats(2500, 200, 11);
	addChats(2700, 40, 11, 'pending');
	await new Promise((resolve) => setTimeout(resolve, 1050));
	acceptingChats = false;
	const noAgents = await wave();
	assert.deepEqual(summary(), { assigned: 0, queued: 1740, maxPerAgent: 0 });
	acceptingChats = true;

	await new Promise((resolve) => setTimeout(resolve, 1050));
	await wave(); // Projects 1–8 include the unstaffed backlog and no available match.
	assert.equal(summary().queued, 1740);
	await new Promise((resolve) => setTimeout(resolve, 1050));
	const largePeak = await wave(); // The next pass continues at project 9.
	assert.deepEqual(summary(), { assigned: 100, queued: 1640, maxPerAgent: 2 });
	assert.ok([...conversations.values()].filter((chat) => chat.id >= 2500 && chat.id < 2600).every((chat) => chat.assignee_id));
	assert.equal(conversations.get(2700).assignee_id, null, 'Newer pending chats cannot leapfrog older open chats past the page boundary');

	await new Promise((resolve) => setTimeout(resolve, 1050));
	for (let id = 2500; id < 2520; id++) conversations.get(id).status = 'resolved';
	const largeRefill = await wave();
	assert.deepEqual(summary(), { assigned: 100, queued: 1620, maxPerAgent: 2 });
	assert.ok([...conversations.values()].filter((chat) => chat.inbox_id === 3).every((chat) => !chat.assignee_id));

	for (const [key, value] of Object.entries({
		...env, CHATWOOT_BASE_URL: config.base, CHATWOOT_ACCOUNT_ID: config.accountId, CHATWOOT_ACCESS_TOKEN: config.token,
	})) process.env[key] = value;
	const now = String(Math.floor(Date.now() / 1000));
	const bytes = Buffer.from(JSON.stringify({
		event: 'message_created', id: 5001, account: { id: 3 }, conversation: { id: 17, display_id: 9, inbox_id: 1 },
		content: 'Синтетическое сообщение',
	}));
	const signature = `sha256=${createHmac('sha256', webhookSecret).update(`${now}.`).update(bytes).digest('hex')}`;
	assert.equal((await deliverWebhook(`sha256=${'0'.repeat(64)}`, now, bytes)).statusCode, 401);
	assert.equal((await deliverWebhook(signature, now, bytes)).statusCode, 200);
	assert.equal((await deliverWebhook(signature, now, bytes)).body.duplicate, true);
	const broadcasts = (await pg.query('select payload from realtime.fixture_events')).rows;
	assert.equal(broadcasts.length, 1);
	assert.deepEqual(broadcasts[0].payload, { changed: true });
	assert.equal((await pg.query('select conversation_id from public.supportos_chatwoot_webhook_events')).rows[0].conversation_id, 9);
	const watcher = (await pg.query('select id from auth.users order by id limit 1')).rows[0].id;
	const recipient = (await pg.query('select id, email from public.supportos_users order by id offset 1 limit 1')).rows[0];
	const messageId = randomUUID();
	const sendCoaching = (email, content, id = messageId) => pg.query(
		'select public.supportos_chatwoot_send_coaching_note($1, 3, 9, $2, $3, $4) as saved',
		[id, watcher, email, content],
	).then((result) => result.rows[0].saved);
	const setWatch = (id, enabled) => pg.query(
		'select public.supportos_chatwoot_set_supervision($1, 3, $2, $3) as saved', [watcher, id, enabled],
	).then((result) => result.rows[0].saved);
	await pg.exec('set role service_role');
	assert.equal(await setWatch(1, true), true);
	assert.equal(await setWatch(1, true), true);
	assert.equal((await pg.query('select conversation_id from public.supportos_chatwoot_supervision')).rows.length, 1);
	assert.equal(await setWatch(1, false), true);
	assert.equal((await pg.query('select conversation_id from public.supportos_chatwoot_supervision')).rows.length, 0);
	assert.equal(await sendCoaching('unknown@fixture.invalid', 'Помогите игроку'), null);
	const saved = await sendCoaching(recipient.email.toUpperCase(), 'Помогите игроку');
	assert.equal(saved.content, 'Помогите игроку');
	assert.deepEqual(await sendCoaching(recipient.email, saved.content), saved);
	assert.equal(await sendCoaching(recipient.email, 'Другой текст с тем же ID'), null);
	assert.deepEqual((await pg.query('select recipient_id from public.supportos_chatwoot_coaching_notes')).rows, [{ recipient_id: recipient.id }]);
	await pg.exec('reset role');
	const coachBroadcasts = (await pg.query("select payload, topic, is_private from realtime.fixture_events where event = 'coaching_note' order by topic")).rows;
	assert.deepEqual(coachBroadcasts, [watcher, recipient.id].map((user) => ({
		payload: { changed: true }, topic: `chatwoot:coaching:${user}`, is_private: true,
	})));
	await pg.exec('set role authenticated');
	await assert.rejects(pg.query('select * from public.supportos_chatwoot_operations'), /permission denied/i);
	await assert.rejects(pg.query('select * from public.supportos_chatwoot_supervision'), /permission denied/i);
	await assert.rejects(setWatch(1, true), /permission denied/i);
	await assert.rejects(pg.query('select * from public.supportos_chatwoot_coaching_notes'), /permission denied/i);
	await assert.rejects(sendCoaching(recipient.email, 'Запрос из браузера'), /permission denied/i);
	await pg.query("select set_config('fixture.topic', $1, false), set_config('fixture.user', $2, false)", [`chatwoot:coaching:${recipient.id}`, watcher]);
	assert.equal((await pg.query('select * from realtime.messages')).rows.length, 0);
	await pg.query("select set_config('fixture.user', $1, false)", [recipient.id]);
	assert.equal((await pg.query('select * from realtime.messages')).rows.length, 1);
	await pg.exec('reset role');
	console.log(JSON.stringify({
		agents: agentCount, normal, peak, refill, simultaneousManualClaims: attempts.length, manualWinners: winners.length,
		noAgents, largePeak, largeRefill, signedWebhookBroadcasts: broadcasts.length,
	}, null, 2));
} finally {
	globalThis.fetch = originalFetch;
	await pg.close();
}
