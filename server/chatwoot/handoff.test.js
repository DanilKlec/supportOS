import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { afterEach, expect, test, vi } from 'vitest';
import { routeWaitingConversations } from './index.js';

afterEach(() => vi.unstubAllGlobals());

test('disconnect disables intake, protects concurrent edits, and releases slots only to a fresh agent under the cap', async () => {
	const database = new PGlite();
	const migrations = new URL('../../supabase/migrations/', import.meta.url);
	const names = await readdir(migrations);
	const migration = (suffix) => readFile(new URL(names.find((name) => name.endsWith(`_${suffix}.sql`)), migrations), 'utf8');
	const agent = randomUUID();
	const backup = randomUUID();
	const lease = randomUUID();
	const conversation = 500;
	const rpc = async (name, ...params) => (await database.query(
		`select public.supportos_chatwoot_${name}(${params.map((_, i) => `$${i + 1}`).join(', ')}) as result`, params,
	)).rows[0].result;
	try {
		await database.exec(`create role anon; create role authenticated; create role service_role;
			create schema auth; create table auth.users(id uuid primary key);
			create table public.supportos_users(id uuid primary key, status text);`);
		for (const name of ['chatwoot_agent_routing', 'chatwoot_widget_settings', 'chatwoot_atomic_router_leases', 'chatwoot_disconnect_handoff'])
			await database.exec(await migration(name));
		await database.query('insert into auth.users values ($1), ($2)', [agent, backup]);
		await database.query("insert into public.supportos_users values ($1, 'active'), ($2, 'active')", [agent, backup]);
		expect(await rpc('record_presence', agent, 101, true)).toMatchObject({ accepting: true });
		await rpc('record_presence', backup, 102, true);
		await database.exec('insert into public.supportos_chatwoot_agent_limits(chatwoot_agent_id, max_active_chats) values (102, 1)');
		await database.query("update public.supportos_chatwoot_presence set heartbeat_at = now() - interval '30 seconds' where user_id = $1", [agent]);
		expect(await rpc('record_presence', agent, null, null)).toMatchObject({ accepting: true, handoff_since: null });
		await database.query("update public.supportos_chatwoot_presence set heartbeat_at = now() - interval '95 seconds' where user_id = $1", [agent]);
		// A reconnect can arrive before the scheduled check and must preserve the outage.
		const recovered = await rpc('record_presence', agent, null, null);
		expect(recovered).toMatchObject({ accepting: false, handoff_since: expect.any(String) });
		expect(await rpc('record_presence', agent, 101, true)).toMatchObject({ accepting: false });
		expect(await rpc('acquire_router_lease', lease, 1, 35)).toBe(true);
		const pending = await database.query('select * from public.supportos_chatwoot_expire_presence($1)', [lease]);
		expect(pending.rows).toEqual([expect.objectContaining({ user_id: agent, chatwoot_agent_id: 101 })]);
		const token = randomUUID();
		const handoff = [lease, agent, 101, recovered.handoff_since];
		expect(await rpc('reserve_handoff', ...handoff, conversation, token)).toMatchObject({ reserved: true });
		expect(await rpc('reserve_conversation', randomUUID(), conversation, [102], {}, null)).toMatchObject({ reserved: false });
		expect(await rpc('finish_conversation_operation', conversation, token, null)).toBe(true);
		expect(await rpc('reserve_conversation', randomUUID(), conversation, [101, 102], { 101: 0, 102: 1 }, lease)).toMatchObject({ reserved: false });
		expect(await rpc('reserve_conversation', randomUUID(), conversation, [101, 102], { 101: 0, 102: 0 }, lease)).toMatchObject({ reserved: true, agentId: 102 });
		expect(await rpc('complete_handoff', ...handoff)).toBe(true);
		expect(await rpc('record_presence', agent, null, null)).toMatchObject({ accepting: false, handoff_since: null });
		expect(await rpc('record_presence', agent, 101, true)).toMatchObject({ accepting: true });
		await database.query("update public.supportos_chatwoot_presence set heartbeat_at = now() - interval '95 seconds' where user_id = $1", [backup]);
		const expired = await database.query('select * from public.supportos_chatwoot_expire_presence($1)', [lease]);
		expect(expired.rows).toEqual([expect.objectContaining({ user_id: backup, chatwoot_agent_id: 102 })]);
		const state = await database.query('select accepting, offline_since from public.supportos_chatwoot_presence where user_id = $1', [backup]);
		expect(state.rows[0]).toMatchObject({ accepting: false, offline_since: expect.any(Date) });
	} finally {
		await database.close();
	}
}, 20000);

test('active chats return to the queue with no available agent and finished or reassigned chats are kept', async () => {
	const userId = randomUUID();
	const handoff = '2026-11-24T10:00:00.000Z';
	const env = { SUPABASE_URL: 'https://database.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test' };
	const cfg = { base: 'https://chat.invalid', accountId: '3', token: 'test' };
	const row = (id, status = 'open', assignee_id = 101) => ({ id, status, assignee_id, created_at: 1764000000 + id });
	const finished = new Map();
	const assignments = [];
	const fetchMock = vi.fn(async (input, init) => {
		const url = new URL(input);
		const path = url.pathname;
		const body = init.body && JSON.parse(init.body);
		if (path.endsWith('acquire_router_lease') || path.endsWith('release_router_lease')) return Response.json(true);
		if (path.endsWith('expire_presence')) return Response.json([{ user_id: userId, chatwoot_agent_id: 101, handoff_since: handoff }]);
		if (path.endsWith('/filter')) {
			expect(body.payload).toEqual([
				{ attribute_key: 'status', filter_operator: 'equal_to', values: ['open', 'pending'], query_operator: 'AND' },
				{ attribute_key: 'assignee_id', filter_operator: 'equal_to', values: ['101'], query_operator: null },
			]);
			return Response.json({ payload: [row(1), row(2), row(3), row(4, 'pending'), row(5, 'open', 102)] });
		}
		if (path.endsWith('reserve_handoff')) return Response.json({ reserved: true });
		if (path.endsWith('finish_conversation_operation')) {
			finished.set(body.p_conversation_id, body.p_assignee_id);
			return Response.json(true);
		}
		if (path.endsWith('/assignments')) {
			assignments.push({ id: Number(path.split('/').at(-2)), body });
			return Response.json(null);
		}
		if (path.endsWith('/conversations/1')) return Response.json(row(1));
		if (path.endsWith('/conversations/2')) return Response.json(row(2, 'resolved'));
		if (path.endsWith('/conversations/3')) return Response.json(row(3, 'open', 102));
		if (path.endsWith('/conversations/4')) return Response.json(row(4, 'pending'));
		if (path.endsWith('supportos_chatwoot_presence')) return Response.json([]);
		throw new Error(`Unexpected request to ${path}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	expect(await routeWaitingConversations(env, cfg)).toEqual({ assigned: 0, requeued: 2 });
	expect(assignments).toEqual([{ id: 1, body: { assignee_id: null } }, { id: 4, body: { assignee_id: null } }]);
	expect(finished.get(3)).toBe(102);
});
