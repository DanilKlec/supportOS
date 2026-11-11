import { requireUser } from '../_auth.js';
import { allRows, config as serverConfig, db } from '../agent-monitor/_server.js';

const json = (res, status, body) => {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'private, no-store');
	res.end(JSON.stringify(body));
};

function config(env = process.env) {
	const base = (env.CHATWOOT_BASE_URL ?? '').trim().replace(/\/+$/, '');
	const accountId = (env.CHATWOOT_ACCOUNT_ID ?? '').trim();
	const token = (env.CHATWOOT_ACCESS_TOKEN ?? '').trim();
	if (!base || !accountId || !token) return null;
	let parsed;
	try { parsed = new URL(base); } catch { throw Object.assign(new Error('Некорректный CHATWOOT_BASE_URL'), { status: 503 }); }
	if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.hostname === 'localhost'))
		throw Object.assign(new Error('Chatwoot должен использовать HTTPS'), { status: 503 });
	if (!/^\d+$/.test(accountId)) throw Object.assign(new Error('Некорректный CHATWOOT_ACCOUNT_ID'), { status: 503 });
	return { base, accountId, token };
}

async function api(cfg, path, { method = 'GET', body } = {}) {
	let response;
	try {
		response = await fetch(`${cfg.base}/api/v1${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${cfg.token}`,
				'api-access-token': cfg.token,
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(15000),
		});
	} catch {
		throw Object.assign(new Error('Не удалось подключиться к Chatwoot'), { status: 502 });
	}
	const text = await response.text();
	let data;
	try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
	if (!response.ok) {
		const upstreamMessage = [data?.message, data?.error]
			.filter((value) => typeof value === 'string' && value.trim())
			.join('; ')
			|| (text && !/<(?:!doctype|html|head|body)/i.test(text) ? text.slice(0, 400).trim() : '');
		const safeMessage = upstreamMessage.replaceAll(cfg.token, '[токен скрыт]');
		const statusText = response.statusText ? ` ${response.statusText}` : '';
		const message = `Chatwoot API ${method} ${path}: HTTP ${response.status}${statusText}${safeMessage ? ` — ${safeMessage}` : ''}`;
		throw Object.assign(new Error(message), { status: response.status === 404 ? 404 : 502, chatwootStatus: response.status });
	}
	return data;
}

const idPattern = /^\d{1,18}$/;
const validId = (value) => typeof value === 'string' && idPattern.test(value);

function itemList(data) {
	if (Array.isArray(data)) return data;
	if (Array.isArray(data?.payload)) return data.payload;
	if (Array.isArray(data?.data?.payload)) return data.data.payload;
	return [];
}

function chatwootError(message, status = 502) {
	return Object.assign(new Error(message), { status });
}

function normalizeAllowedDomains(values) {
	if (!Array.isArray(values) || values.length > 100 || values.some((value) => typeof value !== 'string'))
		throw chatwootError('Передайте список доменов (не более 100)', 400);
	const domains = [...new Set(values.map((value) => {
		let domain = value.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/, 1)[0].replace(/:\d+$/, '').replace(/\.$/, '');
		if (domain.length > 253 || !/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain) || (domain.startsWith('*.') && domain.slice(2).split('.').length < 2))
			throw chatwootError(`Некорректный домен: ${value}`, 400);
		return domain;
	}).filter(Boolean))];
	return domains;
}

function isWebsiteInbox(inbox) {
	const channel = String(inbox.channel_type ?? inbox.channel?.type ?? '').toLowerCase();
	return channel.includes('webwidget') || channel.includes('web_widget') || channel === 'website';
}

async function presenceFor(env, userId) {
	return (await db(env, `supportos_chatwoot_presence?select=user_id,chatwoot_agent_id,accepting,heartbeat_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`))?.[0] ?? null;
}

