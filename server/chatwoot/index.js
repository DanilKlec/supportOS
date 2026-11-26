import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { chatCapabilities, chatConversationAccess } from '../../shared/chatwoot-access.js';
import { activeOverview, changeSupervision, coachingNotes, sendCoachingNote, supervisedIds } from './supervision.js';
import { requireUser } from '../_auth.js';
import { loadAccess } from '../_rbac.js';
import { allRows, config as serverConfig, db, equal } from '../agent-monitor/_server.js';
import { getOperations, onShift, saveOperations, slaSnapshot } from './operations.js';
import { activityBySite, cachedSnapshot, countConnectedBots } from './activity.js';

const activityCache = new Map();
const teamStatusCache = new Map();
const botCountCache = new Map();
const chatWebhookEvents = ['conversation_created', 'conversation_status_changed', 'conversation_updated', 'message_created', 'message_updated'];

const json = (res, status, body) => {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'private, no-store');
	res.end(JSON.stringify(stripSensitive(body)));
};

export function config(env = process.env) {
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

function api(cfg, path, options) {
	return chatwootRequest(cfg, `/api/v1${path}`, options);
}

async function chatwootRequest(cfg, path, { method = 'GET', body, timeout = 15000 } = {}) {
	let response;
	const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
	try {
		response = await fetch(`${cfg.base}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${cfg.token}`,
				'api-access-token': cfg.token,
				...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? multipart ? body : JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(timeout),
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

function listPayload(data) {
	if (Array.isArray(data)) return data;
	if (Array.isArray(data?.payload)) return data.payload;
	if (Array.isArray(data?.data?.payload)) return data.data.payload;
	return null;
}

const itemList = (data) => listPayload(data) ?? [];

function conversationTotal(data) {
	const meta = data?.data?.meta ?? data?.meta ?? {};
	const value = Number(meta.all_count ?? meta.count?.all_count ?? meta.count);
	return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function countFromMeta(meta, key) {
	const raw = meta?.[key] ?? meta?.count?.[key];
	if (raw == null || raw === '') return null;
	const count = Number(raw);
	return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function totalFromMeta(pages, key) {
	const counts = pages.map((meta) => countFromMeta(meta, key));
	return counts.some((count) => count === null) ? null : counts.reduce((sum, count) => sum + count, 0);
}

function chatwootError(message, status = 502) {
	return Object.assign(new Error(message), { status });
}

async function saveChatwootWebhookSecret(env, userId, signingSecret) {
	const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/supportos_chatwoot_webhook_config?on_conflict=id`, {
		method: 'POST',
		headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
		body: JSON.stringify({ id: 'main', signing_secret: signingSecret, updated_by: userId, updated_at: new Date().toISOString() }),
		signal: AbortSignal.timeout(15000),
	});
	if (!response.ok) throw chatwootError('Не удалось сохранить секрет вебхука');
}

export async function connectChatwootWebhook(cfg, endpoint) {
	const path = `/accounts/${cfg.accountId}/webhooks`;
	const existing = await api(cfg, path);
	const items = existing?.payload?.webhooks ?? existing?.webhooks;
	if (!Array.isArray(items)) throw chatwootError('Chatwoot вернул неожиданный список вебхуков.');
	const webhook = items.find((item) => item.url === endpoint && !item.inbox);
	const subscriptions = [...new Set([...(webhook?.subscriptions ?? []), ...chatWebhookEvents])];
	let result = webhook;
	if (!webhook || subscriptions.length !== webhook.subscriptions?.length) {
		const settings = { url: endpoint, name: webhook?.name || 'SupportOS', subscriptions };
		result = await api(cfg, webhook ? `${path}/${webhook.id}` : path, {
			method: webhook ? 'PATCH' : 'POST', body: { webhook: settings },
		});
	}
	const secret = (result?.payload ?? result)?.secret ?? webhook?.secret;
	if (typeof secret !== 'string' || secret.length < 16 || secret.length > 512)
		throw chatwootError('Chatwoot не вернул секрет подписи. Сохраните секрет из настроек Chatwoot вручную.');
	return secret;
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
	if (body.operatorTeamIds !== undefined && !Array.isArray(body.operatorTeamIds))
		throw chatwootError('Передайте список команд источника', 400);
	const operatorTeamIds = body.operatorTeamIds === undefined ? undefined : [...new Set(body.operatorTeamIds.map(Number))];
	if (operatorTeamIds?.length > 50 || operatorTeamIds?.some((id) => !validChatId(id)))
		throw chatwootError('Выберите до 50 команд источника', 400);
	return { name, websiteUrl: url.toString().replace(/\/$/, ''), widgetColor, widgetPosition, widgetType, widgetLocale, launcherTitle, welcomeTitle, welcomeTagline, greetingMessage, greetingEnabled: body.greetingEnabled, allowedDomains: normalizeAllowedDomains(body.allowedDomains ?? []), operatorIds, operatorTeamIds };
}

async function saveWidgetSettings(env, inboxId, source, assignment) {
	const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/supportos_chatwoot_widget_settings?on_conflict=inbox_id`, {
		method: 'POST',
		headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
		body: JSON.stringify({ inbox_id: Number(inboxId), widget_position: source.widgetPosition, widget_type: source.widgetType, widget_locale: source.widgetLocale, launcher_title: source.launcherTitle, updated_at: new Date().toISOString(), ...assignment }),
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

async function websiteInboxMembers(cfg, inboxId, timeout) {
	const result = await api(cfg, `/accounts/${cfg.accountId}/inbox_members/${inboxId}`, { timeout });
	return itemList(result).map((agent) => Number(agent.id)).filter(Number.isSafeInteger);
}

async function setWebsiteInboxMembers(cfg, inboxId, operatorIds) {
	await api(cfg, `/accounts/${cfg.accountId}/inbox_members`, { method: 'PATCH', body: { inbox_id: inboxId, user_ids: operatorIds } });
	membershipCache.delete(`${cfg.base}/${cfg.accountId}/${inboxId}`);
	inboxDirectoryCache.delete(`${cfg.base}/${cfg.accountId}`);
}

function isWebsiteInbox(inbox) {
	const channel = String(inbox.channel_type ?? inbox.channel?.type ?? '').toLowerCase();
	return channel.includes('webwidget') || channel.includes('web_widget') || channel === 'website';
}

function recordPresence(env, userId, agentId = null, accepting = null) {
	return db(env, 'rpc/supportos_chatwoot_record_presence', {
		p_user_id: userId,
		p_agent_id: agentId,
		p_accepting: accepting,
	});
}

async function getAgentLimits(env) {
	return allRows(env, 'supportos_chatwoot_agent_limits?select=chatwoot_agent_id,max_active_chats');
}

async function listAgents(cfg) {
	return itemList(await api(cfg, `/accounts/${cfg.accountId}/agents`));
}

const agentDirectoryCache = new Map();
async function matchAgent(cfg, email) {
	if (!email) return null;
	const normalized = email.trim().toLowerCase();
	const key = `${cfg.base}/${cfg.accountId}`;
	let entry = agentDirectoryCache.get(key);
	if (!entry || entry.expires <= Date.now()) {
		entry = { expires: Date.now() + 30000, agents: listAgents(cfg) };
		agentDirectoryCache.set(key, entry);
		void entry.agents.catch(() => {
			if (agentDirectoryCache.get(key) === entry) agentDirectoryCache.delete(key);
		});
	}
	return (await entry.agents).find((agent) => agent.email?.trim().toLowerCase() === normalized) ?? null;
}

const agentTokenChecks = new Map();
async function platformAgentCredentials(env, cfg, email, getAgentId) {
	const platformToken = env.CHATWOOT_PLATFORM_APP_TOKEN?.trim();
	if (!platformToken) throw chatwootError('В SupportOS не настроен Platform App Chatwoot для этого агента', 503);
	const agentId = await getAgentId();
	if (!validChatId(agentId)) throw chatwootError('В рабочем аккаунте Chatwoot не найден агент с вашей почтой', 409);

	let result;
	try {
		result = await chatwootRequest({ ...cfg, token: platformToken }, `/platform/api/v1/users/${agentId}/token`, {
			method: 'POST', timeout: 5000,
		});
	} catch (error) {
		if ([401, 403].includes(error.chatwootStatus))
			throw chatwootError('Platform App Chatwoot не авторизован для этого агента. Обратитесь к администратору.', 403);
		throw chatwootError('Не удалось получить персональный доступ через Platform API Chatwoot', 502);
	}
	if (Number(result?.user?.id) !== agentId || String(result?.user?.email ?? '').trim().toLowerCase() !== email)
		throw chatwootError('Chatwoot вернул данные другого оператора', 409);
	const token = result?.access_token;
	if (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token))
		throw chatwootError('Chatwoot не вернул действительный токен оператора', 502);
	return verifiedAgentCredentials({ ...cfg, token }, email, agentId);
}

async function messageCredentials(env, cfg, email, getAgentId) {
	if (!email) return cfg;
	const normalized = email.trim().toLowerCase();
	if (normalized && normalized === env.CHATWOOT_PLATFORM_PILOT_EMAIL?.trim().toLowerCase())
		return platformAgentCredentials(env, cfg, normalized, getAgentId);
	if (!env.CHATWOOT_AGENT_TOKENS) return cfg;
	let tokens;
	try { tokens = JSON.parse(env.CHATWOOT_AGENT_TOKENS); } catch { /* server configuration is invalid */ }
	if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens))
		throw chatwootError('Не удалось прочитать настройки персональных профилей Chatwoot', 503);
	if (!Object.hasOwn(tokens, normalized)) return cfg;
	const token = typeof tokens[normalized] === 'string' ? tokens[normalized].trim() : '';
	if (!token) throw chatwootError('Персональный профиль Chatwoot настроен без токена', 503);
	return verifiedAgentCredentials({ ...cfg, token }, normalized);
}

async function verifiedAgentCredentials(credentials, email, agentId = null) {
	const { base, accountId, token } = credentials;
	const fingerprint = createHash('sha256').update(`${base}:${accountId}:${token}`).digest('hex');
	const cached = agentTokenChecks.get(email);
	if (cached?.fingerprint === fingerprint && cached.expires > Date.now() && (agentId === null || cached.agentId === agentId)) return credentials;
	const profile = await ownChatwootProfile(credentials, email, agentId);
	agentTokenChecks.set(email, { fingerprint, agentId: Number(profile.id) || null, expires: Date.now() + 300_000 });
	return credentials;
}

async function ownChatwootProfile(credentials, email, agentId) {
	const profile = await api(credentials, '/profile', { timeout: 4000 });
	if (String(profile?.email ?? '').trim().toLowerCase() !== email || (agentId !== null && Number(profile?.id) !== agentId))
		throw chatwootError('Личный доступ к вашему профилю Chatwoot не подключён', 409);
	return profile;
}

function profileAppearance(profile) {
	return {
		name: typeof profile.name === 'string' ? profile.name : '',
		displayName: typeof profile.display_name === 'string' ? profile.display_name : '',
		avatarUrl: typeof profile.avatar_url === 'string' && /^https:\/\//i.test(profile.avatar_url) ? profile.avatar_url : '',
	};
}

const maxAvatarBytes = 2 * 1024 * 1024;

function profileAppearancePayload(body) {
	const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
	if (displayName === null || displayName.length > 100 || /[\u0000-\u001f\u007f]/.test(displayName))
		throw chatwootError('Укажите отображаемое имя до 100 символов', 400);
	if (body.avatar == null) return { profile: { display_name: displayName } };

	const encoded = body.avatar;
	if (typeof encoded !== 'string') throw chatwootError('Не удалось прочитать изображение', 400);
	if (encoded.length > Math.ceil(maxAvatarBytes / 3) * 4) throw chatwootError('Фото должно быть не больше 2 МБ', 413);
	const bytes = Buffer.from(encoded, 'base64');
	if (!bytes.length || bytes.toString('base64') !== encoded) throw chatwootError('Не удалось прочитать изображение', 400);
	if (bytes.length > maxAvatarBytes) throw chatwootError('Фото должно быть не больше 2 МБ', 413);
	const signature = bytes.subarray(0, 8).toString('hex');
	const format = signature === '89504e470d0a1a0a' ? 'png'
		: signature.startsWith('ffd8ff') ? 'jpeg'
		: /^474946383[79]61/.test(signature) ? 'gif'
		: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
		: null;
	if (!format) throw chatwootError('Загрузите фото в формате JPG, PNG, GIF или WebP', 415);
	const form = new FormData();
	form.append('profile[display_name]', displayName);
	form.append('profile[avatar]', new Blob([bytes], { type: `image/${format}` }), `avatar.${format}`);
	return form;
}

const activeStatuses = ['open', 'pending'];
const conversationRecord = (result) => result?.payload ?? result;
const conversationInbox = (row) => Number(row.inbox_id ?? row.meta?.inbox?.id);
const hasBotAssignee = (row) => Boolean(row.assignee_agent_bot_id || String(row.meta?.assignee_type ?? row.meta?.assignee?.type ?? '').replaceAll('_', '').toLowerCase() === 'agentbot');
const conversationAssignee = (row) => hasBotAssignee(row) ? null : Number(row.meta?.assignee?.id ?? row.assignee_id) || null;
const conversationContact = (row) => Number(row.meta?.sender?.id ?? row.contact_id) || null;
const validChatId = (id) => validId(String(id ?? '')) && Number.isSafeInteger(Number(id)) && Number(id) > 0;

function publicInbox({ id, name, channel_type, website_url }) {
	return { id, name, channel_type, website_url };
}

const membershipCache = new Map();
const inboxDirectoryCache = new Map();
function directoryFor(cfg) {
	const key = `${cfg.base}/${cfg.accountId}`;
	let entry = inboxDirectoryCache.get(key);
	if (!entry || entry.until <= Date.now()) {
		entry = { until: Date.now() + 15000, items: api(cfg, `/accounts/${cfg.accountId}/inboxes`).then(itemList) };
		inboxDirectoryCache.set(key, entry);
		void entry.items.catch(() => { if (inboxDirectoryCache.get(key) === entry) inboxDirectoryCache.delete(key); });
	}
	return entry.items;
}

const teamMemberCache = new Map();
async function getTeamMembers(cfg, id, fresh = false) {
	const key = `${cfg.base}/${cfg.accountId}/${id}`;
	let entry = teamMemberCache.get(key);
	if (fresh || !entry || entry.until <= Date.now()) {
		entry = {
			until: Date.now() + 15000,
			ids: api(cfg, `/accounts/${cfg.accountId}/teams/${id}/team_members`, { timeout: 4500 }).then((result) => itemList(result).map((agent) => Number(agent.id))),
		};
		teamMemberCache.set(key, entry);
		void entry.ids.catch(() => { if (teamMemberCache.get(key) === entry) teamMemberCache.delete(key); });
	}
	return entry.ids;
}

const sourceGroupColumns = 'inbox_id,operator_team_ids,direct_operator_ids,group_member_ids';
const sourceAssignmentById = async (env, id) => (await db(env,
	`supportos_chatwoot_widget_settings?select=${sourceGroupColumns}&inbox_id=eq.${id}&limit=1`,
))?.[0];
const sourceAssignmentsByTeam = (env, id) => allRows(env,
	`supportos_chatwoot_widget_settings?select=${sourceGroupColumns}&operator_team_ids=cs.%7B${id}%7D`,
);

export function directInboxMembers(current, saved) {
	const direct = new Set(saved?.direct_operator_ids?.map(Number));
	const grouped = new Set(saved?.group_member_ids?.map(Number));
	return current.filter((id) => direct.has(id) || !grouped.has(id));
}

async function sourceAssignment(cfg, direct, teamIds) {
	const members = new Set();
	for (let offset = 0; offset < teamIds.length; offset += 6) {
		const teams = await Promise.all(teamIds.slice(offset, offset + 6).map((id) => getTeamMembers(cfg, id)));
		for (const ids of teams) ids.forEach((id) => members.add(id));
	}
	return {
		operator_team_ids: teamIds,
		direct_operator_ids: direct,
		group_member_ids: [...members],
	};
}

function effectiveInboxMembers(assignment) {
	return [...new Set([...assignment.direct_operator_ids, ...assignment.group_member_ids])];
}

async function syncTeamSources(env, cfg, linked) {
	let failures = 0;
	for (let offset = 0; offset < linked.length; offset += 4) {
		const results = await Promise.allSettled(linked.slice(offset, offset + 4).map(async (saved) => {
			const id = Number(saved.inbox_id);
			const current = await websiteInboxMembers(cfg, id);
			const assignment = await sourceAssignment(cfg, [], saved.operator_team_ids);
			assignment.direct_operator_ids = directInboxMembers(current, {
				...saved, group_member_ids: [...saved.group_member_ids, ...assignment.group_member_ids],
			});
			const desired = effectiveInboxMembers(assignment);
			if (desired.length !== current.length || desired.some((value) => !current.includes(value)))
				await setWebsiteInboxMembers(cfg, id, desired);
			await db(env, `supportos_chatwoot_widget_settings?inbox_id=eq.${id}`, {
				direct_operator_ids: assignment.direct_operator_ids,
				group_member_ids: assignment.group_member_ids,
			}, 'PATCH');
		}));
		failures += results.filter((result) => result.status === 'rejected').length;
	}
	if (failures) throw chatwootError(`Состав команды сохранён. Источников с ошибкой синхронизации: ${failures}. Повторите сохранение.`);
}
async function membersFor(cfg, id, fresh = false) {
	const key = `${cfg.base}/${cfg.accountId}/${id}`;
	let entry = membershipCache.get(key);
	if (fresh || !entry || entry.until <= Date.now()) {
		entry = { until: Date.now() + 15000, members: websiteInboxMembers(cfg, id, 4500) };
		membershipCache.set(key, entry);
		void entry.members.catch(() => {
			if (membershipCache.get(key) === entry) membershipCache.delete(key);
		});
	}
	return entry.members;
}

async function availableInboxes(cfg, directory, actorId, capabilities) {
	if (capabilities.supervise) return directory;
	if (!actorId) return [];
	const allowed = [];
	for (let index = 0; index < directory.length; index += 8) {
		const batch = directory.slice(index, index + 8);
		const memberships = await Promise.all(batch.map((item) => membersFor(cfg, item.id).catch(() => [])));
		allowed.push(...batch.filter((_, i) => memberships[i].includes(actorId)));
	}
	return allowed;
}

function requireChatRight(access, right) {
	if (!access[right]) throw chatwootError(
		right === 'read' ? 'Диалог недоступен в вашей рабочей очереди.' : 'Недостаточно прав. Возьмите диалог в работу или обратитесь к администратору.',
		403,
	);
}

function trustedContact(row, rawContactId) {
	const id = Number(rawContactId);
	if (!validChatId(rawContactId) || conversationContact(row) !== id)
		throw chatwootError('Контакт не связан с этим диалогом.', 403);
	return id;
}

function contactSummary(row) {
	const { id, name, email, phone_number, identifier, blocked, label_list, last_activity_at } = row;
	return { id: Number(id), name, email, phone_number, identifier, blocked, label_list, last_activity_at };
}

const editableContactFields = { name: 160, email: 254, phone_number: 40 };

function contactProfileInput(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw chatwootError('Передайте поля контакта.', 400);
	const entries = Object.entries(value);
	if (!entries.length) throw chatwootError('Укажите хотя бы одно поле контакта.', 400);
	return Object.fromEntries(entries.map(([key, raw]) => {
		if (!Object.hasOwn(editableContactFields, key) ||
			(raw !== null && (typeof raw !== 'string' || raw.length > editableContactFields[key] || /[\x00-\x1f\x7f]/.test(raw))))
			throw chatwootError('Переданы недопустимые поля или значения контакта.', 400);
		let text = raw?.trim();
		if (!text) return [key, null];
		if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
			throw chatwootError('Проверьте адрес электронной почты.', 400);
		if (key === 'phone_number') {
			text = text.replace(/[\s().-]/g, '');
			if (!/^\+[1-9]\d{1,14}$/.test(text)) throw chatwootError('Введите телефон с международным кодом страны.', 400);
		}
		return [key, text];
	}));
}

async function updateContactProfile(cfg, contactId, fields) {
	try {
		const result = await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}?include_contact_inboxes=false`, {
			method: 'PUT', body: contactProfileInput(fields),
		});
		const contact = result.payload ?? result;
		if (Number(contact.id) !== Number(contactId)) throw chatwootError('Chatwoot не вернул обновлённый контакт.', 502);
		return contactSummary(contact);
	} catch (error) {
		if ([400, 409, 422].includes(error.chatwootStatus))
			throw chatwootError('Chatwoot отклонил изменения. Проверьте поля и убедитесь, что почта и телефон не заняты другим контактом.', 422);
		throw error;
	}
}

function recentContactChats(result, contactId, include) {
	return itemList(result)
		.filter((chat) => validChatId(chat.id) && (!conversationContact(chat) || conversationContact(chat) === contactId) && include(chat))
		.sort((a, b) => oldestFirst(b, a)).slice(0, 12)
		.map(({ id, inbox_id, status, created_at }) => ({ id, inbox_id, status, created_at }));
}

const secretKeys = new Set([
	'token', 'accesstoken', 'apiaccesstoken', 'apitoken', 'pubsubtoken', 'refreshtoken', 'apikey',
	'authorization', 'password', 'secret', 'signingsecret', 'hmactoken', 'hmacsecret', 'hmacidentifier',
]);
const ipKeys = new Set(['ip', 'ipaddress', 'clientip', 'clientipaddress']);

function stripSensitive(value, hideIp = false, depth = 0) {
	if (value === null || typeof value !== 'object') return value;
	if (depth > 24) return null;
	if (Array.isArray(value)) return value.map((child) => stripSensitive(child, hideIp, depth + 1));
	return Object.fromEntries(Object.entries(value)
		.filter(([key]) => {
			const normalized = key.replaceAll('_', '').toLowerCase();
			return !secretKeys.has(normalized) && (!hideIp || !ipKeys.has(normalized));
		})
		.map(([key, child]) => [key, stripSensitive(child, hideIp, depth + 1)]));
}

const stripIp = (value) => stripSensitive(value, true);

function visitorContext(row) {
	const conversation = row.additional_attributes ?? {};
	const sender = row.meta?.sender ?? {};
	const contact = sender.additional_attributes ?? {};
	const custom = sender.custom_attributes ?? {};
	const field = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim().slice(0, 180);
	const referer = field(conversation.referer, conversation.source_url, custom.source_url);
	let page;
	try {
		const url = new URL(referer);
		if (['https:', 'http:'].includes(url.protocol)) page = url.hostname + url.pathname;
	} catch { /* The inbox website can still identify the source. */ }
	const ip = [conversation.ip_address, conversation.ip, contact.ip_address, contact.ip, custom.ip_address]
		.find((value) => typeof value === 'string' && isIP(value.trim()));
	return {
		page, ip: ip?.trim(), city: field(contact.city), country: field(contact.country, contact.country_code),
		browser: field(conversation.browser?.browser_name),
		device: field(conversation.browser?.device_name), platform: field(conversation.browser?.platform_name),
		login: field(custom.player_login, custom.login, row.custom_attributes?.player_login, row.custom_attributes?.login, contact.username),
	};
}

function reserveConversation(env, id, token, agents, counts = {}, lease = null) {
	return db(env, 'rpc/supportos_chatwoot_reserve_conversation', {
		p_conversation_id: id, p_operation_token: token, p_agent_ids: agents,
		p_active_counts: counts, p_lease_token: lease,
	});
}

function finishConversation(env, id, token, assignee) {
	return db(env, 'rpc/supportos_chatwoot_finish_conversation_operation', {
		p_conversation_id: id, p_operation_token: token, p_assignee_id: assignee,
	});
}

async function changeConversation(env, id, targetAgent, change) {
	const token = randomUUID();
	const reservation = await reserveConversation(env, Number(id), token, [targetAgent]);
	if (!reservation?.reserved) throw chatwootError('Диалог уже меняет другой сотрудник. Обновите список.', 409);
	// A failed upstream request may have been written before the connection ended.
	// Keep its short reservation unless an upstream response explicitly rejected it.
	try {
		const { result, assignee } = await change();
		await finishConversation(env, Number(id), token, assignee);
		return result;
	} catch (error) {
		if (error.status === 409 || (error.chatwootStatus >= 400 && error.chatwootStatus < 500))
			await finishConversation(env, Number(id), token, reservation.previousAgentId ?? null).catch(() => undefined);
		throw error;
	}
}

export async function routeWaitingConversations(env, cfg, priorityInboxId) {
	const leaseToken = randomUUID();
	const routerLease = await db(env, 'rpc/supportos_chatwoot_acquire_router_lease', {
		p_lease_token: leaseToken,
		p_min_interval_seconds: 1,
		p_lease_seconds: 35,
	});
	if (routerLease !== true) return { assigned: 0, skipped: true };
	try {
		return await routeWaitingConversationsLocked(env, cfg, leaseToken, priorityInboxId);
	} finally {
		await db(env, 'rpc/supportos_chatwoot_release_router_lease', { p_lease_token: leaseToken }).catch(() => undefined);
	}
}

async function requeueDisconnectedConversations(env, cfg, prefix, leaseToken, deadline) {
	const pending = await db(env, 'rpc/supportos_chatwoot_expire_presence', { p_lease_token: leaseToken });
	const batches = await Promise.all(pending.map(async (entry) => {
		const agentId = Number(entry.chatwoot_agent_id);
		const handoff = {
			p_lease_token: leaseToken,
			p_user_id: entry.user_id,
			p_agent_id: agentId,
			p_handoff_since: entry.handoff_since,
		};
		const result = await api(cfg, `${prefix}/filter?page=1&sort_by=created_at_asc`, {
			method: 'POST',
			body: { payload: conversationFilters({ status: activeStatuses, assigneeId: String(agentId) }) },
			timeout: 3000,
		}).catch(() => null);
		const rows = listPayload(result);
		if (!rows) return [];
		if (!rows.length && (conversationTotal(result) ?? 0) === 0) {
			await db(env, 'rpc/supportos_chatwoot_complete_handoff', handoff).catch(() => undefined);
			return [];
		}
		return rows.filter((row) => validChatId(row.id) && activeStatuses.includes(row.status) && conversationAssignee(row) === agentId)
			.map((row) => ({ row, handoff }));
	}));
	const candidates = batches.flat().sort((a, b) => oldestFirst(a.row, b.row)).slice(0, 12);
	let requeued = 0;
	for (let offset = 0; offset < candidates.length && Date.now() < deadline; offset += 4) {
		const results = await Promise.allSettled(candidates.slice(offset, offset + 4)
			.map(({ row, handoff }) => requeueDisconnectedConversation(env, cfg, prefix, Number(row.id), handoff)));
		requeued += results.filter((result) => result.status === 'fulfilled' && result.value).length;
	}
	return requeued;
}

async function requeueDisconnectedConversation(env, cfg, prefix, id, handoff) {
	const token = randomUUID();
	const reservation = await db(env, 'rpc/supportos_chatwoot_reserve_handoff', {
		...handoff,
		p_conversation_id: id,
		p_operation_token: token,
	});
	if (!reservation?.reserved) return false;
	try {
		const fresh = conversationRecord(await api(cfg, `${prefix}/${id}`, { timeout: 3000 }));
		const active = activeStatuses.includes(fresh.status);
		const assignee = conversationAssignee(fresh);
		if (!active || assignee !== handoff.p_agent_id) {
			await finishConversation(env, id, token, active ? assignee : null);
			return false;
		}
		await api(cfg, `${prefix}/${id}/assignments`, { method: 'POST', body: { assignee_id: null }, timeout: 5000 });
		await finishConversation(env, id, token, null);
		return true;
	} catch (error) {
		// An upstream timeout does not say whether Chatwoot applied the change.
		if (error.chatwootStatus >= 400 && error.chatwootStatus < 500)
			await finishConversation(env, id, token, error.chatwootStatus === 404 ? null : handoff.p_agent_id).catch(() => undefined);
		return false;
	}
}

async function routeWaitingConversationsLocked(env, cfg, leaseToken, priorityInboxId) {
	const deadline = Date.now() + 12000;
	const prefix = `/accounts/${cfg.accountId}/conversations`;
	const [requeued, presence] = await Promise.all([
		requeueDisconnectedConversations(env, cfg, prefix, leaseToken, deadline),
		allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,heartbeat_at&accepting=eq.true'),
	]);
	const idle = { assigned: 0, requeued };
	if (Date.now() >= deadline) return idle;
	const eligible = presence
		.filter((row) => Date.now() - Date.parse(row.heartbeat_at) < 90_000)
		.map((row) => Number(row.chatwoot_agent_id));
	if (!eligible.length) return idle;

	const [operations, queueCounts] = await Promise.all([
		getOperations(env),
		Promise.all(activeStatuses.map(async (status) => {
			const result = await api(cfg, `${prefix}/meta?status=${status}`, { timeout: 3500 });
			return result?.data?.meta ?? result?.meta;
		})),
	]);
	if (totalFromMeta(queueCounts, 'unassigned_count') === 0) return idle;
	const working = eligible.filter((id) => onShift(operations.agents[id]));
	if (!working.length) return idle;
	const [limits, state, directory, active] = await Promise.all([
		getAgentLimits(env),
		db(env, 'supportos_chatwoot_router_state?select=last_inbox_id&id=eq.main'),
		api(cfg, `/accounts/${cfg.accountId}/inboxes`, { timeout: 4500 }),
		loadChatPages(cfg, 'assigned', 16),
	]);
	const activeCounts = {};
	if (active.truncated) {
		// Under a large backlog, use exact per-agent counts for this pass.
		// Missing counts exclude an agent from automatic assignment.
		for (let first = 0; first < working.length && Date.now() < deadline; first += 8) {
			await Promise.all(working.slice(first, first + 8).map(async (agent) => {
				const result = await api(cfg, `${prefix}/filter?page=1`, {
					method: 'POST',
					body: { payload: conversationFilters({ status: activeStatuses, assigneeId: String(agent) }) },
					timeout: 3000,
				}).catch(() => null);
				const count = conversationTotal(result);
				if (count !== null) activeCounts[agent] = count;
			}));
		}
	} else {
		for (const agent of working) activeCounts[agent] = 0;
		for (const row of active.rows) {
			const assignee = conversationAssignee(row);
			if (Object.hasOwn(activeCounts, assignee)) activeCounts[assignee]++;
		}
	}

	const capacities = new Map(limits.map((row) => [Number(row.chatwoot_agent_id), row.max_active_chats]));
	const free = new Map(Object.entries(activeCounts).map(([agent, used]) => {
		const id = Number(agent);
		return [id, Math.max(0, (capacities.get(id) ?? 4) - used)];
	}).filter(([, slots]) => slots > 0));
	if (!free.size) return idle;

	const inboxIds = [...new Set(itemList(directory).map((inbox) => Number(inbox.id)))]
		.filter((id) => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b);
	const next = inboxIds.findIndex((id) => id > Number(state?.[0]?.last_inbox_id ?? 0));
	const start = Math.max(0, next);
	const batch = [...inboxIds.slice(start), ...inboxIds.slice(0, start)];
	if (!batch.length) return idle;
	const prioritized = inboxIds.includes(priorityInboxId) ? [priorityInboxId] : [];
	const selectedInboxes = [...new Set([...prioritized, ...batch])].slice(0, 8);

	// Every pass starts at the oldest chat in each selected project. The persisted
	// project position lets other sources progress when an earlier source is full.
	await db(env, `supportos_chatwoot_router_state?id=eq.main&router_lease_token=eq.${leaseToken}`,
		{ last_inbox_id: selectedInboxes.at(-1) }, 'PATCH');
	const queues = new Map();
	for (let index = 0; index < selectedInboxes.length && Date.now() < deadline; index += 4) {
		await Promise.all(selectedInboxes.slice(index, index + 4).map(async (id) => {
			const required = operations.inboxes[id]?.skills ?? [];
			const hasSkills = (agent) => required.every((skill) => operations.agents[agent]?.skills.includes(skill));
			if (![...free.keys()].some(hasSkills)) return;
			const members = await websiteInboxMembers(cfg, id, 3500).catch(() => []);
			const candidates = members.filter((agent) => free.has(agent) && hasSkills(agent));
			if (!candidates.length) return;
			const slots = candidates.reduce((count, agent) => count + free.get(agent), 0);
			const pages = Math.min(4, Math.max(1, Math.ceil(slots / 25)));
			const queue = await loadChatPages(cfg, 'unassigned', pages, id).catch(() => null);
			if (queue?.rows.length) queues.set(id, { rows: queue.rows, index: 0, candidates });
		}));
	}
	let assigned = 0;
	while (queues.size && Date.now() < deadline) {
		for (const inbox of selectedInboxes) {
			if (Date.now() >= deadline) break;
			const queue = queues.get(inbox);
			if (!queue) continue;
			const candidates = queue.candidates.filter((agent) => free.has(agent));
			const row = queue.rows[queue.index++];
			if (!row || !candidates.length) {
				queues.delete(inbox);
				continue;
			}
			const result = await assignQueuedConversation(env, cfg, prefix, row, inbox, candidates, activeCounts, leaseToken);
			if (result.stop) return { assigned, requeued };
			if (!result.agentId) continue;
			const remaining = free.get(result.agentId) - 1;
			if (remaining > 0) free.set(result.agentId, remaining);
			else free.delete(result.agentId);
			assigned++;
		}
	}
	return { assigned, requeued };
}

async function assignQueuedConversation(env, cfg, prefix, row, inbox, candidates, activeCounts, leaseToken) {
	const id = Number(row.id);
	if (!Number.isSafeInteger(id) || id < 1 || conversationInbox(row) !== inbox) return {};
	const team = Number(row.meta?.team?.id ?? row.team_id) || 0;
	if (team > 0) {
		const members = await getTeamMembers(cfg, team).catch(() => []);
		candidates = candidates.filter((agent) => members.includes(agent));
		if (!candidates.length) return {};
	}
	const token = randomUUID();
	const reservation = await reserveConversation(env, id, token, candidates, activeCounts, leaseToken);
	if (!reservation?.reserved) return {};
	const agentId = reservation.agentId;
	try {
		const fresh = conversationRecord(await api(cfg, `${prefix}/${id}`, { timeout: 3000 }));
		const assignee = conversationAssignee(fresh);
		const freshTeam = Number(fresh.meta?.team?.id ?? fresh.team_id) || 0;
		if (!activeStatuses.includes(fresh.status) || assignee || hasBotAssignee(fresh) || conversationInbox(fresh) !== inbox || freshTeam !== team) {
			await finishConversation(env, id, token, activeStatuses.includes(fresh.status) ? assignee : null);
			return {};
		}
		await api(cfg, `${prefix}/${id}/assignments`, { method: 'POST', body: { assignee_id: agentId }, timeout: 5000 });
		await finishConversation(env, id, token, agentId);
		return { agentId };
	} catch (error) {
		if (error.chatwootStatus >= 400 && error.chatwootStatus < 500)
			await finishConversation(env, id, token, reservation.previousAgentId ?? null).catch(() => undefined);
		return { stop: [401, 403, 429].includes(error.chatwootStatus) };
	}
}

function oldestFirst(a, b) {
	const time = (row) => {
		const raw = row.created_at;
		const timestamp = typeof raw === 'string' && !/^\d+$/.test(raw) ? Date.parse(raw) : Number(raw);
		return Number.isFinite(timestamp) ? timestamp * (timestamp < 1e12 ? 1000 : 1) : 0;
	};
	return time(a) - time(b) || Number(a.id) - Number(b.id);
}

async function loadChatPages(cfg, assigneeType, maxPages, inboxId) {
	const path = `/accounts/${cfg.accountId}/conversations`;
	const load = async (status, page) => {
		const query = new URLSearchParams({ status, assignee_type: assigneeType, page: String(page) });
		if (assigneeType === 'unassigned') query.set('sort_by', 'created_at_asc');
		if (inboxId) query.set('inbox_id', String(inboxId));
		const result = await api(cfg, `${path}?${query}`, { timeout: 4500 });
		return { rows: itemList(result), meta: result?.data?.meta ?? result?.meta };
	};
	const byStatus = await Promise.all(activeStatuses.map(async (status) => {
		const first = await load(status, 1);
		const key = assigneeType === 'unassigned' ? 'unassigned_count' : assigneeType === 'assigned' ? 'assigned_count' : 'all_count';
		const total = countFromMeta(first.meta, key);
		const size = first.rows.length;
		// Chatwoot exposes 25 rows on a full page. If metadata is missing,
		// read forward to an empty/partial page before using an active snapshot.
		const hasTotal = total !== null;
		const pages = hasTotal && size > 0 ? Math.ceil(total / size) : size === 0 ? 1 : maxPages;
		const rows = [...first.rows];
		let lastSize = size;
		for (let start = 2; start <= Math.min(pages, maxPages) && lastSize > 0; start += 4) {
			const batch = await Promise.all(
				Array.from({ length: Math.min(4, Math.min(pages, maxPages) - start + 1) }, (_, offset) => load(status, start + offset)),
			);
			for (const page of batch) rows.push(...page.rows);
			lastSize = batch.at(-1).rows.length;
		}
		const unique = new Map(rows.map((row) => [row.id, row]));
		return {
			rows: [...unique.values()],
			truncated: hasTotal ? unique.size < total : lastSize > 0,
			meta: first.meta,
		};
	}));
	let rows = [...new Map(byStatus.flatMap((result) => result.rows).map((row) => [row.id, row])).values()];
	if (assigneeType === 'unassigned') {
		// When one status has more pages, avoid assigning a newer chat from the
		// other status ahead of chats that are still outside the fetched window.
		const boundaries = byStatus.filter((part) => part.truncated).map((part) => part.rows.at(-1));
		rows = rows.filter((row) => boundaries.every((boundary) => boundary && oldestFirst(row, boundary) <= 0)).sort(oldestFirst);
	}
	return {
		rows,
		truncated: byStatus.some((result) => result.truncated),
		metadata: byStatus.map((result) => result.meta),
	};
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

function scopeConversationQuery(query, inboxIds) {
	if (inboxIds?.length === 1) query.set('inbox_id', inboxIds[0]);
	else for (const id of inboxIds ?? []) query.append('inbox_id[]', id);
	return query;
}

export default async function handler(req, res) {
	try {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const action = url.searchParams.get('action') ?? 'health';
		if (action === 'routing-tick') {
			if (req.method !== 'POST') return json(res, 405, { error: 'Метод не поддерживается' });
			const authorization = req.headers?.authorization ?? '';
			if (!/^Bearer [0-9a-f]{64}$/.test(authorization)) return json(res, 401, { error: 'Требуется авторизация' });
			const env = serverConfig();
			const state = (await db(env, 'supportos_chatwoot_router_state?select=schedule_key&id=eq.main'))?.[0];
			if (!equal(authorization.slice(7), state?.schedule_key)) return json(res, 401, { error: 'Требуется авторизация' });
			const cfg = config();
			if (!cfg) return json(res, 503, { error: 'Chatwoot не настроен на сервере' });
			return json(res, 200, await routeWaitingConversations(env, cfg));
		}
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
		const user = await requireUser(req, { permission: 'work' });
		if (action === 'presence-heartbeat' && req.method === 'POST') {
			await recordPresence(serverConfig(), user.id);
			return json(res, 200, { ok: true });
		}
		const capabilities = chatCapabilities(user.access);
		const monitorAction = ['agent-capacity', 'chat-operations', 'chat-supervisor', 'active-overview', 'supervision'].includes(action) || action === 'conversations' && requestedScope === 'active';
		const projectAction = ['website-inboxes', 'website-domains', 'website-source', 'website-inbox-members', 'chat-label', 'chat-team', 'invite-agent', 'chatwoot-capacity'].includes(action)
			|| action === 'custom-attributes' && req.method !== 'GET';
		if (monitorAction && !capabilities.supervise) throw chatwootError('Раздел доступен руководителю и QC.', 403);
		if (projectAction && !capabilities.manageProjects) throw chatwootError('Эта настройка доступна администратору.', 403);
		if (['contact-directory', 'directory-contact-history', 'directory-contact-notes', 'directory-contact-merge'].includes(action) && !capabilities.manageAllChats)
			throw chatwootError('Каталог контактов доступен администратору.', 403);
		if (action === 'website-source' && req.method === 'DELETE' && !capabilities.deleteProjects)
			throw chatwootError('Удалять источники может только Creator.', 403);
		if (action === 'webhook-secret' && !capabilities.manageWebhooks)
			throw chatwootError('Вебхуки и секреты может настраивать только Creator.', 403);
		const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
		if (action === 'health' && req.method === 'GET') {
			const cfg = config();
			if (!cfg) return json(res, 200, { configured: false });
			const lastEvent = Promise.resolve().then(() =>
				db(serverConfig(), 'supportos_chatwoot_webhook_events?select=received_at&order=received_at.desc&limit=1'),
			).catch(() => []);
			const [, events] = await Promise.all([api(cfg, '/profile'), lastEvent]);
			return json(res, 200, { configured: true, capabilities, lastWebhookAt: events?.[0]?.received_at ?? null,
				profileUrl: `${cfg.base}/app/accounts/${cfg.accountId}/profile/settings` });
		}
		const cfg = config();
		if (!cfg) return json(res, 503, { error: 'Добавьте CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID и CHATWOOT_ACCESS_TOKEN в серверные переменные окружения' });
		const env = serverConfig(process.env);
		const prefix = `/accounts/${cfg.accountId}/conversations`;
		const supervisionContext = { env, account: cfg.accountId, userId: user.id, upstream: (path, options) => api(cfg, path, options) };
		if (action === 'active-overview' && req.method === 'GET')
			return json(res, 200, await activeOverview({ ...supervisionContext, params: url.searchParams }));
		if (action === 'supervision' && req.method === 'GET')
			return json(res, 200, { ids: await supervisedIds(env, cfg.accountId, user.id) });
		if (action === 'supervision' && req.method === 'POST')
			return json(res, 200, await changeSupervision({ ...supervisionContext, conversationId: body.conversationId, enabled: body.enabled }));
		if (action === 'coaching-notes') {
			if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Метод не поддерживается' });
			const id = req.method === 'GET' ? url.searchParams.get('id') : body.conversationId;
			if (!validChatId(id)) throw chatwootError('Некорректный ID диалога', 400);
			if (req.method === 'GET') return json(res, 200, { notes: await coachingNotes(env, cfg.accountId, id, user.id) });
			if (!capabilities.supervise) throw chatwootError('Подсказки агенту доступны сотрудникам с правом наблюдения.', 403);
			const content = typeof body.content === 'string' ? body.content.trim() : '';
			if (!content || content.length > 2000 || content.includes('\0') || typeof body.noteId !== 'string' ||
				!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.noteId) || !validChatId(body.recipientAgentId))
				throw chatwootError('Проверьте адресата и текст подсказки (до 2000 символов).', 400);
			const [row, agents] = await Promise.all([api(cfg, `${prefix}/${id}`).then(conversationRecord), listAgents(cfg)]);
			const assignee = conversationAssignee(row);
			if (!activeStatuses.includes(row.status) || assignee !== Number(body.recipientAgentId))
				throw chatwootError('Диалог завершён или ответственный изменился. Обновите диалог.', 409);
			const recipientEmail = agents.find((agent) => Number(agent.id) === assignee)?.email?.trim();
			if (!recipientEmail) throw chatwootError('У назначенного агента в Chatwoot нет рабочей почты.', 409);
			return json(res, 200, await sendCoachingNote(env, cfg.accountId, id, user.id, recipientEmail, { id: body.noteId, content }));
		}
		let agentRequest;
		const getAgentId = () => agentRequest ??= matchAgent(cfg, user.email).then((agent) => Number(agent?.id) || null);
		if (action === 'agent-profile') {
			if (!['GET', 'PUT'].includes(req.method)) return json(res, 405, { error: 'Метод не поддерживается' });
			const payload = req.method === 'PUT' ? profileAppearancePayload(body) : null;
			const agentId = await getAgentId();
			if (!validChatId(agentId)) throw chatwootError('В рабочем аккаунте Chatwoot не найден агент с вашей почтой', 409);
			const credentials = await messageCredentials(env, cfg, user.email, getAgentId);
			const profile = await ownChatwootProfile(credentials, user.email.trim().toLowerCase(), agentId);
			if (!payload) return json(res, 200, profileAppearance(profile));
			const updated = await api(credentials, '/profile', { method: 'PUT', body: payload });
			if (Number(updated?.id) !== agentId) throw chatwootError('Chatwoot не подтвердил обновление профиля', 502);
			agentDirectoryCache.delete(`${cfg.base}/${cfg.accountId}`);
			return json(res, 200, profileAppearance(updated));
		}
		const getDirectory = async () => availableInboxes(cfg, await directoryFor(cfg), capabilities.supervise ? null : await getAgentId(), capabilities);
		const activityRequest = (path) => api(cfg, `/accounts/${cfg.accountId}${path}`, { timeout: 5000 });
		const accountKey = `${cfg.base}/${cfg.accountId}`;
		if (action === 'site-activity' && req.method === 'GET') {
			const sites = (await getDirectory()).filter(isWebsiteInbox);
			const cacheKey = `${accountKey}/${sites.map((site) => site.id).sort((a, b) => a - b).join(',')}`;
			return json(res, 200, await cachedSnapshot(activityCache, cacheKey, 20000, () => activityBySite(activityRequest, sites)));
		}
		if (action === 'team-status' && req.method === 'GET') {
			const [presence, bots] = await Promise.all([
				cachedSnapshot(teamStatusCache, accountKey, 5000, async () => {
					const rows = await allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at');
					const fresh = rows.filter((row) => Date.now() - Date.parse(row.heartbeat_at) < 90000);
					return {
						online: new Set(fresh.map((row) => Number(row.chatwoot_agent_id))).size,
						accepting: new Set(fresh.filter((row) => row.accepting).map((row) => Number(row.chatwoot_agent_id))).size,
					};
				}),
				cachedSnapshot(botCountCache, accountKey, 60000, async () => countConnectedBots(activityRequest, await directoryFor(cfg))).catch(() => null),
			]);
			return json(res, 200, { ...presence, bots });
		}
		const accessFor = async (id, { fresh = false, needAgent = false } = {}) => {
			if (!validChatId(id)) throw chatwootError('Некорректный ID диалога', 400);
			const [row, agentId] = await Promise.all([
				api(cfg, `${prefix}/${id}`).then(conversationRecord),
				capabilities.manageAllChats && !needAgent ? null : getAgentId(),
			]);
			const inbox = conversationInbox(row);
			const member = Boolean(agentId && validChatId(inbox) &&
				(await membersFor(cfg, inbox, fresh).catch(() => [])).includes(agentId));
			const assigneeId = conversationAssignee(row);
			const access = chatConversationAccess(capabilities, {
				assigneeId, agentId, member, unassigned: !assigneeId && !hasBotAssignee(row), active: activeStatuses.includes(row.status),
			});
			return { row, access, agentId };
		};
		if (action === 'chat-label' || action === 'chat-team') {
			const team = action === 'chat-team';
			const resource = team ? 'teams' : 'labels';
			const path = `/accounts/${cfg.accountId}/${resource}`;
			const id = body.id ?? url.searchParams.get('id');
			if (id != null && !validChatId(id)) return json(res, 400, { error: 'Проверьте идентификатор' });
			if (req.method === 'GET') {
				if (team && id) return json(res, 200, { memberIds: await getTeamMembers(cfg, id, true) });
				return json(res, 200, { payload: itemList(await api(cfg, path)) });
			}
			if (req.method === 'DELETE' && id) {
				if (team && (await sourceAssignmentsByTeam(env, Number(id))).length)
					throw chatwootError('Сначала открепите команду от источников в настройках сайтов.', 409);
				return json(res, 200, await api(cfg, `${path}/${id}`, { method: 'DELETE' }));
			}
			if (req.method !== 'POST') return json(res, 405, { error: 'Метод не поддерживается' });
			if (team && id && Array.isArray(body.memberIds)) {
				const members = [...new Set(body.memberIds.map(Number))];
				if (members.length > 250 || members.some((value) => !validChatId(value)))
					return json(res, 400, { error: 'Проверьте список участников команды' });
				const linked = await sourceAssignmentsByTeam(env, Number(id));
				const response = await api(cfg, `${path}/${id}/team_members`, { method: 'PATCH', body: { user_ids: members } });
				teamMemberCache.delete(`${cfg.base}/${cfg.accountId}/${id}`);
				if (linked.length) await syncTeamSources(env, cfg, linked);
				return json(res, 200, response);
			}
			const name = typeof body.name === 'string' ? body.name.trim() : '';
			const description = typeof body.description === 'string' ? body.description.trim() : '';
			if (!name || name.length > 60 || description.length > 400)
				return json(res, 400, { error: 'Проверьте название и описание' });
			if (!team && (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || !/^#[\da-f]{6}$/i.test(body.color ?? '')))
				return json(res, 400, { error: 'Тег должен содержать латинские буквы, цифры, дефисы или подчёркивания. Укажите цвет.' });
			const data = team ? { name, description, ...(id ? {} : { allow_auto_assign: false }) } :
				{ title: name, description, color: body.color, show_on_sidebar: body.showOnSidebar === true };
			return json(res, 200, await api(cfg, id ? `${path}/${id}` : path, { method: id ? 'PATCH' : 'POST', body: data }));
		}
		if (action === 'chat-operations' && ['GET', 'POST'].includes(req.method)) {
			if (req.method === 'GET') return json(res, 200, await getOperations(env));
			if (!capabilities.manageRouting)
				return json(res, 403, { error: 'Настроить маршрутизацию могут администратор и QC' });
			return json(res, 200, await saveOperations(env, user.id, body));
		}
		if (action === 'chat-supervisor' && req.method === 'GET') {
			const [operations, active, limits, presence] = await Promise.all([
				getOperations(env),
				loadChatPages(cfg, 'all', 16),
				getAgentLimits(env),
				allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
			]);
			const usage = {};
			let sampledQueue = 0;
			for (const row of active.rows) {
				const agent = conversationAssignee(row);
				if (agent) usage[agent] = (usage[agent] ?? 0) + 1;
				else if (!hasBotAssignee(row)) sampledQueue++;
			}
			const capacities = new Map(limits.map((row) => [Number(row.chatwoot_agent_id), row.max_active_chats]));
			const agents = presence.map((row) => {
				const id = Number(row.chatwoot_agent_id);
				return { id, online: Date.now() - Date.parse(row.heartbeat_at) < 90_000, accepting: row.accepting, onShift: onShift(operations.agents[id]), used: usage[id] ?? 0, limit: capacities.get(id) ?? 4 };
			});
			const queue = totalFromMeta(active.metadata, 'unassigned_count') ?? (active.truncated ? null : sampledQueue);
			const total = totalFromMeta(active.metadata, 'all_count') ?? (active.truncated ? null : active.rows.length);
			return json(res, 200, { queue, active: total, truncated: active.truncated, agents, sla: slaSnapshot(active.rows, operations) });
		}
		if (action === 'webhook-secret' && ['GET', 'POST'].includes(req.method)) {
			if (req.method === 'GET') {
				const saved = (await db(env, 'supportos_chatwoot_webhook_config?select=updated_at&id=eq.main&limit=1'))?.[0];
				const recent = saved && (await db(env, `supportos_chatwoot_webhook_events?select=received_at&received_at=gte.${encodeURIComponent(saved.updated_at)}&order=received_at.desc&limit=1`))?.[0];
				return json(res, 200, { configured: Boolean(saved), lastReceivedAt: recent?.received_at ?? null });
			}
			if (body.connect === true && process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')
				throw chatwootError('Подключите вебхук в рабочей версии SupportOS.', 409);
			const signingSecret = body.connect === true
				? await connectChatwootWebhook(cfg, 'https://support-os-psi.vercel.app/api/chatwoot/webhook')
				: typeof body.signingSecret === 'string' ? body.signingSecret.trim() : '';
			if (signingSecret.length < 16 || signingSecret.length > 512)
				return json(res, 400, { error: 'Секрет вебхука должен содержать от 16 до 512 символов' });
			await saveChatwootWebhookSecret(env, user.id, signingSecret);
			return json(res, 200, { configured: true });
		}
		if (action === 'conversation-counts' && req.method === 'GET') {
			const inboxId = url.searchParams.get('inbox_id');
			if (inboxId && !validId(inboxId)) return json(res, 400, { error: 'Некорректный проект' });
			const actorId = await getAgentId();
			const allowed = capabilities.supervise ? null : (await getDirectory()).map((item) => String(item.id));
			if (allowed && inboxId && !allowed.includes(inboxId)) throw chatwootError('Источник недоступен.', 403);
			const queueInboxes = inboxId ? [inboxId] : allowed;
			const readStatuses = (scope) => scope?.length === 0 ? [] : Promise.all(activeStatuses.map(async (status) => {
				const query = scopeConversationQuery(new URLSearchParams({ status }), scope);
				const result = await api(cfg, `${prefix}/meta?${query}`);
				return result?.data?.meta ?? result?.meta ?? {};
			}));
			const queueStatus = readStatuses(queueInboxes);
			const [statuses, allStatuses, mineCount] = await Promise.all([
				queueStatus,
				capabilities.supervise ? (inboxId ? readStatuses(null) : queueStatus) : null,
				actorId && allowed?.length !== 0 ? api(cfg, `${prefix}/filter?page=1`, {
					method: 'POST',
					body: { payload: conversationFilters({ status: activeStatuses, assigneeId: String(actorId), inboxId: allowed }) },
				}).then(conversationTotal) : null,
			]);
			return json(res, 200, {
				queueCount: totalFromMeta(statuses, 'unassigned_count'),
				mineCount,
				activeCount: allStatuses ? totalFromMeta(allStatuses, 'all_count') : null,
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
			const { row, access } = await accessFor(conversationId, { fresh: true });
			requireChatRight(access, 'write');
			if (!contactId) {
				return json(res, 200, await api(cfg, `${prefix}/${conversationId}/custom_attributes`, { method: 'POST', body: { custom_attributes: attributes, merge: true } }));
			}
			trustedContact(row, contactId);
			const existing = conversationRecord(await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`));
			const merged = { ...(existing.custom_attributes ?? {}), ...attributes };
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`, { method: 'PUT', body: { custom_attributes: merged } }));
		}
		if (action === 'chatwoot-capacity' && ['GET', 'POST'].includes(req.method)) {
			const path = `/accounts/${cfg.accountId}/agent_capacity_policies`;
			try {
				if (req.method === 'GET') {
					const policies = listPayload(await api(cfg, path));
					if (!policies) throw chatwootError('Chatwoot вернул неизвестный формат политик лимита', 502);
					return json(res, 200, { policies });
				}
				const { policyId, inboxId, limit } = body;
				if (![policyId, inboxId].every(validChatId) || !Number.isInteger(limit) || limit < 0 || limit > 250)
					return json(res, 400, { error: 'Выберите политику и источник. Лимит должен быть от 0 до 250.' });
				const policy = conversationRecord(await api(cfg, `${path}/${policyId}`));
				if (!Array.isArray(policy.inbox_capacity_limits)) throw chatwootError('Chatwoot вернул неизвестный формат лимитов источников', 502);
				const existing = policy.inbox_capacity_limits.find((entry) => Number(entry.inbox_id) === Number(inboxId));
				const url = `${path}/${policyId}/inbox_limits`;
				const saved = existing
					? await api(cfg, `${url}/${existing.id}`, { method: 'PUT', body: { conversation_limit: limit } })
					: await api(cfg, url, { method: 'POST', body: { inbox_id: Number(inboxId), conversation_limit: limit } });
				if (saved.conversation_limit !== limit) throw chatwootError('Chatwoot не подтвердил новое значение лимита', 502);
				return json(res, 200, { limit });
			} catch (error) {
				if ([402, 404].includes(error.chatwootStatus) && req.method === 'GET')
					return json(res, 200, { policies: [], unavailable: true });
				if (error.chatwootStatus === 403) throw chatwootError('У подключения Chatwoot нет доступа к политикам лимитов.', 403);
				throw error;
			}
		}
		if (action === 'agent-capacity' && req.method === 'POST') {
			if (!capabilities.manageRouting) return json(res, 403, { error: 'Лимиты чатов может менять только администратор или QC' });
			const agentId = Number(body.agentId);
			const maxActiveChats = Number(body.maxActiveChats);
			if (!Number.isSafeInteger(agentId) || agentId <= 0 || !Number.isInteger(maxActiveChats) || maxActiveChats < 1 || maxActiveChats > 250)
				return json(res, 400, { error: 'Укажите агента и лимит от 1 до 250 чатов' });
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
				await routeWaitingConversations(env, cfg).catch(() => undefined);
			return json(res, 200, { agentId, maxActiveChats });
		}
		if (action === 'presence' && ['GET', 'POST'].includes(req.method)) {
			const agent = await matchAgent(cfg, user.email);
			if (!agent) return json(res, 409, { error: 'Почта SupportOS должна совпадать с почтой агента Chatwoot, чтобы подключить приём чатов' });
			const accepting = req.method === 'POST' && typeof body.accepting === 'boolean' ? body.accepting : null;
			const current = await recordPresence(env, user.id, Number(agent.id), accepting);
			const [team, limits] = await Promise.all([
				allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
				getAgentLimits(env),
			]);
			const cutoff = Date.now() - 90_000;
			const activeTeam = team.filter((row) => Date.parse(row.heartbeat_at) >= cutoff).map((row) => ({ agentId: Number(row.chatwoot_agent_id), accepting: row.accepting, maxActiveChats: Number(limits.find((item) => Number(item.chatwoot_agent_id) === Number(row.chatwoot_agent_id))?.max_active_chats) || 4, active: true }));
			const routing = accepting === true && current.accepting
				? await routeWaitingConversations(env, cfg).catch(() => ({ assigned: 0 }))
				: { assigned: 0 };
			const maxActiveChats = Number(limits.find((item) => Number(item.chatwoot_agent_id) === Number(agent.id))?.max_active_chats) || 4;
			return json(res, 200, {
				current: { agentId: Number(agent.id), accepting: current.accepting, maxActiveChats, heartbeatAt: current.heartbeat_at, handoffPending: Boolean(current.handoff_since) },
				team: capabilities.supervise ? activeTeam : activeTeam.filter((item) => item.agentId === Number(agent.id)),
				onlineCount: activeTeam.length,
				routing: capabilities.supervise ? routing : { assigned: 0 },
			});
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
			const allowed = capabilities.supervise ? null : (await getDirectory()).map((inbox) => String(inbox.id));
			if (allowed && inboxId && !allowed.includes(inboxId)) throw chatwootError('Источник недоступен.', 403);
			if (allowed && !allowed.length) return json(res, 200, { payload: [], hasMore: false });
			if (scope === 'queue') {
				const inboxIds = inboxId ? [inboxId] : allowed;
				const paramsFor = (nextStatus) => {
					const query = scopeConversationQuery(new URLSearchParams({
						status: nextStatus, assignee_type: 'unassigned', page: String(page), sort_by: 'created_at_asc',
					}), inboxIds);
					if (label) query.set('labels', label);
					const q = url.searchParams.get('q');
					if (q) query.set('q', q.slice(0, 150));
					return query;
				};
				const statuses = status === 'pending' ? ['pending'] : activeStatuses;
				const results = await Promise.all(statuses.map((kind) => api(cfg, `${prefix}?${paramsFor(kind)}`)));
				const pages = results.map((result) => itemList(result).filter((row) =>
					activeStatuses.includes(row.status) && !conversationAssignee(row) && !hasBotAssignee(row)
					&& (!inboxIds || inboxIds.includes(String(conversationInbox(row))))));
				const unique = new Map(pages.flat().map((conversation) => [conversation.id, conversation]));
				const nextPages = results.map(async (result, index) => {
					const rows = pages[index];
					if (!rows.length || page === 10000) return false;
					const total = countFromMeta(result?.data?.meta ?? result?.meta, 'unassigned_count');
					if (total !== null) {
						if (total <= page * rows.length) return false;
						if (page === 1 || (total - rows.length) % (page - 1) !== 0) return true;
					}
					// Self-hosted instances can change the number of rows per page.
					const query = paramsFor(statuses[index]);
					query.set('page', String(page + 1));
					return itemList(await api(cfg, `${prefix}?${query}`)).length > 0;
				});
				const payload = [...unique.values()].sort(oldestFirst);
				return json(res, 200, { payload: capabilities.supervise ? payload : stripIp(payload), hasMore: (await Promise.all(nextPages)).some(Boolean) });
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
			if (scope === 'mine' || allowed) {
				const agentId = await getAgentId();
				if (!agentId) return json(res, 200, { payload: [], hasMore: false });
				assigneeId = String(agentId);
			}
			if (assigneeId && !validId(assigneeId)) return json(res, 400, { error: 'Некорректный агент' });
			const filters = conversationFilters({ status: scope === 'mine' && status === 'open' ? activeStatuses : status, assigneeId, inboxId: inboxId || allowed, label, from, to });
			const search = url.searchParams.get('q')?.trim().slice(0, 150);
			const searchQuery = search ? `&q=${encodeURIComponent(search)}` : '';
			const result = await api(cfg, `${prefix}/filter?page=${page}${searchQuery}`, { method: 'POST', body: { payload: filters } });
			const received = itemList(result);
			const payload = received.filter((row) => {
				if (scope === 'history' && status !== 'all' && status !== row.status) return false;
				return !allowed || (String(conversationAssignee(row)) === assigneeId && allowed.includes(String(conversationInbox(row))));
			});
			return json(res, 200, { payload: capabilities.supervise ? payload : stripIp(payload), hasMore: received.length >= 25 });
		}
		if (action === 'conversation' && req.method === 'GET') {
			const id = url.searchParams.get('id');
			if (!validId(id)) return json(res, 400, { error: 'Некорректный ID диалога' });
			const [conversation, operations] = await Promise.all([
				accessFor(id),
				getOperations(env).catch((error) => {
					if (error.storageCode === 'PGRST205') return { inboxes: {} };
					throw error;
				}),
			]);
			const { row, access } = conversation;
			requireChatRight(access, 'read');
			const visitor = visitorContext(row);
			if (!access.seeIp) delete visitor.ip;
			const coachRecipient = capabilities.supervise && activeStatuses.includes(row.status) && conversationAssignee(row);
			return json(res, 200, {
				...(access.seeIp ? row : stripIp(row)), access, visitor,
				coachRecipient: coachRecipient ? { id: coachRecipient, name: row.meta?.assignee?.name || row.meta?.assignee?.available_name || null } : null,
				crm: access.seeIp ? operations.inboxes[conversationInbox(row)]?.crm || null : null,
			});
		}
		if (action === 'messages' && req.method === 'GET') {
			const id = url.searchParams.get('id');
			const before = url.searchParams.get('before');
			if (!validId(id)) return json(res, 400, { error: 'Некорректный ID диалога' });
			if (before && !validId(before)) return json(res, 400, { error: 'Некорректный курсор истории' });
			const { access } = await accessFor(id);
			requireChatRight(access, 'read');
			const cursor = before ? `?before=${encodeURIComponent(before)}` : '';
			const messages = await api(cfg, `${prefix}/${id}/messages${cursor}`);
			return json(res, 200, access.seeIp ? messages : stripIp(messages));
		}
		if (action === 'invite-agent' && req.method === 'POST') {
			const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
			const name = typeof body.name === 'string' ? body.name.trim() : '';
			if (!/^[a-z0-9_+.%'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) || email.length > 254 || name.length > 100)
				return json(res, 400, { error: 'Укажите рабочую почту и имя до 100 символов' });
			const params = new URLSearchParams({ select: 'id,display_name', status: 'eq.active', email: `eq.${email}`, limit: '1' });
			const member = (await db(env, `supportos_users?${params}`))?.[0];
			if (!member || !(await loadAccess(member.id, env)).permissions.includes('work'))
				return json(res, 404, { error: 'Сначала активируйте пользователя SupportOS с доступом к чатам' });
			const existing = (await listAgents(cfg)).find((agent) => agent.email?.trim().toLowerCase() === email);
			if (existing) return json(res, 200, { alreadyLinked: true });
			await api(cfg, `/accounts/${cfg.accountId}/agents`, { method: 'POST', body: {
				agent: { name: name || member.display_name || email.split('@')[0], email, role: 'agent' },
			} });
			agentDirectoryCache.delete(`${cfg.base}/${cfg.accountId}`);
			return json(res, 200, { alreadyLinked: false });
		}
		if (action === 'agents' && req.method === 'GET') {
			const [agents, inboxes, teams, presence, limits] = await Promise.all([
				api(cfg, `/accounts/${cfg.accountId}/agents`),
				getDirectory(),
				api(cfg, `/accounts/${cfg.accountId}/teams`).catch(() => []),
				allRows(env, 'supportos_chatwoot_presence?select=chatwoot_agent_id,accepting,heartbeat_at'),
				getAgentLimits(env),
			]);
			const maxFor = (agentId) => Number(limits.find((item) => Number(item.chatwoot_agent_id) === Number(agentId))?.max_active_chats) || 4;
			const actor = await getAgentId();
			const visibleMembers = capabilities.supervise ? null : new Set((await Promise.all(
				inboxes.map((inbox) => membersFor(cfg, inbox.id).catch(() => [])),
			)).flat());
			const safeAgents = itemList(agents).filter((agent) => !visibleMembers || visibleMembers.has(Number(agent.id)) || Number(agent.id) === actor)
				.map(({ id, name, available_name, thumbnail, avatar_url, email, role, availability_status }) => ({ id, name, available_name, thumbnail: thumbnail || avatar_url, email: capabilities.supervise || Number(id) === actor ? email : undefined, role, availability_status, max_active_chats: maxFor(id) }));
			return json(res, 200, { agents: safeAgents, inboxes: inboxes.map(publicInbox), teams: itemList(teams).map(({ id, name, description, allow_auto_assign }) => ({ id, name, description, allow_auto_assign })), presence: presence.filter((item) => !visibleMembers || visibleMembers.has(Number(item.chatwoot_agent_id))).map((row) => ({ ...row, max_active_chats: maxFor(row.chatwoot_agent_id) })) });
		}
		if (action === 'labels' && req.method === 'GET')
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/labels`));
		if (action === 'inboxes' && req.method === 'GET')
			return json(res, 200, { payload: (await getDirectory()).map(publicInbox) });
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
			const [current, saved] = await Promise.all([websiteInboxMembers(cfg, inboxId), sourceAssignmentById(env, inboxId)]);
			return json(res, 200, { operatorIds: directInboxMembers(current, saved), operatorTeamIds: saved?.operator_team_ids ?? [] });
		}
		if (action === 'contact' && req.method === 'GET') {
			const { row, access } = await accessFor(url.searchParams.get('conversationId'));
			requireChatRight(access, 'read');
			const contactId = trustedContact(row, url.searchParams.get('id'));
			const contact = await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`);
			return json(res, 200, access.seeIp ? contact : stripIp(contact));
		}
		if (action === 'contact-directory' && req.method === 'GET') {
			const page = Number(url.searchParams.get('page') ?? 1);
			const query = (url.searchParams.get('q') ?? '').trim();
			if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || query.length > 160)
				throw chatwootError('Некорректная страница или слишком длинный запрос.', 400);
			const params = new URLSearchParams({ page: String(page), include_contact_inboxes: 'false', sort: '-last_activity_at' });
			if (query) params.set('q', query);
			const result = await api(cfg, `/accounts/${cfg.accountId}/contacts${query ? '/search' : ''}?${params}`);
			const rows = itemList(result);
			const count = countFromMeta(result.meta ?? result.data?.meta, 'count');
			const searchHasMore = result.meta?.has_more ?? result.data?.meta?.has_more;
			const listedMore = count == null ? rows.length >= 15 : page * 15 < count;
			const hasMore = query ? (typeof searchHasMore === 'boolean' ? searchHasMore : rows.length >= 15) : listedMore;
			return json(res, 200, { payload: rows.filter((row) => validChatId(row?.id)).map(contactSummary), hasMore: page < 10000 && hasMore });
		}
		if (action === 'directory-contact-history' && req.method === 'GET') {
			const id = url.searchParams.get('id');
			if (!validChatId(id)) throw chatwootError('Некорректный ID контакта.', 400);
			const result = await api(cfg, `/accounts/${cfg.accountId}/contacts/${id}/conversations`);
			return json(res, 200, { payload: recentContactChats(result, Number(id), () => true) });
		}
		if (action === 'directory-contact-notes' && ['GET', 'POST'].includes(req.method)) {
			const id = req.method === 'GET' ? url.searchParams.get('id') : body.contactId;
			if (!validChatId(id)) throw chatwootError('Некорректный ID контакта.', 400);
			const path = `/accounts/${cfg.accountId}/contacts/${id}/notes`;
			const note = ({ id, content, created_at, user }) => ({ id, content, created_at, author: user?.name });
			if (req.method === 'GET') return json(res, 200, { notes: itemList(await api(cfg, path)).filter((row) => validChatId(row?.id)).map(note) });
			const content = typeof body.content === 'string' ? body.content.trim() : '';
			if (!content || content.length > 2000 || content.includes('\0')) throw chatwootError('Введите заметку длиной до 2000 символов.', 400);
			return json(res, 200, note(await api(cfg, path, { method: 'POST', body: { note: { content } } })));
		}
		if (action === 'directory-contact-merge' && req.method === 'POST') {
			const { baseId, duplicateId } = body;
			if (!validChatId(baseId) || !validChatId(duplicateId) || Number(baseId) === Number(duplicateId) || body.confirmed !== true)
				throw chatwootError('Выберите два разных контакта и подтвердите объединение.', 400);
			await api(cfg, `/accounts/${cfg.accountId}/actions/contact_merge`, { method: 'POST', body: { base_contact_id: Number(baseId), mergee_contact_id: Number(duplicateId) } });
			return json(res, 200, { ok: true });
		}
		if (action === 'contact-history' && req.method === 'GET') {
			const id = url.searchParams.get('conversationId');
			const { row, access, agentId } = await accessFor(id);
			requireChatRight(access, 'read');
			const contactId = trustedContact(row, url.searchParams.get('id'));
			const result = await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}/conversations`);
			const allowed = capabilities.supervise ? null : new Set((await getDirectory()).map((inbox) => Number(inbox.id)));
			const payload = recentContactChats(result, contactId, (chat) => {
				if (String(chat.id) === id) return false;
				const assignee = conversationAssignee(chat);
				return chatConversationAccess(capabilities, {
					assigneeId: assignee, agentId, member: allowed?.has(conversationInbox(chat)) === true,
					unassigned: !assignee && !hasBotAssignee(chat), active: activeStatuses.includes(chat.status),
				}).read;
			});
			return json(res, 200, { payload });
		}
		if (req.method !== 'POST' && action !== 'website-source') return json(res, 405, { error: 'Метод не поддерживается' });
		if (action === 'contact-profile') {
			const { row, access } = await accessFor(body.conversationId, { fresh: true });
			requireChatRight(access, 'write');
			return json(res, 200, await updateContactProfile(cfg, trustedContact(row, body.contactId), body.fields));
		}
		if (action === 'contact-directory') {
			if (!validChatId(body.contactId)) throw chatwootError('Некорректный ID контакта.', 400);
			return json(res, 200, await updateContactProfile(cfg, body.contactId, body.fields));
		}
		if (action === 'contact-block') {
			if (typeof body.blocked !== 'boolean') return json(res, 400, { error: 'Некорректный статус блокировки' });
			const { row, access } = await accessFor(body.conversationId, { fresh: true });
			requireChatRight(access, 'write');
			const contactId = trustedContact(row, body.contactId);
			return json(res, 200, await api(cfg, `/accounts/${cfg.accountId}/contacts/${contactId}`, { method: 'PUT', body: { blocked: body.blocked } }));
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
				inboxDirectoryCache.delete(`${cfg.base}/${cfg.accountId}`);
				membershipCache.delete(`${cfg.base}/${cfg.accountId}/${inboxId}`);
				await db(env, `supportos_chatwoot_widget_settings?inbox_id=eq.${inboxId}`, undefined, 'DELETE');
				return json(res, 200, result);
			}
			if (req.method !== 'POST') return json(res, 405, { error: 'Метод не поддерживается' });
			const source = websiteSourceInput(body);
			const inboxId = body.id == null ? null : String(body.id);
			if (inboxId !== null && !validId(inboxId)) return json(res, 400, { error: 'Некорректный ID источника' });
			const saved = inboxId && source.operatorTeamIds === undefined ? await sourceAssignmentById(env, inboxId) : null;
			const assignment = await sourceAssignment(cfg, directInboxMembers(source.operatorIds, saved), source.operatorTeamIds ?? saved?.operator_team_ids ?? []);
			const operators = effectiveInboxMembers(assignment);
			if (!inboxId && !operators.length) return json(res, 400, { error: 'Назначьте операторов или непустую команду источнику' });
			let result;
			if (inboxId) {
				result = await api(cfg, `/accounts/${cfg.accountId}/inboxes/${inboxId}`, { method: 'PATCH', body: websiteSourcePayload(source) });
				await setWebsiteInboxMembers(cfg, inboxId, operators);
				await saveWidgetSettings(env, inboxId, source, assignment);
			} else {
				result = await api(cfg, `/accounts/${cfg.accountId}/inboxes`, { method: 'POST', body: websiteSourcePayload(source) });
				const created = result?.payload ?? result;
				const createdId = String(created.id ?? '');
				if (!validId(createdId)) throw chatwootError('Chatwoot создал источник, но не вернул его ID', 502);
				try {
					await setWebsiteInboxMembers(cfg, createdId, operators);
					await saveWidgetSettings(env, createdId, source, assignment);
				} catch (error) {
					await api(cfg, `/accounts/${cfg.accountId}/inboxes/${createdId}`, { method: 'DELETE' }).catch(() => undefined);
					throw error;
				}
			}
			const detail = result?.payload ?? result;
			return json(res, 200, { inbox: { id: Number(detail.id ?? inboxId), name: detail.name ?? source.name, website_url: detail.website_url ?? detail.channel?.website_url ?? source.websiteUrl, allowed_domains: detail.allowed_domains ?? detail.channel?.allowed_domains ?? source.allowedDomains.join(','), widget_color: detail.widget_color ?? detail.channel?.widget_color ?? source.widgetColor, widget_position: source.widgetPosition, widget_type: source.widgetType, widget_locale: source.widgetLocale, launcher_title: source.launcherTitle, welcome_title: detail.welcome_title ?? detail.channel?.welcome_title ?? source.welcomeTitle, welcome_tagline: detail.welcome_tagline ?? detail.channel?.welcome_tagline ?? source.welcomeTagline, greeting_enabled: detail.greeting_enabled ?? source.greetingEnabled, greeting_message: detail.greeting_message ?? source.greetingMessage, website_token: detail.website_token ?? detail.channel?.website_token ?? null } });
		}
		if (!['message', 'status', 'assign', 'take', 'labels', 'priority'].includes(action))
			return json(res, 404, { error: 'Неизвестное действие' });
		if (!validChatId(body.conversationId)) return json(res, 400, { error: 'Некорректный ID диалога' });
		const id = String(body.conversationId);
		const right = action === 'take' ? 'take' : action === 'message' && body.private === true ? 'note' : 'write';
		const current = await accessFor(id, { fresh: true, needAgent: action === 'take' });
		if (action === 'take' && current.access.read && !current.access.take)
			return json(res, 409, { error: 'Диалог уже взяли или закрыли. Обновите очередь.' });
		requireChatRight(current.access, right);
		if (action === 'message') {
			const content = typeof body.content === 'string' ? body.content.trim() : '';
			const attachments = Array.isArray(body.attachments) ? body.attachments : [];
			if ((!content && !attachments.length) || content.length > 20000 || attachments.length > 5)
				return json(res, 400, { error: 'Введите сообщение или прикрепите до 5 файлов' });
			let totalBytes = 0;
			const files = [];
			for (const attachment of attachments) {
				if (!attachment || typeof attachment.name !== 'string' || typeof attachment.contentBase64 !== 'string' || attachment.contentBase64.length > 3700000)
					return json(res, 400, { error: 'Один из файлов не удалось прочитать' });
				const name = attachment.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180) || 'attachment';
				const bytes = Buffer.from(attachment.contentBase64, 'base64');
				if (!bytes.length || bytes.toString('base64') !== attachment.contentBase64)
					return json(res, 400, { error: `Файл «${name}» имеет некорректный формат` });
				totalBytes += bytes.length;
				if (bytes.length > 2600000 || totalBytes > 2800000)
					return json(res, 413, { error: 'Размер вложений превышает лимит 2,8 МБ' });
				const type = typeof attachment.type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(attachment.type)
					? attachment.type.slice(0, 120)
					: 'application/octet-stream';
				files.push({ name, type, bytes });
			}
			let payload = { content, message_type: 'outgoing', private: body.private === true };
			if (files.length) {
				const form = new FormData();
				form.append('content', content);
				form.append('message_type', 'outgoing');
				form.append('private', String(body.private === true));
				for (const file of files)
					form.append('attachments[]', new Blob([file.bytes], { type: file.type }), file.name);
				payload = form;
			}
			const credentials = await messageCredentials(env, cfg, user.email, getAgentId);
			const result = await api(credentials, `${prefix}/${id}/messages`, { method: 'POST', body: payload });
			return json(res, 200, result);
		}
		if (action === 'status') {
			if (!['open', 'pending', 'resolved', 'snoozed'].includes(body.status)) return json(res, 400, { error: 'Некорректный статус' });
			const seconds = body.snoozedUntil;
			const now = Math.floor(Date.now() / 1000);
			if (seconds != null && (body.status !== 'snoozed' || !Number.isSafeInteger(seconds) || seconds <= now || seconds > now + 31 * 86400))
				return json(res, 400, { error: 'Укажите срок паузы в пределах 31 дня' });
			const agentId = conversationAssignee(current.row);
			const active = activeStatuses.includes(body.status);
			const result = await changeConversation(env, id, active ? agentId : null, async () => {
				const fresh = await accessFor(id, { fresh: true });
				if (!fresh.access.write || conversationAssignee(fresh.row) !== agentId)
					throw chatwootError('Ответственный изменился. Обновите диалог.', 409);
				const result = await api(cfg, `${prefix}/${id}/toggle_status`, { method: 'POST', body: {
					status: body.status, ...(seconds == null ? {} : { snoozed_until: seconds }),
				} });
				return { result, assignee: active ? agentId : null };
			});
			return json(res, 200, result);
		}
		if (action === 'assign' || action === 'take') {
			const self = action === 'take';
			const setTeam = !self && Object.hasOwn(body, 'teamId');
			const teamId = body.teamId == null ? null : Number(body.teamId);
			const assigneeId = setTeam ? conversationAssignee(current.row) : self ? current.agentId : body.assigneeId == null ? null : Number(body.assigneeId);
			if ([assigneeId, teamId].some((value) => value !== null && (!Number.isSafeInteger(value) || value < 1))) return json(res, 400, { error: 'Некорректное назначение' });
			const result = await changeConversation(env, id, assigneeId, async () => {
				const fresh = await accessFor(id, { fresh: true, needAgent: self });
				if (!fresh.access[right] || (setTeam && conversationAssignee(fresh.row) !== assigneeId))
					throw chatwootError('Диалог уже изменился. Обновите список.', 409);
				if (!setTeam && assigneeId !== null && !(await membersFor(cfg, conversationInbox(fresh.row), true)).includes(assigneeId))
					throw chatwootError('У выбранного сотрудника нет доступа к этому проекту.', 409);
				const result = await api(cfg, `${prefix}/${id}/assignments`, { method: 'POST', body: setTeam ? { team_id: teamId } : { assignee_id: assigneeId } });
				return { result, assignee: activeStatuses.includes(fresh.row.status) ? assigneeId : null };
			});
			return json(res, 200, result);
		}
		if (action === 'labels') {
			if (!Array.isArray(body.labels) || body.labels.length > 40 || body.labels.some((label) => typeof label !== 'string' || label.trim().length > 60)) return json(res, 400, { error: 'Некорректные метки' });
			const labels = [...new Set(body.labels.map((label) => label.trim()).filter(Boolean))];
			const existing = new Set(current.row.labels ?? []);
			if (labels.some((label) => !existing.has(label))) {
				const definitions = itemList(await api(cfg, `/accounts/${cfg.accountId}/labels`));
				const allowed = new Set(definitions.map((item) => item.title));
				if (labels.some((label) => !existing.has(label) && !allowed.has(label)))
					return json(res, 400, { error: 'Можно выбрать только зарегистрированные теги.' });
			}
			return json(res, 200, await api(cfg, `${prefix}/${id}/labels`, { method: 'POST', body: { labels } }));
		}
		if (action === 'priority') {
			if (![null, 'low', 'medium', 'high', 'urgent'].includes(body.priority)) return json(res, 400, { error: 'Некорректный приоритет' });
			return json(res, 200, await api(cfg, `${prefix}/${id}/toggle_priority`, { method: 'POST', body: { priority: body.priority } }));
		}
		return json(res, 404, { error: 'Неизвестное действие' });
	} catch (error) {
		return json(res, error.status ?? 503, { error: error.status ? error.message : 'Не удалось выполнить запрос к Chatwoot' });
	}
}
