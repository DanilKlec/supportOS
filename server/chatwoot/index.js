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

function conversationTotal(data) {
	const meta = data?.data?.meta ?? data?.meta ?? {};
	const value = Number(meta.all_count ?? meta.count?.all_count ?? meta.count);
	return Number.isSafeInteger(value) && value >= 0 ? value : null;
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

function websiteSourceInput(body) {
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	const websiteUrl = typeof body.websiteUrl === 'string' ? body.websiteUrl.trim() : '';
	const widgetColor = typeof body.widgetColor === 'string' ? body.widgetColor.trim() : '#2563eb';
	const welcomeTitle = typeof body.welcomeTitle === 'string' ? body.welcomeTitle.trim() : '';
	const welcomeTagline = typeof body.welcomeTagline === 'string' ? body.welcomeTagline.trim() : '';
	const greetingMessage = typeof body.greetingMessage === 'string' ? body.greetingMessage.trim() : '';
	const widgetPosition = body.widgetPosition === 'left' ? 'left' : 'right';
	const widgetType = body.widgetType === 'expanded_bubble' ? 'expanded_bubble' : 'standard';
	const widgetLocale = typeof body.widgetLocale === 'string' ? body.widgetLocale.trim() : 'ru';
	const launcherTitle = typeof body.launcherTitle === 'string' ? body.launcherTitle.trim() : '';
	if (!name || name.length > 120) throw chatwootError('Укажите название сайта (до 120 символов)', 400);
	let url;
	try { url = new URL(websiteUrl); } catch { throw chatwootError('Укажите корректный адрес сайта, например https://example.com', 400); }
	if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw chatwootError('Адрес сайта должен начинаться с http:// или https://', 400);
	if (!/^#[\da-f]{6}$/i.test(widgetColor)) throw chatwootError('Выберите корректный цвет виджета', 400);
	if (welcomeTitle.length > 100 || welcomeTagline.length > 255 || greetingMessage.length > 5000 || launcherTitle.length > 80) throw chatwootError('Текст настройки виджета превышает допустимую длину', 400);
	if (!['ru', 'en', 'de', 'pt', 'el'].includes(widgetLocale)) throw chatwootError('Выберите поддерживаемый язык виджета', 400);
	if (typeof body.greetingEnabled !== 'boolean') throw chatwootError('Укажите, включено ли приветствие', 400);
	const operatorIds = [...new Set((Array.isArray(body.operatorIds) ? body.operatorIds : []).map(Number))];
	if (operatorIds.length > 200 || operatorIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw chatwootError('Выберите корректных операторов', 400);
	return { name, websiteUrl: url.toString().replace(/\/$/, ''), widgetColor, widgetPosition, widgetType, widgetLocale, launcherTitle, welcomeTitle, welcomeTagline, greetingMessage, greetingEnabled: body.greetingEnabled, allowedDomains: normalizeAllowedDomains(body.allowedDomains ?? []), operatorIds };
}

async function saveWidgetSettings(env, inboxId, source) {
	const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/supportos_chatwoot_widget_settings?on_conflict=inbox_id`, {
		method: 'POST',
		headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
		body: JSON.stringify({ inbox_id: Number(inboxId), widget_position: source.widgetPosition, widget_type: source.widgetType, widget_locale: source.widgetLocale, launcher_title: source.launcherTitle, updated_at: new Date().toISOString() }),
		signal: AbortSignal.timeout(15000),
	});
	if (!response.ok) throw Object.assign(new Error('Не удалось сохранить настройки виджета. Проверьте, что миграция SupportOS применена.'), { status: 502 });
}

function normalizeWidgetSettings(row) {
	return {
		position: row?.widget_position === 'left' ? 'left' : 'right',
		type: row?.widget_type === 'expanded_bubble' ? 'expanded_bubble' : 'standard',
		locale: ['ru', 'en', 'de', 'pt', 'el'].includes(row?.widget_locale) ? row.widget_locale : 'ru',
		launcherTitle: typeof row?.launcher_title === 'string' ? row.launcher_title : '',
	};
}

function websiteSourcePayload(source) {
	return {
		name: source.name,
		enable_auto_assignment: false,
		greeting_enabled: source.greetingEnabled,
		greeting_message: source.greetingMessage,
		channel: {
			type: 'web_widget',
			website_url: source.websiteUrl,
			allowed_domains: source.allowedDomains.join(','),
			widget_color: source.widgetColor,
			welcome_title: source.welcomeTitle,
			welcome_tagline: source.welcomeTagline,
		},
	};
}

async function websiteInboxMembers(cfg, inboxId) {
	const result = await api(cfg, `/accounts/${cfg.accountId}/inbox_members/${inboxId}`);
	return itemList(result).map((agent) => Number(agent.id)).filter(Number.isSafeInteger);
}

async function setWebsiteInboxMembers(cfg, inboxId, operatorIds) {
	await api(cfg, `/accounts/${cfg.accountId}/inbox_members`, { method: 'PATCH', body: { inbox_id: inboxId, user_ids: operatorIds } });
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

async function getAgentLimits(env) {
	return allRows(env, 'supportos_chatwoot_agent_limits?select=chatwoot_agent_id,max_active_chats');
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
	const routerLease = await db(env, 'rpc/supportos_chatwoot_acquire_router_lease', { p_min_interval_seconds: 5 });
	if (routerLease !== true) return { assigned: 0, skipped: true };
	const queueMeta = await Promise.all(['open', 'pending'].map((status) =>
		api(cfg, `/accounts/${cfg.accountId}/conversations/meta?status=${status}`),
	));
	const queueCounts = queueMeta.map((result) => {
		const value = Number((result?.data?.meta ?? result?.meta)?.unassigned_count);
		return Number.isSafeInteger(value) && value >= 0 ? value : null;
	});
	if (queueCounts.every((count) => count !== null) && queueCounts.every((count) => count === 0))
		return { assigned: 0, skipped: true };
	const [agents, presenceRows, limits] = await Promise.all([
		listAgents(cfg),
		allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
		getAgentLimits(env),
	]);
	const cutoff = Date.now() - 90_000;
	const activePresence = presenceRows.filter((row) => row.accepting && Date.parse(row.heartbeat_at) >= cutoff);
	const activeIds = [...new Set(activePresence.map((row) => Number(row.chatwoot_agent_id)).filter(Number.isSafeInteger))];
	if (!activeIds.length) return { assigned: 0 };
	const known = new Set(agents.map((agent) => Number(agent.id)));
	const eligible = activeIds.filter((id) => known.has(id));
	if (!eligible.length) return { assigned: 0 };
	const queuePages = await Promise.all(['open', 'pending'].map((status) =>
		api(cfg, `/accounts/${cfg.accountId}/conversations?status=${status}&assignee_type=unassigned&page=1`).then(itemList),
	));
	const conversations = [...new Map(queuePages.flat().map((conversation) => [Number(conversation.id), conversation])).values()];
	if (!conversations.length) return { assigned: 0, skipped: true };
	const capacities = Object.fromEntries(activePresence.map((row) => {
		const agentId = Number(row.chatwoot_agent_id);
		const limit = limits.find((item) => Number(item.chatwoot_agent_id) === agentId)?.max_active_chats;
		return [String(agentId), Math.max(1, Math.min(50, Number(limit) || 4))];
	}));
	const countResults = await Promise.all(eligible.map(async (agentId) => {
		const filtered = await api(cfg, `/accounts/${cfg.accountId}/conversations/filter?page=1`, {
			method: 'POST',
			body: { payload: conversationFilters({ status: ['open', 'pending'], assigneeId: String(agentId) }) },
		});
		return [String(agentId), conversationTotal(filtered)];
	}));
	if (countResults.some(([, count]) => count === null)) return { assigned: 0, skipped: true };
	const activeCounts = Object.fromEntries(countResults);
	const baselineCounts = { ...activeCounts };
	const inboxIds = [...new Set(conversations.map((conversation) => String(conversation.inbox_id ?? conversation.meta?.inbox?.id ?? '')).filter(validId))];
	const inboxMembers = new Map(await Promise.all(inboxIds.map(async (id) => [id, await websiteInboxMembers(cfg, id).catch(() => [])])));
	const createdAtOf = (conversation) => {
		const raw = conversation.created_at;
		return typeof raw === 'string' && !/^\d+$/.test(raw) ? Date.parse(raw) : Number(raw) * (Number(raw) > 1e12 ? 1 : 1000);
	};
	conversations.sort((a, b) => createdAtOf(a) - createdAtOf(b));
	let assigned = 0;
	for (const conversation of conversations) {
		if (!validId(String(conversation.id))) continue;
		const conversationInboxId = String(conversation.inbox_id ?? conversation.meta?.inbox?.id ?? '');
		let eligibleForInbox = eligible.filter((id) => activeCounts[String(id)] < capacities[String(id)]);
		if (validId(conversationInboxId)) {
			const memberIds = new Set(inboxMembers.get(conversationInboxId));
			eligibleForInbox = eligibleForInbox.filter((id) => memberIds.has(id));
		}
		if (!eligibleForInbox.length) continue;
		const chosen = await db(env, 'rpc/supportos_chatwoot_claim_route_with_capacity', { p_conversation_id: Number(conversation.id), p_agent_ids: eligibleForInbox, p_active_counts: baselineCounts, p_capacities: capacities });
		const agentId = Number(chosen);
		if (!Number.isSafeInteger(agentId) || !eligibleForInbox.includes(agentId)) continue;
		try {
			await api(cfg, `/accounts/${cfg.accountId}/conversations/${conversation.id}/assignments`, { method: 'POST', body: { assignee_id: agentId } });
			await db(env, `supportos_chatwoot_routing?conversation_id=eq.${conversation.id}`, { status: 'assigned', updated_at: new Date().toISOString() }, 'PATCH');
			activeCounts[String(agentId)] += 1;
			assigned += 1;
		} catch (error) {
			await db(env, `supportos_chatwoot_routing?conversation_id=eq.${conversation.id}`, { status: 'failed', updated_at: new Date().toISOString() }, 'PATCH').catch(() => undefined);
			if (error.status === 401 || error.status === 403) throw error;
		}
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
		if (action === 'widget-config' && req.method === 'GET') {
			// Website tokens are designed to be public in widget snippets; never return the Chatwoot API token here.
			const cfg = config();
			if (!cfg) return json(res, 503, { error: 'Chatwoot не настроен на сервере' });
			const env = serverConfig(process.env);
			const inboxes = itemList(await api(cfg, `/accounts/${cfg.accountId}/inboxes`)).filter(isWebsiteInbox);
			const candidates = await Promise.all(inboxes.map(async (inbox) => {
				const result = await api(cfg, `/accounts/${cfg.accountId}/inboxes/${inbox.id}`);
				const detail = result?.payload ?? result;
				return { inbox, detail };
			}));
			const refererValue = req.headers?.referer ?? req.headers?.Referer;
			let referer;
			try { if (refererValue) referer = new URL(refererValue); } catch { /* use a deterministic fallback below */ }
			const matchingSource = referer ? candidates.find(({ inbox, detail }) => {
				const websiteUrl = detail.website_url ?? detail.channel?.website_url ?? inbox.website_url;
				if (websiteUrl) {
					try {
						const configured = new URL(websiteUrl);
						if (configured.origin === referer.origin && configured.pathname.replace(/\/$/, '') === referer.pathname.replace(/\/$/, '')) return true;
					} catch { /* check the allowed domains as a fallback */ }
				}
				const allowed = detail.allowed_domains ?? detail.channel?.allowed_domains ?? inbox.allowed_domains ?? '';
				const domains = (Array.isArray(allowed) ? allowed : String(allowed).split(','))
					.map((domain) => String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/, 1)[0])
					.filter(Boolean);
				return domains.some((domain) => domain === referer.hostname.toLowerCase() || domain.startsWith('*.') && referer.hostname.toLowerCase().endsWith(domain.slice(1)));
			}) : undefined;
			const selected = matchingSource ?? candidates[0];
			if (selected) {
				const { inbox, detail } = selected;
				const websiteToken = detail.website_token ?? detail.channel?.website_token ?? inbox.website_token;
				if (typeof websiteToken === 'string' && websiteToken.length > 0) {
					const preferences = (await db(env, `supportos_chatwoot_widget_settings?select=widget_position,widget_type,widget_locale,launcher_title&inbox_id=eq.${Number(inbox.id)}&limit=1`))?.[0];
					return json(res, 200, { baseUrl: cfg.base, websiteToken, inboxId: Number(inbox.id), inboxName: detail.name ?? inbox.name ?? 'Поддержка', allowedDomains: detail.allowed_domains ?? detail.channel?.allowed_domains ?? inbox.allowed_domains ?? '', settings: normalizeWidgetSettings(preferences) });
				}
			}
			return json(res, 409, { error: inboxes.length ? 'У Website-канала не найден публичный токен виджета' : 'Создайте Website-канал в Chatwoot, чтобы включить тестовый виджет' });
		}
		const requestedScope = url.searchParams.get('scope');
		const permission = ['website-inboxes', 'website-domains', 'website-source', 'website-inbox-members'].includes(action) || action === 'custom-attributes' && req.method !== 'GET' ? 'technical' : ['conversations', 'agent-capacity'].includes(action) && (action === 'agent-capacity' || requestedScope === 'active') ? 'monitor.read' : 'work';
		const user = await requireUser(req, { permission });
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
		if (action === 'conversation-counts' && req.method === 'GET') {
			const inboxId = url.searchParams.get('inbox_id');
			if (inboxId && !validId(inboxId)) return json(res, 400, { error: 'Некорректный проект' });
			const statuses = await Promise.all(['open', 'pending'].map(async (status) => {
				const query = new URLSearchParams({ status });
				if (inboxId) query.set('inbox_id', inboxId);
				const result = await api(cfg, `${prefix}/meta?${query}`);
				return result?.data?.meta ?? result?.meta ?? {};
			}));
			const countFromMeta = (meta, key) => {
				const count = Number(meta?.[key]);
				return Number.isSafeInteger(count) && count >= 0 ? count : null;
			};
			let mineCount = null;
			const ownPresence = await presenceFor(env, user.id);
			const ownAgent = ownPresence?.chatwoot_agent_id ?? Number((await matchAgent(cfg, user.email))?.id);
			if (Number.isSafeInteger(Number(ownAgent)) && Number(ownAgent) > 0) {
				const filtered = await api(cfg, `${prefix}/filter?page=1`, {
					method: 'POST',
					body: { payload: conversationFilters({ status: ['open', 'pending'], assigneeId: String(ownAgent), inboxId }) },
				});
				mineCount = conversationTotal(filtered);
			}
			const canSeeAllActive = user.access?.permissions?.includes('monitor.read') === true;
			return json(res, 200, {
				queueCount: statuses.reduce((total, meta) => total + (countFromMeta(meta, 'unassigned_count') ?? 0), 0),
				mineCount,
				activeCount: canSeeAllActive ? statuses.reduce((total, meta) => total + (countFromMeta(meta, 'all_count') ?? 0), 0) : null,
			});
		}
		if (action === 'custom-attributes') {
			const model = Number(url.searchParams.get('model') ?? body.model);
			if (![0, 1].includes(model)) return json(res, 400, { error: 'Некорректный тип полей' });
			const definitionsPath = `/accounts/${cfg.accountId}/custom_attribute_definitions`;
			if (req.method === 'GET') {
				const result = await api(cfg, `${definitionsPath}?attribute_model=${model}`);
				return json(res, 200, { payload: itemList(result) });
			}
			if (req.method === 'POST') {
				const name = typeof body.attribute_display_name === 'string' ? body.attribute_display_name.trim() : '';
				const key = typeof body.attribute_key === 'string' ? body.attribute_key.trim() : '';
				const type = Number(body.attribute_display_type);
				const description = typeof body.attribute_description === 'string' ? body.attribute_description.trim() : '';
				const values = Array.isArray(body.attribute_values) ? body.attribute_values.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean) : [];
				if (!name || name.length > 80 || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || !Number.isInteger(type) || type < 0 || type > 7 || description.length > 500 || values.length > 100 || values.some((value) => value.length > 100))
					return json(res, 400, { error: 'Проверьте название, ключ, тип и варианты поля' });
				const payload = { attribute_display_name: name, attribute_key: key, attribute_display_type: type, attribute_description: description, attribute_values: type === 6 ? values : [], attribute_model: model };
				const definitionId = body.id == null ? '' : String(body.id);
				if (definitionId && !validId(definitionId)) return json(res, 400, { error: 'Некорректный ID поля' });
				const result = await api(cfg, definitionId ? `${definitionsPath}/${definitionId}` : definitionsPath, { method: definitionId ? 'PUT' : 'POST', body: payload });
				return json(res, 200, result);
			}
			if (req.method === 'DELETE') {
				const definitionId = String(body.id ?? '');
				if (!validId(definitionId)) return json(res, 400, { error: 'Некорректный ID поля' });
				return json(res, 200, await api(cfg, `${definitionsPath}/${definitionId}`, { method: 'DELETE' }));
			}
			return json(res, 405, { error: 'Метод не поддерживается' });
		}
		if (action === 'custom-attribute-values' && req.method === 'POST') {
			const conversationId = String(body.conversationId ?? '');
			const contactId = String(body.contactId ?? '');
			const attributes = body.attributes;
			if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes) || Object.keys(attributes).length > 50 || Object.values(attributes).some((value) => value !== null && !['string', 'number', 'boolean'].includes(typeof value)))
				return json(res, 400, { error: 'Передайте значения пользовательских полей' });
			if (conversationId && validId(conversationId)) {
				return json(res, 200, await api(cfg, `${prefix}/${conversationId}/custom_attributes`, { method: 'POST', body: { custom_attributes: attributes, merge: true } }));
			}
			if (contactId && validId(contactId)) {
				const existingResult = await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`);
				const existing = existingResult?.payload ?? existingResult;
				const merged = { ...(existing.custom_attributes ?? {}), ...attributes };
				return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`, { method: 'PUT', body: { custom_attributes: merged } }));
			}
			return json(res, 400, { error: 'Укажите корректный ID диалога или контакта' });
		}
		if (action === 'agent-capacity' && req.method === 'POST') {
			const allowedRole = user.access?.roles?.some((role) => ['admin', 'qc', 'creator'].includes(role.id));
			if (!allowedRole) return json(res, 403, { error: 'Лимиты чатов может менять только администратор или QC' });
			const agentId = Number(body.agentId);
			const maxActiveChats = Number(body.maxActiveChats);
			if (!Number.isSafeInteger(agentId) || agentId <= 0 || !Number.isInteger(maxActiveChats) || maxActiveChats < 1 || maxActiveChats > 50)
				return json(res, 400, { error: 'Укажите агента и лимит от 1 до 50 чатов' });
			const agent = (await listAgents(cfg)).find((item) => Number(item.id) === agentId);
			if (!agent) return json(res, 404, { error: 'Агент Chatwoot не найден' });
			const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/supportos_chatwoot_agent_limits?on_conflict=chatwoot_agent_id`, {
				method: 'POST',
				headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
				body: JSON.stringify({ chatwoot_agent_id: agentId, max_active_chats: maxActiveChats, updated_by: user.id, updated_at: new Date().toISOString() }),
				signal: AbortSignal.timeout(15000),
			});
			if (!response.ok) throw Object.assign(new Error('Не удалось сохранить лимит агента'), { status: 502 });
			const presence = await allRows(env, 'supportos_chatwoot_presence?select=accepting,heartbeat_at');
			if (presence.some((row) => row.accepting && Date.now() - Date.parse(row.heartbeat_at) < 90_000))
				await routeWaitingConversations(env, cfg);
			return json(res, 200, { agentId, maxActiveChats });
		}
		if (action === 'presence' && ['GET', 'POST'].includes(req.method)) {
			const agent = await matchAgent(cfg, user.email);
			if (!agent) return json(res, 409, { error: 'Почта SupportOS должна совпадать с почтой агента Chatwoot, чтобы подключить приём чатов' });
			const previous = await presenceFor(env, user.id);
			const accepting = typeof body.accepting === 'boolean' ? body.accepting : previous?.accepting === true;
			const current = await writePresence(env, user, Number(agent.id), accepting);
			const [team, limits] = await Promise.all([
				allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
				getAgentLimits(env),
			]);
			const cutoff = Date.now() - 90_000;
			const activeTeam = team.filter((row) => Date.parse(row.heartbeat_at) >= cutoff).map((row) => ({ agentId: Number(row.chatwoot_agent_id), accepting: row.accepting, maxActiveChats: Number(limits.find((item) => Number(item.chatwoot_agent_id) === Number(row.chatwoot_agent_id))?.max_active_chats) || 4, active: true }));
			const routing = activeTeam.some((row) => row.accepting) ? await routeWaitingConversations(env, cfg) : { assigned: 0 };
			const maxActiveChats = Number(limits.find((item) => Number(item.chatwoot_agent_id) === Number(agent.id))?.max_active_chats) || 4;
			return json(res, 200, { current: { agentId: Number(agent.id), accepting: current.accepting, maxActiveChats, heartbeatAt: current.heartbeat_at }, team: activeTeam, routing });
		}
		if (action === 'conversations' && req.method === 'GET') {
			const scope = url.searchParams.get('scope') ?? 'queue';
			if (!['queue', 'mine', 'history', 'active'].includes(scope)) return json(res, 400, { error: 'Некорректный раздел диалогов' });
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
				const paramsFor = (nextStatus) => {
					const query = new URLSearchParams({ status: nextStatus, assignee_type: 'unassigned', page: String(page) });
					if (inboxId) query.set('inbox_id', inboxId);
					if (label) query.set('labels', label);
					const q = url.searchParams.get('q');
					if (q) query.set('q', q.slice(0, 150));
					return query;
				};
				const [open, pending] = await Promise.all([
					api(cfg, `${prefix}?${paramsFor(status === 'pending' ? 'pending' : 'open')}`),
					api(cfg, `${prefix}?${paramsFor('pending')}`),
				]);
				const openItems = itemList(open);
				const pendingItems = itemList(pending);
				const unique = new Map([...openItems, ...pendingItems].map((conversation) => [conversation.id, conversation]));
				return json(res, 200, { payload: [...unique.values()], hasMore: openItems.length >= 25 || pendingItems.length >= 25 });
			}
			if (scope === 'active') {
				const paramsFor = (status) => {
					const query = new URLSearchParams({ status, page: String(page) });
					if (inboxId) query.set('inbox_id', inboxId);
					if (label) query.set('labels', label);
					const q = url.searchParams.get('q');
					if (q) query.set('q', q.slice(0, 150));
					return query;
				};
				const [open, pending] = await Promise.all([
					api(cfg, `${prefix}?${paramsFor('open')}`),
					api(cfg, `${prefix}?${paramsFor('pending')}`),
				]);
				const openItems = itemList(open);
				const pendingItems = itemList(pending);
				const unique = new Map([...openItems, ...pendingItems].map((conversation) => [conversation.id, conversation]));
				return json(res, 200, { payload: [...unique.values()], hasMore: openItems.length >= 25 || pendingItems.length >= 25 });
			}
			let assigneeId = agentId;
			if (scope === 'mine') {
				const agent = await matchAgent(cfg, user.email);
				if (!agent) return json(res, 409, { error: 'Почта SupportOS должна совпадать с почтой агента Chatwoot' });
				assigneeId = String(agent.id);
			}
			if (assigneeId && !validId(assigneeId)) return json(res, 400, { error: 'Некорректный агент' });
			const filters = conversationFilters({ status: scope === 'mine' && status === 'open' ? ['open', 'pending'] : status, assigneeId, inboxId, label, from, to });
			const search = url.searchParams.get('q')?.trim().slice(0, 150);
			const searchQuery = search ? `&q=${encodeURIComponent(search)}` : '';
			const result = await api(cfg, `${prefix}/filter?page=${page}${searchQuery}`, { method: 'POST', body: { payload: filters } });
			const payload = itemList(result);
			return json(res, 200, { ...result, payload, hasMore: payload.length >= 25 });
		}
		if (action === 'conversation' && req.method === 'GET') {
			const id = url.searchParams.get('id');
			if (!validId(id)) return json(res, 400, { error: 'Некорректный ID диалога' });
			return json(res, 200, await api(cfg, `${prefix}/${id}`));
		}
		if (action === 'messages' && req.method === 'GET') {
			const id = url.searchParams.get('id');
			const before = url.searchParams.get('before');
			if (!validId(id)) return json(res, 400, { error: 'Некорректный ID диалога' });
			if (before && !validId(before)) return json(res, 400, { error: 'Некорректный курсор истории' });
			const cursor = before ? `?before=${encodeURIComponent(before)}` : '';
			return json(res, 200, await api(cfg, `${prefix}/${id}/messages${cursor}`));
		}
		if (action === 'agents' && req.method === 'GET') {
			const [agents, inboxes, teams, presence, limits] = await Promise.all([
				api(cfg, `/accounts/${cfg.accountId}/agents`),
				api(cfg, `/accounts/${cfg.accountId}/inboxes`),
				api(cfg, `/accounts/${cfg.accountId}/teams`).catch(() => []),
				allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
				getAgentLimits(env),
			]);
			const maxFor = (agentId) => Number(limits.find((item) => Number(item.chatwoot_agent_id) === Number(agentId))?.max_active_chats) || 4;
			return json(res, 200, { agents: itemList(agents).map((agent) => ({ ...agent, max_active_chats: maxFor(agent.id) })), inboxes: itemList(inboxes), teams: itemList(teams), presence: presence.map((row) => ({ ...row, max_active_chats: maxFor(row.chatwoot_agent_id) })) });
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
				const preferences = (await db(env, `supportos_chatwoot_widget_settings?select=widget_position,widget_type,widget_locale,launcher_title&inbox_id=eq.${Number(item.id)}&limit=1`))?.[0];
				const settings = normalizeWidgetSettings(preferences);
				return { id: Number(item.id), name: detail.name ?? item.name ?? `Website #${item.id}`, website_url: detail.website_url ?? detail.channel?.website_url ?? item.website_url ?? null, allowed_domains: detail.allowed_domains ?? detail.channel?.allowed_domains ?? item.allowed_domains ?? '', widget_color: detail.widget_color ?? detail.channel?.widget_color ?? null, widget_position: settings.position, widget_type: settings.type, widget_locale: settings.locale, launcher_title: settings.launcherTitle, welcome_title: detail.welcome_title ?? detail.channel?.welcome_title ?? null, welcome_tagline: detail.welcome_tagline ?? detail.channel?.welcome_tagline ?? null, greeting_enabled: detail.greeting_enabled ?? false, greeting_message: detail.greeting_message ?? '', website_token: detail.website_token ?? detail.channel?.website_token ?? null };
			}));
			return json(res, 200, { baseUrl: cfg.base, inboxes });
		}
		if (action === 'website-inbox-members' && req.method === 'GET') {
			const inboxId = url.searchParams.get('inboxId');
			if (!validId(inboxId)) return json(res, 400, { error: 'Некорректный ID источника' });
			return json(res, 200, { operatorIds: await websiteInboxMembers(cfg, inboxId) });
		}
		if (action === 'contact' && req.method === 'GET') {
			const contactId = url.searchParams.get('id');
			if (!validId(contactId)) return json(res, 400, { error: 'Некорректный ID контакта' });
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`));
		}
		if (req.method !== 'POST' && action !== 'website-source') return json(res, 405, { error: 'Метод не поддерживается' });
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
		if (action === 'website-source') {
			if (req.method === 'DELETE') {
				const inboxId = String(body.inboxId ?? '');
				if (!validId(inboxId)) return json(res, 400, { error: 'Некорректный ID источника' });
				const result = await api(cfg, `/accounts/${cfg.accountId}/inboxes/${inboxId}`, { method: 'DELETE' });
				await db(env, `supportos_chatwoot_widget_settings?inbox_id=eq.${inboxId}`, undefined, 'DELETE');
				return json(res, 200, result);
			}
			if (req.method !== 'POST') return json(res, 405, { error: 'Метод не поддерживается' });
			const source = websiteSourceInput(body);
			const inboxId = body.id == null ? null : String(body.id);
			if (inboxId !== null && !validId(inboxId)) return json(res, 400, { error: 'Некорректный ID источника' });
			if (!inboxId && !source.operatorIds.length) return json(res, 400, { error: 'Назначьте хотя бы одного оператора источнику' });
			let result;
			if (inboxId) {
				result = await api(cfg, `/accounts/${cfg.accountId}/inboxes/${inboxId}`, { method: 'PATCH', body: websiteSourcePayload(source) });
				await setWebsiteInboxMembers(cfg, inboxId, source.operatorIds);
				await saveWidgetSettings(env, inboxId, source);
			} else {
				result = await api(cfg, `/accounts/${cfg.accountId}/inboxes`, { method: 'POST', body: websiteSourcePayload(source) });
				const created = result?.payload ?? result;
				const createdId = String(created.id ?? '');
				if (!validId(createdId)) throw chatwootError('Chatwoot создал источник, но не вернул его ID', 502);
				try {
					await setWebsiteInboxMembers(cfg, createdId, source.operatorIds);
					await saveWidgetSettings(env, createdId, source);
				} catch (error) {
					await api(cfg, `/accounts/${cfg.accountId}/inboxes/${createdId}`, { method: 'DELETE' }).catch(() => undefined);
					throw error;
				}
			}
			const detail = result?.payload ?? result;
			return json(res, 200, { inbox: { id: Number(detail.id ?? inboxId), name: detail.name ?? source.name, website_url: detail.website_url ?? detail.channel?.website_url ?? source.websiteUrl, allowed_domains: detail.allowed_domains ?? detail.channel?.allowed_domains ?? source.allowedDomains.join(','), widget_color: detail.widget_color ?? detail.channel?.widget_color ?? source.widgetColor, widget_position: source.widgetPosition, widget_type: source.widgetType, widget_locale: source.widgetLocale, launcher_title: source.launcherTitle, welcome_title: detail.welcome_title ?? detail.channel?.welcome_title ?? source.welcomeTitle, welcome_tagline: detail.welcome_tagline ?? detail.channel?.welcome_tagline ?? source.welcomeTagline, greeting_enabled: detail.greeting_enabled ?? source.greetingEnabled, greeting_message: detail.greeting_message ?? source.greetingMessage, website_token: detail.website_token ?? detail.channel?.website_token ?? null } });
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
			const result = await api(cfg, `${prefix}/${id}/toggle_status`, { method: 'POST', body: { status: body.status } });
			if (body.status === 'resolved')
				await db(env, `supportos_chatwoot_routing?conversation_id=eq.${id}`, { status: 'failed', updated_at: new Date().toISOString() }, 'PATCH').catch(() => undefined);
			return json(res, 200, result);
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
