import assert from 'node:assert/strict';
import handler from '../server/chatwoot/_http.js';

// Exercise the real proxy and auth checks with synthetic Supabase and Chatwoot responses.
const originalFetch = globalThis.fetch;
const environment = {
	SUPABASE_URL: 'https://local-storage.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
	SUPABASE_PUBLISHABLE_KEY: 'fixture-public', CHATWOOT_BASE_URL: 'https://local-chat.invalid',
	CHATWOOT_ACCOUNT_ID: '3', CHATWOOT_ACCESS_TOKEN: 'fixture-chat-token',
};
const originalEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
const roleNames = ['support', 'qc', 'admin', 'creator', 'disabled', 'shift'];
const sessionId = '41000000-0000-0000-0000-000000000010';
const users = roleNames.map((role, index) => {
	const id = `41000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`;
	const claims = Buffer.from(JSON.stringify({ sub: id, session_id: sessionId, aal: 'aal2' })).toString('base64url');
	return {
		id, role, email: `${role}@example.invalid`, agentId: index + 1, token: `fixture.${claims}.fixture`,
		permissions: ['work', ...(role === 'support' ? [] : ['monitor.read']), ...(role === 'creator' ? ['technical'] : [])],
	};
});
const byRole = new Map(users.map((user) => [user.role, user]));
const byId = new Map(users.map((user) => [user.id, user]));
const ip = '203.0.113.10';
const makeChat = (id, inbox_id, assignee_id, status = 'open') => ({
	id, inbox_id, assignee_id, status, labels: [], meta: { sender: { id: 100 + id, additional_attributes: { ip_address: ip } } },
});
const chats = new Map([
	[1, makeChat(1, 10, 1)], [2, makeChat(2, 20, 2)],
	[3, makeChat(3, 10, null)], [4, makeChat(4, 20, null)],
	[5, makeChat(5, 10, 1, 'resolved')], [6, makeChat(6, 10, 5, 'resolved')],
]);
for (const id of [2, 3, 5, 6]) chats.get(id).meta.sender.id = 101;
chats.get(1).meta.assignee = { id: 1, name: 'support', access_token: 'not-for-browser', pubsub_token: 'not-for-browser' };
chats.get(1).meta.sender.email = 'player@example.invalid';
chats.get(1).additional_attributes = { referer: 'https://project.example.invalid/play?token=private' };
chats.get(4).status = 'pending';
const watches = new Map();
const coaching = new Map();
const upstreamWrites = [];
const playerContact = { id: 101, name: 'Player', email: 'player@example.invalid', additional_attributes: { ip_address: ip }, contact_inboxes: [{ source_id: 'private-source' }] };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });

