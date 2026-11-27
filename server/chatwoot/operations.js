import { db } from '../supabase-rest.js';

const empty = { agents: {}, inboxes: {}, revision: null };
const timeFormat = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export async function getOperations(env) {
	const [row] = await db(env, 'supportos_chatwoot_operations?select=settings,updated_at&id=eq.main');
	return row ? { ...row.settings, revision: row.updated_at } : empty;
}

export function normalizeOperations(body) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Некорректные настройки');
	const skillsOf = (skills) => {
		if (!Array.isArray(skills) || skills.length > 20 || skills.some((skill) => typeof skill !== 'string' || !skill.trim() || skill.length > 32))
			throw badRequest('Укажите до 20 навыков, по 32 символа на навык');
		return [...new Set(skills.map((skill) => skill.trim().toLowerCase()))];
	};
	const entriesOf = (entries) => {
		if (!entries || typeof entries !== 'object' || Array.isArray(entries) || Object.keys(entries).length > 250)
			throw badRequest('Некорректный список агентов или проектов');
		const items = Object.entries(entries);
		if (items.some(([id, value]) => !/^[1-9]\d{0,14}$/.test(id) || !value || typeof value !== 'object' || Array.isArray(value)))
			throw badRequest('Некорректный идентификатор агента или проекта');
		return items;
	};
	const agents = Object.fromEntries(entriesOf(body.agents).map(([id, rule]) => {
		const shifts = rule.shifts;
		const zone = rule.zone;
		if (typeof zone !== 'string' || zone.length > 64) throw badRequest('Укажите часовой пояс');
		try { new Intl.DateTimeFormat('en', { timeZone: zone }); } catch { throw badRequest('Неизвестный часовой пояс'); }
		if (!Array.isArray(shifts) || shifts.length > 14 || shifts.some((shift) =>
			!shift || !Number.isInteger(shift.day) || shift.day < 0 || shift.day > 6 ||
			!timeFormat.test(shift.start ?? '') || !timeFormat.test(shift.end ?? '') || shift.start === shift.end))
			throw badRequest('Проверьте дни и часы смены');
		return [id, { zone, skills: skillsOf(rule.skills), shifts: shifts.map(({ day, start, end }) => ({ day, start, end })) }];
	}));
	const inboxes = Object.fromEntries(entriesOf(body.inboxes).map(([id, rule]) => {
		const { responseMinutes, crm, tagScope = '' } = rule;
		if (!Number.isInteger(responseMinutes) || responseMinutes < 0 || responseMinutes > 1440 ||
			!['', 'adwa', 'whitelabels', 'vortexino'].includes(crm))
			throw badRequest('Некорректная цель SLA или CRM');
		if (!['', 'b2b', 'b2c', 'all'].includes(tagScope)) throw badRequest('Некорректная группа тегов');
		return [id, { skills: skillsOf(rule.skills), responseMinutes, crm, ...(tagScope ? { tagScope } : {}) }];
	}));
	return { agents, inboxes };
}

export async function saveOperations(env, userId, body) {
	const settings = normalizeOperations(body);
	if (typeof body.revision !== 'string' || !Number.isFinite(Date.parse(body.revision))) throw badRequest('Загрузите актуальные настройки');
	const updatedAt = new Date().toISOString();
	const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/supportos_chatwoot_operations?id=eq.main&updated_at=eq.${encodeURIComponent(body.revision)}`, {
		method: 'PATCH',
		headers: {
			apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
			'Content-Type': 'application/json', Prefer: 'return=representation',
		},
		body: JSON.stringify({ settings, updated_at: updatedAt, updated_by: userId }),
		signal: AbortSignal.timeout(10000),
	});
	if (!response.ok) throw Object.assign(new Error('Не удалось сохранить настройки'), { status: 502 });
	if (!(await response.json()).length) throw Object.assign(new Error('Настройки уже изменились. Обновите панель перед сохранением.'), { status: 409 });
	return { ...settings, revision: updatedAt };
}

export function onShift(rule, instant = new Date()) {
	if (!rule?.shifts.length) return true;
	const format = new Intl.DateTimeFormat('en-US', {
		timeZone: rule.zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
	});
	const parts = Object.fromEntries(format.formatToParts(instant).map(({ type, value }) => [type, value]));
	const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
	const local = `${parts.hour}:${parts.minute}`;
	return rule.shifts.some((shift) => shift.start < shift.end
		? shift.day === day && local >= shift.start && local < shift.end
		: (shift.day === day && local >= shift.start) || ((shift.day + 1) % 7 === day && local < shift.end));
}

function timestamp(value) {
	if (!value || value === '0') return null;
	if (typeof value === 'string' && !/^\d+$/.test(value)) return Date.parse(value) || null;
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number * (number < 1e12 ? 1000 : 1) : null;
}

export function slaSnapshot(rows, operations, now = Date.now()) {
	return rows.flatMap((chat) => {
		const since = timestamp(chat.waiting_since);
		const goal = operations.inboxes[chat.inbox_id]?.responseMinutes;
		if (!goal || since === null) return [];
		const seconds = Math.max(0, Math.floor((now - since) / 1000));
		return [{
			id: chat.id, inboxId: chat.inbox_id, agentId: chat.meta?.assignee?.id ?? chat.assignee_id ?? null,
			seconds, goal, overdue: seconds >= goal * 60,
		}];
	}).sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.seconds - a.seconds);
}
