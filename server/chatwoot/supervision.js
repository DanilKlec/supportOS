import { db } from '../agent-monitor/_server.js';

const active = ['open', 'pending'];
const statuses = [...active, 'resolved', 'snoozed'];
const sorts = new Set(['last_activity_at_desc', 'last_activity_at_asc', 'created_at_asc', 'created_at_desc', 'priority_desc', 'waiting_since_asc']);
const priorities = ['low', 'medium', 'high', 'urgent'];
function list(data) {
	const rows = data?.data?.payload ?? data?.payload ?? data;
	if (!Array.isArray(rows)) throw fail('Chatwoot вернул неожиданный список.', 502);
	return rows;
}
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const isId = (value) => /^[1-9]\d{0,15}$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value));
const text = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim().slice(0, 220);

export async function supervisedIds(env, account, userId) {
	const rows = await db(env, `supportos_chatwoot_supervision?select=conversation_id&user_id=eq.${encodeURIComponent(userId)}&account_id=eq.${account}&order=created_at.desc&limit=100`);
	return rows.map(({ conversation_id }) => Number(conversation_id)).filter(isId);
}

export async function changeSupervision({ env, account, userId, conversationId, enabled, upstream }) {
	if (!isId(conversationId) || typeof enabled !== 'boolean') throw fail('Укажите диалог и действие');
	const id = Number(conversationId);
	if (enabled) {
		const existing = await supervisedIds(env, account, userId);
		if (existing.includes(id)) return { id, watching: true };
		const result = await upstream(`/accounts/${account}/conversations/${id}`);
		const row = result?.data?.payload ?? result?.payload ?? result;
		if (!active.includes(row?.status)) throw fail('Для наблюдения выберите активный диалог.', 409);
	}
	const saved = await db(env, 'rpc/supportos_chatwoot_set_supervision', {
		p_user_id: userId, p_account_id: account, p_conversation_id: id, p_enabled: enabled,
	});
	if (saved !== true) throw fail('В списке наблюдения уже 100 диалогов. Уберите завершённые и попробуйте снова.', 409);
	return { id, watching: enabled };
}

const noteView = ({ id, author_name, content, created_at }, own) => ({
	id, author: author_name || 'Супервайзер', content, createdAt: created_at, own,
});

export async function coachingNotes(env, account, conversationId, userId) {
	const params = new URLSearchParams({
		select: 'id,author_id,author_name,content,created_at',
		account_id: `eq.${account}`,
		conversation_id: `eq.${conversationId}`,
		or: `(author_id.eq.${userId},recipient_id.eq.${userId})`,
		order: 'created_at.desc,id.desc',
		limit: '100',
	});
	const rows = await db(env, `supportos_chatwoot_coaching_notes?${params}`);
	return rows.map((row) => noteView(row, row.author_id === userId));
}

export async function sendCoachingNote(env, account, conversationId, userId, recipientEmail, note) {
	const saved = await db(env, 'rpc/supportos_chatwoot_send_coaching_note', {
		p_id: note.id, p_account_id: account, p_conversation_id: conversationId,
		p_author_id: userId, p_recipient_email: recipientEmail, p_content: note.content,
	});
	if (!saved) throw fail('У агента должна быть активная учётная запись SupportOS с той же почтой, что и в Chatwoot.', 409);
	return noteView(saved, true);
}

function webAddress(value, hostnameOnly = false) {
	const candidate = text(value);
	if (!candidate) return undefined;
	try {
		const address = new URL(candidate);
		if (address.protocol === 'https:' || address.protocol === 'http:') {
			return hostnameOnly ? address.hostname : (address.hostname + address.pathname).slice(0, 220);
		}
	} catch {
		if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate)) return candidate;
	}
	return undefined;
}

function view(row) {
	const meta = row.meta ?? {};
	const sender = meta.sender ?? {};
	const profile = sender.additional_attributes ?? {};
	const custom = sender.custom_attributes ?? {};
	const visit = row.additional_attributes ?? {};
	const browser = visit.browser ?? {};
	const agent = meta.assignee ?? meta.agent_bot ?? row.agent_bot;
	const number = (value) => value == null || value === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 ? undefined : Number(value);
	const timestamp = (value) => {
		if (!value || value === '0') return undefined;
		const numeric = Number(value);
		const ms = Number.isFinite(numeric) ? numeric * (numeric < 1e12 ? 1000 : 1) : Date.parse(value);
		return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? ms : undefined;
	};
	return {
		id: Number(row.id), inboxId: number(row.inbox_id ?? meta.inbox?.id),
		player: text(sender.name, sender.identifier), email: text(sender.email),
		agent: text(agent?.available_name, agent?.name), team: text(meta.team?.name),
		project: text(meta.inbox?.name), status: row.status, priority: priorities.includes(row.priority) ? row.priority : undefined,
		startedAt: timestamp(row.created_at), activityAt: timestamp(row.last_activity_at ?? row.updated_at ?? row.timestamp),
		waitingSince: timestamp(row.waiting_since),
		country: text(profile.country, profile.country_code, sender.country_code), region: text(profile.region, profile.state), city: text(profile.city),
		device: text(browser.device_name, browser.platform_name, profile.device),
		referrer: webAddress(visit.referrer ?? visit.referring_url ?? profile.referrer, true),
		lastPage: webAddress(visit.current_url ?? visit.last_page ?? visit.referer),
		visits: number(profile.visits_count ?? custom.visits_count),
		tags: Array.isArray(row.labels) ? row.labels.filter((value) => typeof value === 'string').slice(0, 12) : [],
	};
}