async function writePresence(env, user, agentId, accepting) {
	const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/supportos_chatwoot_presence?on_conflict=user_id`, {
		method: 'POST',
		headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
		body: JSON.stringify({ user_id: user.id, chatwoot_agent_id: agentId, accepting, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
		signal: AbortSignal.timeout(10000),
	});
	if (!response.ok) throw chatwootError('Не удалось сохранить состояние приёма чатов', 502);
	return (await response.json())?.[0];
}

async function listAgents(cfg) {
	return itemList(await api(cfg, `/accounts/${cfg.accountId}/agents`));
}

async function matchAgent(cfg, email) {
	if (!email) return null;
	const normalized = email.trim().toLowerCase();
	return (await listAgents(cfg)).find((agent) => agent.email?.trim().toLowerCase() === normalized) ?? null;
}

async function routeWaitingConversations(env, cfg) {
	const [agents, presenceRows] = await Promise.all([
		listAgents(cfg),
		allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
	]);
	const cutoff = Date.now() - 90_000;
	const activeIds = [...new Set(presenceRows.filter((row) => row.accepting && Date.parse(row.heartbeat_at) >= cutoff).map((row) => Number(row.chatwoot_agent_id)).filter(Number.isSafeInteger))];
	if (!activeIds.length) return { assigned: 0 };
	const known = new Set(agents.map((agent) => Number(agent.id)));
	const eligible = activeIds.filter((id) => known.has(id));
	let assigned = 0;
	for (let page = 1; page <= 10; page += 1) {
		const waiting = await api(cfg, `/accounts/${cfg.accountId}/conversations?status=open&assignee_type=unassigned&page=${page}`);
		const pageItems = itemList(waiting);
		for (const conversation of pageItems) {
		if (!validId(String(conversation.id))) continue;
		const chosen = await db(env, 'rpc/supportos_chatwoot_claim_route', { p_conversation_id: Number(conversation.id), p_agent_ids: eligible });
		const agentId = Number(chosen);
		if (!Number.isSafeInteger(agentId) || !eligible.includes(agentId)) continue;
		try {
			await api(cfg, `/accounts/${cfg.accountId}/conversations/${conversation.id}/assignments`, { method: 'POST', body: { assignee_id: agentId } });
			await db(env, `supportos_chatwoot_routing?conversation_id=eq.${conversation.id}`, { status: 'assigned', updated_at: new Date().toISOString() }, 'PATCH');
			assigned += 1;
		} catch (error) {
			await db(env, `supportos_chatwoot_routing?conversation_id=eq.${conversation.id}`, { status: 'failed', updated_at: new Date().toISOString() }, 'PATCH').catch(() => undefined);
			if (error.status === 401 || error.status === 403) throw error;
		}
		}
		if (pageItems.length < 25) break;
	}
	return { assigned };
}

function conversationFilters({ status, assigneeId, agentId, inboxId, label, from, to }) {
	const filters = [];
	const add = (attribute_key, filter_operator, values) => filters.push({ attribute_key, filter_operator, values: Array.isArray(values) ? values : [values], query_operator: 'AND' });
	if (status) add('status', 'equal_to', status);
	if (assigneeId) add('assignee_id', 'equal_to', assigneeId);
	if (agentId) add('assignee_id', 'equal_to', agentId);
	if (inboxId) add('inbox_id', 'equal_to', inboxId);
	if (label) add('labels', 'equal_to', label);
	if (from) add('created_at', 'is_greater_than', Math.floor(new Date(`${from}T00:00:00.000Z`).getTime() / 1000));
	if (to) add('created_at', 'is_less_than', Math.floor(new Date(`${to}T23:59:59.999Z`).getTime() / 1000));
	if (filters.length) filters[filters.length - 1].query_operator = null;
	return filters;
}

export default async function handler(req, res) {
	try {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const action = url.searchParams.get('action') ?? 'health';
		const user = await requireUser(req, { permission: ['website-inboxes', 'website-domains'].includes(action) ? 'technical' : 'work' });
		const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
		if (action === 'health' && req.method === 'GET') {
			const cfg = config();
			if (!cfg) return json(res, 200, { configured: false });
			const profile = await api(cfg, '/profile');
			return json(res, 200, { configured: true, profile });
		}
		const cfg = config();
		if (!cfg) return json(res, 503, { error: 'Добавьте CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID и CHATWOOT_ACCESS_TOKEN в серверные переменные окружения' });
		const env = serverConfig(process.env);
		const prefix = `/accounts/${cfg.accountId}/conversations`;
		if (action === 'presence' && ['GET', 'POST'].includes(req.method)) {
			const agent = await matchAgent(cfg, user.email);
			if (!agent) return json(res, 409, { error: 'Почта SupportOS должна совпадать с почтой агента Chatwoot, чтобы подключить приём чатов' });
			const previous = await presenceFor(env, user.id);
			const accepting = typeof body.accepting === 'boolean' ? body.accepting : previous?.accepting === true;
			const current = await writePresence(env, user, Number(agent.id), accepting);
			const team = await allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at');
			const cutoff = Date.now() - 90_000;
			const activeTeam = team.filter((row) => Date.parse(row.heartbeat_at) >= cutoff).map((row) => ({ agentId: Number(row.chatwoot_agent_id), accepting: row.accepting, active: true }));
			const routing = accepting ? await routeWaitingConversations(env, cfg) : { assigned: 0 };
			return json(res, 200, { current: { agentId: Number(agent.id), accepting: current.accepting, heartbeatAt: current.heartbeat_at }, team: activeTeam, routing });
		}
		if (action === 'conversations' && req.method === 'GET') {
			const scope = url.searchParams.get('scope') ?? 'queue';
			if (!['queue', 'mine', 'history'].includes(scope)) return json(res, 400, { error: 'Некорректный раздел диалогов' });
			const page = Math.min(10000, Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1));
			const status = url.searchParams.get('status') ?? (scope === 'history' ? 'resolved' : scope === 'mine' ? 'open' : 'open');
			if (!['open', 'resolved', 'pending', 'snoozed', 'all'].includes(status)) return json(res, 400, { error: 'Некорректный статус' });
			const inboxId = url.searchParams.get('inbox_id');
			if (inboxId && !validId(inboxId)) return json(res, 400, { error: 'Некорректный проект' });
			const agentId = url.searchParams.get('agent_id');
			if (agentId && !validId(agentId)) return json(res, 400, { error: 'Некорректный агент' });
			const label = url.searchParams.get('label');
			const from = url.searchParams.get('from');
			const to = url.searchParams.get('to');
			const validDate = (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
			if (!validDate(from) || !validDate(to)) return json(res, 400, { error: 'Некорректный диапазон дат' });
			if (scope === 'queue') {
				const query = new URLSearchParams({ status, assignee_type: 'unassigned', page: String(page) });
				if (inboxId) query.set('inbox_id', inboxId);
				if (label) query.set('labels', label);
				const q = url.searchParams.get('q');
				if (q) query.set('q', q.slice(0, 150));
				const result = await api(cfg, `${prefix}?${query}`);
				return json(res, 200, result);
			}
			let assigneeId = agentId;
			if (scope === 'mine') {
				const agent = await matchAgent(cfg, user.email);
				if (!agent) return json(res, 409, { error: 'Почта SupportOS должна совпадать с почтой агента Chatwoot' });
				assigneeId = String(agent.id);
			}
			if (assigneeId && !validId(assigneeId)) return json(res, 400, { error: 'Некорректный агент' });
			const filters = conversationFilters({ status: scope === 'mine' && status === 'open' ? ['open', 'pending'] : status, assigneeId, inboxId, label, from, to });
			const result = await api(cfg, `${prefix}/filter?page=${page}`, { method: 'POST', body: { payload: filters } });
			return json(res, 200, result);
		}
		if (action === 'conversation' && req.method === 'GET') {
			const id = url.searchParams.get('id');
			if (!validId(id)) return json(res, 400, { error: 'Некорректный ID диалога' });
			return json(res, 200, await api(cfg, `${prefix}/${id}`));
		}
		if (action === 'agents' && req.method === 'GET') {
			const [agents, inboxes, presence] = await Promise.all([
				api(cfg, `/accounts/${cfg.accountId}/agents`),
				api(cfg, `/accounts/${cfg.accountId}/inboxes`),
				allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
			]);
			return json(res, 200, { agents: itemList(agents), inboxes: itemList(inboxes), presence });
		}
		if (action === 'labels' && req.method === 'GET')
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/labels`));
		if (action === 'inboxes' && req.method === 'GET')
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/inboxes`));
		if (action === 'website-inboxes' && req.method === 'GET') {
			const source = itemList(await api(cfg, `/accounts/${cfg.accountId}/inboxes`)).filter(isWebsiteInbox);
			const inboxes = await Promise.all(source.map(async (item) => {
				const detailResult = await api(cfg, `/accounts/${cfg.accountId}/inboxes/${item.id}`);
				const detail = detailResult?.payload ?? detailResult;
				return { id: Number(item.id), name: detail.name ?? item.name ?? `Website #${item.id}`, website_url: detail.website_url ?? detail.channel?.website_url ?? item.website_url ?? null, allowed_domains: detail.allowed_domains ?? detail.channel?.allowed_domains ?? item.allowed_domains ?? '' };
			}));
			return json(res, 200, { inboxes });
		}
		if (action === 'contact' && req.method === 'GET') {
			const contactId = url.searchParams.get('id');
			if (!validId(contactId)) return json(res, 400, { error: 'Некорректный ID контакта' });
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`));
		}
		if (req.method !== 'POST') return json(res, 405, { error: 'Метод не поддерживается' });
		if (action === 'contact-block') {
			if (!validId(String(body.contactId ?? '')) || typeof body.blocked !== 'boolean') return json(res, 400, { error: 'Некорректный контакт или статус блокировки' });
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/contacts/${body.contactId}`, { method: 'PUT', body: { blocked: body.blocked } }));
		}
		if (action === 'website-domains') {
			if (!validId(String(body.inboxId ?? ''))) return json(res, 400, { error: 'Некорректный ID сайта' });
			const domains = normalizeAllowedDomains(body.domains);
			const result = await api(cfg, `/accounts/${cfg.accountId}/inboxes/${body.inboxId}`, { method: 'PATCH', body: { channel: { allowed_domains: domains.join(',') } } });
			const detail = result?.payload ?? result;
			return json(res, 200, { id: Number(detail.id ?? body.inboxId), name: detail.name ?? '', website_url: detail.website_url ?? detail.channel?.website_url ?? null, allowed_domains: detail.allowed_domains ?? detail.channel?.allowed_domains ?? domains.join(',') });
		}
		if (!validId(String(body.conversationId ?? ''))) return json(res, 400, { error: 'Некорректный ID диалога' });
		const id = String(body.conversationId);
		if (action === 'message') {
			const content = typeof body.content === 'string' ? body.content.trim() : '';
			if (!content || content.length > 20000) return json(res, 400, { error: 'Введите сообщение (до 20 000 символов)' });
			const result = await api(cfg, `${prefix}/${id}/messages`, { method: 'POST', body: { content, message_type: 'outgoing', private: body.private === true } });
			return json(res, 200, result);
		}
		if (action === 'status') {
			if (!['open', 'resolved', 'snoozed'].includes(body.status)) return json(res, 400, { error: 'Некорректный статус' });
			return json(res, 200, await api(cfg, `${prefix}/${id}/toggle_status`, { method: 'POST', body: { status: body.status } }));
		}
		if (action === 'assign') {
			const assigneeId = body.assigneeId == null ? null : Number(body.assigneeId);
			const teamId = body.teamId == null ? null : Number(body.teamId);
			if ((assigneeId !== null && !Number.isSafeInteger(assigneeId)) || (teamId !== null && !Number.isSafeInteger(teamId))) return json(res, 400, { error: 'Некорректное назначение' });
			const result = await api(cfg, `${prefix}/${id}/assignments`, { method: 'POST', body: { assignee_id: assigneeId, team_id: teamId } });
			if (assigneeId === null) await db(env, `supportos_chatwoot_routing?conversation_id=eq.${id}`, { status: 'failed', updated_at: new Date().toISOString() }, 'PATCH').catch(() => undefined);
			else await db(env, `supportos_chatwoot_routing?conversation_id=eq.${id}`, { status: 'assigned', chatwoot_agent_id: assigneeId, updated_at: new Date().toISOString() }, 'PATCH').catch(() => undefined);
			return json(res, 200, result);
		}
		if (action === 'labels') {
			if (!Array.isArray(body.labels) || body.labels.length > 40 || body.labels.some((label) => typeof label !== 'string' || label.trim().length > 60)) return json(res, 400, { error: 'Некорректные метки' });
			return json(res, 200, await api(cfg, `${prefix}/${id}/labels`, { method: 'POST', body: { labels: [...new Set(body.labels.map((label) => label.trim()).filter(Boolean))] } }));
		}
		return json(res, 404, { error: 'Неизвестное действие' });
	} catch (error) {
		return json(res, error.status ?? 503, { error: error.status ? error.message : 'Не удалось выполнить запрос к Chatwoot' });
	}
}