async function mockFetch(input, init = {}) {
	const url = new URL(input);
	const method = init.method ?? 'GET';
	const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
	if (url.hostname === 'local-storage.invalid') {
		if (url.pathname === '/auth/v1/user') {
			const user = users.find((item) => init.headers.Authorization === `Bearer ${item.token}`);
			return user ? response({ id: user.id, email: user.email }) : response({}, 401);
		}
		const resource = url.pathname.split('/').at(-1);
		if (resource === 'supportos_rbac_context') {
			const user = byId.get(body.subject);
			return response({ status: user.role === 'disabled' ? 'disabled' : 'active', roles: [{ id: user.role }], permissions: user.permissions });
		}
		if (resource === 'supportos_mfa_session_state') return response({ status: 'approved', mfaEnabled: false });
		if (resource === 'supportos_chatwoot_operations') return response([{ settings: { inboxes: {}, agents: {} }, updated_at: new Date().toISOString() }]);
		if (resource === 'supportos_chatwoot_webhook_config') return response([]);
		if (resource === 'supportos_chatwoot_webhook_events') return response([]);
		if (resource === 'supportos_chatwoot_reserve_conversation') return response({ reserved: true });
		if (resource === 'supportos_chatwoot_finish_conversation_operation') return response(true);
		if (resource === 'supportos_chatwoot_supervision') {
			const userId = url.searchParams.get('user_id').slice(3);
			const account = url.searchParams.get('account_id').slice(3);
			return response([...(watches.get(`${account}/${userId}`) ?? [])].map((conversation_id) => ({ conversation_id })));
		}
		if (resource === 'supportos_chatwoot_set_supervision') {
			const key = `${body.p_account_id}/${body.p_user_id}`;
			const ids = watches.get(key) ?? new Set();
			if (body.p_enabled) ids.add(body.p_conversation_id);
			else ids.delete(body.p_conversation_id);
			watches.set(key, ids);
			return response(true);
		}
		if (resource === 'supportos_chatwoot_send_coaching_note') {
			const recipient = users.find((user) => user.email === body.p_recipient_email && user.role !== 'disabled');
			if (!recipient) return response(null);
			const saved = coaching.get(body.p_id) ?? {
				id: body.p_id, account_id: body.p_account_id, conversation_id: body.p_conversation_id,
				author_id: body.p_author_id, recipient_id: recipient.id, author_name: 'QC',
				content: body.p_content, created_at: '2026-11-18T20:00:00Z',
			};
			coaching.set(saved.id, saved);
			return response(saved);
		}
		if (resource === 'supportos_chatwoot_coaching_notes') {
			const or = url.searchParams.get('or');
			const actor = /^(?:\(author_id\.eq\.)([^,]+),recipient_id\.eq\.\1\)$/.exec(or)?.[1];
			assert.ok(actor);
			return response([...coaching.values()].filter((row) =>
				url.searchParams.get('account_id') === `eq.${row.account_id}` &&
				url.searchParams.get('conversation_id') === `eq.${row.conversation_id}` &&
				(row.author_id === actor || row.recipient_id === actor)));
		}
	}
	if (url.hostname === 'local-chat.invalid') {
		const path = url.pathname.replace('/api/v1/accounts/3/', '');
		if (path === '/api/v1/profile') return response({ email: 'private-service-profile@example.invalid' });
		if (path === 'agents') return response(users.map(({ agentId, email, role }) => ({ id: agentId, email, name: role })));
		if (path === 'inboxes') return response({ payload: [{ id: 10, name: 'Project A', token: 'internal' }, { id: 20, name: 'Project B' }] });
		if (path === 'inbox_members/10') return response({ payload: [{ id: 1 }, { id: 3 }] });
		if (path === 'inbox_members/20') return response({ payload: [{ id: 2 }, { id: 4 }] });
		if (path === 'conversations/filter') {
			const sort = url.searchParams.get('sort_by');
			if (!sort) return response({ data: { payload: [...chats.values()] } });
			const fields = { display_id: 'id', contact_id: 'contact_id' };
			const rows = [...chats.values()].filter((chat) => body.payload.every(({ attribute_key, values }) => {
				const value = attribute_key === 'contact_id' ? chat.meta.sender.id : chat[fields[attribute_key] ?? attribute_key];
				return values.includes(value);
			}));
			if (sort === 'created_at_asc') rows.reverse();
			return response({ payload: rows, meta: { all_count: rows.length } });
		}
		if (path === 'contacts') return response({ payload: [playerContact], meta: { count: 30 } });
		if (path === 'contacts/search') return response({ payload: url.searchParams.get('q') === 'player@example.invalid' ? [playerContact] : [], meta: { count: 1, has_more: true } });
		if (path === 'conversations') return response({ data: { payload: [...chats.values()], meta: { unassigned_count: 2 } } });
		if (path === 'labels') {
			if (method === 'GET') return response({ payload: [{ id: 1, title: 'billing' }] });
			upstreamWrites.push({ path, method, body });
			return response({ id: 2, title: body.title });
		}
		const conversation = /^conversations\/(\d+)(?:\/(\w+))?$/.exec(path);
		if (conversation) {
			const row = chats.get(Number(conversation[1]));
			if (!row) return response({}, 404);
			const action = conversation[2];
			if (!action) return response(row);
			if (method === 'GET' && action === 'messages') return response({ payload: [{ id: 50, content: 'synthetic', ip_address: ip }] });
			if (method === 'POST') {
				upstreamWrites.push({ path, method, body });
				if (action === 'assignments' && Object.hasOwn(body, 'assignee_id')) row.assignee_id = body.assignee_id;
				return response({ id: 1, ok: true });
			}
		}
		if (path === 'contacts/101') {
			if (method === 'GET') return response({ payload: playerContact });
			assert.equal(method, 'PUT');
			upstreamWrites.push({ path, method, body });
			if (body.email === 'already-used@example.invalid') return response({ error: 'duplicate' }, 422);
			Object.assign(playerContact, body);
			return response({ payload: playerContact });
		}
		if (path === 'contacts/101/conversations' && method === 'GET') return response({ payload: [...chats.values()] });
		if (path === 'contacts/101/notes') {
			if (method === 'GET') return response([{ id: 1, content: 'Previous', created_at: 1700000000, user: { name: 'Agent', email: 'private@example.invalid' } }]);
			upstreamWrites.push({ path, method, body });
			return response({ id: 2, content: body.note.content, created_at: 1700000001, user: { name: 'Agent' } });
		}
		if (path === 'actions/contact_merge') {
			upstreamWrites.push({ path, method, body });
			return response({ id: body.base_contact_id });
		}
	}
	throw new Error(`Unhandled fixture request ${method} ${url.pathname}`);
}