async function findContactIds(upstream, account, query) {
	const ids = new Set();
	let truncated = false;
	for (let page = 1; page <= 4; page++) {
		const params = new URLSearchParams({ q: query, page: String(page), include_contact_inboxes: 'false' });
		const result = await upstream(`/accounts/${account}/contacts/search?${params}`);
		const rows = list(result);
		if (!rows.length) break;
		const previousCount = ids.size;
		for (const row of rows) if (isId(row.id)) ids.add(Number(row.id));
		const rawCount = result?.meta?.count ?? result?.data?.meta?.count;
		const count = rawCount == null ? null : Number(rawCount);
		const hasMore = result?.meta?.has_more ?? result?.data?.meta?.has_more;
		if (hasMore === false || (hasMore !== true && count !== null && ids.size >= count)) break;
		if (ids.size === previousCount || page === 4) {
			truncated = hasMore === true || count === null || count > ids.size;
			break;
		}
	}
	return { ids: [...ids], truncated };
}

export async function activeOverview({ env, account, userId, params, upstream }) {
	const mode = params.get('mode') ?? 'all';
	const sort = params.get('sort') ?? 'last_activity_at_desc';
	const rawPage = Number(params.get('page') ?? 1);
	if (!['all', 'open', 'pending', 'watching'].includes(mode) || !sorts.has(sort) || !Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 10000)
		throw fail('Проверьте фильтры активных диалогов');
	const filters = [];
	const add = (key, values) => filters.push({ attribute_key: key, filter_operator: 'equal_to', values, query_operator: 'AND' });
	const selectedStatuses = mode === 'watching' ? statuses : mode === 'all' ? active : [mode];
	add('status', selectedStatuses);
	for (const field of ['inbox', 'agent', 'team']) {
		const id = params.get(field);
		if (id && !isId(id)) throw fail('Проверьте проект, агента или команду');
		if (id) add(field === 'agent' ? 'assignee_id' : `${field}_id`, [Number(id)]);
	}
	const priority = params.get('priority');
	if (priority && !priorities.includes(priority)) throw fail('Проверьте приоритет');
	if (priority) add('priority', [priority]);
	const label = params.get('label')?.trim();
	if (label?.length > 80) throw fail('Проверьте тег');
	if (label) add('labels', [label]);
	const empty = { rows: [], total: 0, hasMore: false, searchTruncated: false };
	const watching = mode === 'watching' ? new Set(await supervisedIds(env, account, userId)) : null;
	if (watching?.size === 0) return empty;
	const search = params.get('search')?.trim().slice(0, 120);
	const displayId = search?.startsWith('#') && isId(search.slice(1)) ? Number(search.slice(1)) : null;
	if (displayId && watching && !watching.has(displayId)) return empty;
	if (displayId || watching) add('display_id', displayId ? [displayId] : [...watching]);
	let searchTruncated = false;
	if (search && !displayId) {
		const matches = await findContactIds(upstream, account, search);
		if (!matches.ids.length) return { ...empty, searchTruncated: matches.truncated };
		add('contact_id', matches.ids);
		searchTruncated = matches.truncated;
	}
	filters.at(-1).query_operator = null;
	const result = await upstream(`/accounts/${account}/conversations/filter?page=${rawPage}&sort_by=${sort}`, {
		method: 'POST', body: { payload: filters },
	});
	const rows = list(result);
	const meta = result?.data?.meta ?? result?.meta;
	const count = meta?.all_count ?? meta?.count?.all_count ?? meta?.count;
	const total = count != null && Number.isSafeInteger(Number(count)) && Number(count) >= 0 ? Number(count) : null;
	return {
		rows: rows.filter((row) => isId(row.id) && selectedStatuses.includes(row.status) && (!watching || watching.has(Number(row.id)))).map(view),
		total, hasMore: total === null ? rows.length >= 25 : total > rawPage * 25, searchTruncated,
	};
}