async function call(role, action, { method = 'GET', query = '', body } = {}) {
	const user = byRole.get(role);
	const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
	await handler({ method, url: `/api/chatwoot?action=${action}${query}`, headers: { authorization: `Bearer ${user.token}` }, body }, res);
	return { status: res.statusCode, body: res.body };
}
async function expectStatus(role, action, expected, options) {
	const result = await call(role, action, options);
	assert.equal(result.status, expected, `${role} ${action}: ${JSON.stringify(result.body)}`);
	return result.body;
}
const post = (body) => ({ method: 'POST', body });

try {
	Object.assign(process.env, environment);
	globalThis.fetch = mockFetch;
	assert.equal((await expectStatus('support', 'health', 200)).capabilities.role, 'support');
	assert.equal((await expectStatus('disabled', 'health', 403)).error.includes('отключён'), true);
	const own = await expectStatus('support', 'conversation', 200, { query: '&id=1' });
	assert.equal(own.access.write, true);
	assert.equal(own.visitor.ip, ip);
	assert.deepEqual(own.meta.assignee, { id: 1, name: 'support' });
	await expectStatus('support', 'conversation', 403, { query: '&id=2' });
	await expectStatus('support', 'messages', 403, { query: '&id=2' });
	await expectStatus('support', 'messages', 403, { query: '&id=4' });
	await expectStatus('support', 'contact', 403, { query: '&id=102&conversationId=1' });
	await expectStatus('support', 'contact', 200, { query: '&id=101&conversationId=1' });
	const related = await expectStatus('support', 'contact-history', 200, { query: '&id=101&conversationId=1' });
	assert.deepEqual(related.payload.map((item) => item.id), [5, 3]);
	assert.ok(related.payload.every((item) => !item.meta));
	await expectStatus('support', 'contact-block', 403, post({ conversationId: 1, contactId: 102, blocked: true }));
	const profile = { contactId: 101, conversationId: 1, fields: { name: ' Player updated ', phone_number: '+40 (712) 345 678' } };
	const contactWrites = upstreamWrites.length;
	await expectStatus('support', 'contact-profile', 403, post({ ...profile, contactId: 102 }));
	await expectStatus('support', 'contact-profile', 403, post({ ...profile, conversationId: 3 }));
	await expectStatus('qc', 'contact-profile', 403, post(profile));
	await expectStatus('support', 'contact-profile', 400, post({ ...profile, fields: { identifier: 'forbidden' } }));
	await expectStatus('support', 'contact-profile', 400, post({ ...profile, fields: { phone_number: '0712 345 678' } }));
	assert.equal(upstreamWrites.length, contactWrites);
	assert.equal((await expectStatus('support', 'contact-profile', 200, post(profile))).name, 'Player updated');
	assert.deepEqual(upstreamWrites.at(-1).body, { name: 'Player updated', phone_number: '+40712345678' });
	for (const role of ['support', 'qc', 'shift', 'disabled']) {
		await expectStatus(role, 'contact-directory', 403);
		await expectStatus(role, 'contact-directory', 403, post(profile));
		await expectStatus(role, 'directory-contact-history', 403, { query: '&id=101' });
	}
	const directory = await expectStatus('admin', 'contact-directory', 200);
	assert.equal(directory.hasMore, true);
	assert.equal(directory.payload[0].contact_inboxes, undefined);
	assert.equal(JSON.stringify(directory).includes(ip), false);
	assert.equal((await expectStatus('admin', 'contact-directory', 200, { query: '&page=2' })).hasMore, false);
	assert.equal((await expectStatus('creator', 'contact-directory', 200, { query: '&q=player%40example.invalid' })).hasMore, true);
	assert.equal((await expectStatus('admin', 'directory-contact-history', 200, { query: '&id=101' })).payload.some(({ id }) => id === 2), true);
	await expectStatus('admin', 'contact-directory', 422, post({ contactId: 101, fields: { email: 'already-used@example.invalid' } }));
	assert.equal((await expectStatus('admin', 'contact-directory', 200, post({ contactId: 101, fields: { phone_number: null } }))).phone_number, null);
	await expectStatus('support', 'directory-contact-notes', 403, { query: '&id=101' });
	await expectStatus('qc', 'directory-contact-merge', 403, post({ baseId: 101, duplicateId: 102, confirmed: true }));
	const contactNotes = await expectStatus('admin', 'directory-contact-notes', 200, { query: '&id=101' });
	assert.deepEqual(contactNotes.notes[0], { id: 1, content: 'Previous', created_at: 1700000000, author: 'Agent' });
	assert.equal((await expectStatus('creator', 'directory-contact-notes', 200, post({ contactId: 101, content: 'Active note' }))).content, 'Active note');
	const beforeMerge = upstreamWrites.length;
	await expectStatus('admin', 'directory-contact-merge', 400, post({ baseId: 101, duplicateId: 102 }));
	await expectStatus('admin', 'directory-contact-merge', 400, post({ baseId: 101, duplicateId: 101, confirmed: true }));
	assert.equal(upstreamWrites.length, beforeMerge);
	await expectStatus('admin', 'directory-contact-merge', 200, post({ baseId: 101, duplicateId: 102, confirmed: true }));
	assert.deepEqual(upstreamWrites.at(-1).body, { base_contact_id: 101, mergee_contact_id: 102 });
	await expectStatus('support', 'custom-attribute-values', 403, post({ conversationId: 1, contactId: 102, attributes: { login: 'local' } }));
	const preview = await expectStatus('support', 'conversation', 200, { query: '&id=3' });
	assert.equal(preview.access.take, true);
	assert.equal(preview.access.write, false);
	assert.equal(preview.visitor.ip, undefined);
	assert.equal(preview.meta.sender.additional_attributes.ip_address, undefined);
	const messages = await expectStatus('support', 'messages', 200, { query: '&id=3' });
	assert.equal(messages.payload[0].ip_address, undefined);
	await expectStatus('support', 'message', 403, post({ conversationId: 3, content: 'not assigned' }));
	await expectStatus('support', 'labels', 400, post({ conversationId: 1, labels: ['new-undefined-tag'] }));
	await expectStatus('support', 'conversations', 403, { query: '&scope=queue&inbox_id=20' });
	const queue = await expectStatus('support', 'conversations', 200, { query: '&scope=queue' });
	assert.deepEqual(queue.payload.map((item) => item.id), [3]);
	const archives = await expectStatus('support', 'conversations', 200, { query: '&scope=history&agent_id=2' });
	assert.ok(archives.payload.some((item) => item.id === 5));
	assert.ok(archives.payload.every((item) => item.assignee_id === 1 && item.inbox_id === 10));
	assert.equal(archives.data, undefined, 'No unfiltered nested result may be returned');
	await expectStatus('support', 'take', 200, post({ conversationId: 3, assigneeId: 2 }));
	assert.equal(chats.get(3).assignee_id, 1);
	await expectStatus('support', 'chat-supervisor', 403);
	await expectStatus('support', 'active-overview', 403);
	await expectStatus('support', 'supervision', 403, post({ conversationId: 1, enabled: true }));
	await expectStatus('support', 'chat-label', 403, post({ name: 'admin-only' }));

	const qc = await expectStatus('qc', 'conversation', 200, { query: '&id=1' });
	assert.equal(qc.access.note, true);
	assert.equal(qc.access.write, false);
	assert.deepEqual(qc.coachRecipient, { id: 1, name: 'support' });
	await expectStatus('qc', 'message', 403, post({ conversationId: 1, content: 'not public' }));
	await expectStatus('qc', 'message', 200, post({ conversationId: 1, private: true, content: 'QA note' }));
	await expectStatus('qc', 'priority', 403, post({ conversationId: 1, priority: 'high' }));
	await expectStatus('qc', 'chat-operations', 200);
	await expectStatus('qc', 'website-inboxes', 403);
	const note = { conversationId: 1, recipientAgentId: 1, noteId: '12345678-1234-4234-8234-123456789012', content: 'Личная подсказка' };
	const beforeCoach = upstreamWrites.length;
	await expectStatus('support', 'coaching-notes', 403, post(note));
	await expectStatus('qc', 'coaching-notes', 409, post({ ...note, recipientAgentId: 2 }));
	await expectStatus('qc', 'coaching-notes', 409, post({ ...note, conversationId: 5 }));
	await expectStatus('qc', 'coaching-notes', 409, post({ ...note, conversationId: 4 }));
	const authored = await expectStatus('qc', 'coaching-notes', 200, post(note));
	assert.equal(authored.own, true);
	assert.equal(authored.content, note.content);
	assert.equal(coaching.get(note.noteId).recipient_id, byRole.get('support').id);
	const coachingRead = { query: '&id=1' };
	assert.deepEqual((await expectStatus('support', 'coaching-notes', 200, coachingRead)).notes, [{ ...authored, own: false }]);
	assert.deepEqual((await expectStatus('qc', 'coaching-notes', 200, coachingRead)).notes, [authored]);
	assert.deepEqual((await expectStatus('admin', 'coaching-notes', 200, coachingRead)).notes, []);
	assert.deepEqual((await expectStatus('creator', 'coaching-notes', 200, coachingRead)).notes, []);
	await expectStatus('disabled', 'coaching-notes', 403, coachingRead);
	assert.deepEqual((await expectStatus('shift', 'coaching-notes', 200, coachingRead)).notes, []);
	await expectStatus('shift', 'coaching-notes', 200, post({
		...note, noteId: '22345678-1234-4234-8234-123456789012', content: 'Подсказка от руководителя смены',
	}));
	assert.equal(upstreamWrites.length, beforeCoach, 'Coaching notes must stay out of Chatwoot');
	assert.equal(JSON.stringify(await expectStatus('support', 'messages', 200, coachingRead)).includes(note.content), false);
	const originalAssignee = chats.get(1).meta.assignee;
	chats.get(1).meta.assignee = { id: 3, name: 'admin' };
	await expectStatus('qc', 'coaching-notes', 409, post(note));
	assert.deepEqual((await expectStatus('admin', 'coaching-notes', 200, coachingRead)).notes, []);
	chats.get(1).meta.assignee = originalAssignee;
	const active = await expectStatus('qc', 'active-overview', 200, { query: '&sort=created_at_asc&search=player%40example.invalid&inbox=10' });
	assert.equal(active.total, 2);
	assert.deepEqual(active.rows.map((row) => row.id), [3, 1]);
	assert.equal(active.rows[1].lastPage, 'project.example.invalid/play');
	assert.equal(JSON.stringify(active).includes('not-for-browser'), false);
	assert.deepEqual((await expectStatus('qc', 'active-overview', 200, { query: '&mode=pending' })).rows.map((row) => row.id), [4]);
	const writesBeforeWatch = upstreamWrites.length;
	await expectStatus('qc', 'supervision', 409, post({ conversationId: 5, enabled: true }));
	assert.deepEqual(await expectStatus('qc', 'supervision', 200, post({ conversationId: 1, enabled: true })), { id: 1, watching: true });
	assert.equal(upstreamWrites.length, writesBeforeWatch, 'Watching must not change assignment, participants, or messages in Chatwoot');
	assert.equal(chats.get(1).assignee_id, 1);
	assert.deepEqual((await expectStatus('qc', 'supervision', 200)).ids, [1]);
	assert.deepEqual((await expectStatus('admin', 'supervision', 200)).ids, []);
	assert.deepEqual((await expectStatus('creator', 'supervision', 200)).ids, []);
	chats.get(1).status = 'resolved';
	const followed = await expectStatus('qc', 'active-overview', 200, { query: '&mode=watching&search=%231' });
	assert.equal(followed.rows[0]?.status, 'resolved');
	chats.get(1).status = 'open';
	await expectStatus('qc', 'supervision', 200, post({ conversationId: 1, enabled: false }));
	assert.equal((await expectStatus('qc', 'active-overview', 200, { query: '&mode=watching' })).total, 0);

	await expectStatus('admin', 'priority', 200, post({ conversationId: 1, priority: 'urgent' }));
	const snoozedUntil = Math.floor(Date.now() / 1000) + 1800;
	await expectStatus('admin', 'status', 200, post({ conversationId: 1, status: 'snoozed', snoozedUntil }));
	await expectStatus('admin', 'assign', 200, post({ conversationId: 1, teamId: 17 }));
	await expectStatus('admin', 'chat-label', 200, post({ name: 'approved-label', color: '#123456' }));
	await expectStatus('admin', 'webhook-secret', 403);
	await expectStatus('admin', 'website-source', 403, { method: 'DELETE', body: { inboxId: 10 } });
	assert.equal((await expectStatus('creator', 'health', 200)).capabilities.deleteProjects, true);
	await expectStatus('creator', 'webhook-secret', 200);

	assert.ok(upstreamWrites.some(({ path, body }) => path.endsWith('/messages') && body.private === true));
	assert.ok(upstreamWrites.some(({ path, body }) => path.endsWith('/toggle_status') && body.snoozed_until === snoozedUntil));
	assert.deepEqual(upstreamWrites.find(({ path, body }) => path.endsWith('/assignments') && body.team_id)?.body, { team_id: 17 });
	assert.ok(!upstreamWrites.some(({ path, body }) => path.endsWith('/messages') && body.private !== true));
	console.log('Chatwoot access and conversation actions passed for Support, QC, Admin, Creator, and a disabled account.');
} finally {
	globalThis.fetch = originalFetch;
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}
