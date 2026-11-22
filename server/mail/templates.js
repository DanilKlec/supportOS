import { db } from '../agent-monitor/_server.js';
import { mailHtmlLimit, normalizeMailLayout, renderMailLayout } from '../../shared/mail-layout.js';
import { mailError } from './google.js';
import { plainFromMailHtml, sanitizeMailHtml } from './mail-html.js';

const table = 'supportos_mail_templates';
const fields = 'id,title,subject,revision';
const detailFields = `${fields},body,html,layout`;
const pageSize = 30;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function templateId(value) {
	if (typeof value !== 'string' || !uuid.test(value)) throw mailError('Выберите шаблон.');
	return value;
}

export async function mailTemplates(env, box, actor, action, params, body) {
	const scope = params.get('scope') ?? 'shared';
	if (scope !== 'shared' && scope !== 'personal') throw mailError('Выберите раздел шаблонов.');
	const ownerColumn = scope === 'personal' ? 'owner_id' : 'mailbox_id';
	const ownerId = scope === 'personal' ? actor : box;
	const base = { [ownerColumn]: `eq.${ownerId}`, select: fields };
	const path = (options) => `${table}?${new URLSearchParams({ ...base, ...options })}`;
	if (action === 'templates') {
		const id = params.get('id');
		if (id !== null) {
			const [template] = await db(env, path({ id: `eq.${templateId(id)}`, select: detailFields }));
			if (!template) throw mailError('Шаблон не найден.', 404);
			return template;
		}
		const search = (params.get('q') ?? '').trim();
		const start = Number(params.get('offset') ?? 0);
		if (search.length > 120 || !Number.isSafeInteger(start) || start < 0)
			throw mailError('Проверьте параметры поиска шаблонов.');
		const rows = await db(env, path({
			order: 'title.asc,id.asc',
			limit: String(pageSize + 1),
			offset: String(start),
			...(search ? { title: `ilike.%${search.replace(/[\\%_]/g, '\\$&')}%` } : {}),
		}));
		return { templates: rows.slice(0, pageSize), next: rows.length > pageSize ? start + pageSize : null };
	}

	const id = action === 'delete-template' || body.id != null ? templateId(body.id) : null;
	let rowPath;
	if (id) {
		if (!Number.isInteger(body.revision) || body.revision < 1 || body.revision >= 2147483647)
			throw mailError('Обновите шаблон перед сохранением.', 409);
		rowPath = path({ id: `eq.${id}`, revision: `eq.${body.revision}`, select: detailFields });
	}
	if (action === 'delete-template') {
		const [removed] = await db(env, rowPath, undefined, 'DELETE', { returnRows: true });
		if (!removed) throw mailError('Шаблон уже изменился. Обновите список.', 409);
		return { ok: true };
	}

	const title = typeof body.title === 'string' ? body.title.trim() : '';
	const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
	let text = typeof body.body === 'string' ? body.body : '';
	if (!title || title.length > 120 || /[\r\n\x00]/.test(title)) throw mailError('Введите название шаблона длиной до 120 символов.');
	if (subject.length > 500 || /[\r\n\x00]/.test(subject)) throw mailError('Тема должна помещаться в одну строку до 500 символов.');
	const content = {};
	if (Object.hasOwn(body, 'html') || Object.hasOwn(body, 'layout')) {
		let layout = null;
		if (body.layout != null) {
			try { layout = normalizeMailLayout(body.layout); }
			catch (error) { throw mailError(error.message); }
		}
		const rawHtml = layout ? renderMailLayout(layout) : body.html;
		if (rawHtml != null && (typeof rawHtml !== 'string' || rawHtml.length > mailHtmlLimit))
			throw mailError('HTML шаблона превышает допустимый размер.');
		const html = rawHtml == null ? null : sanitizeMailHtml(rawHtml);
		if (html === '' || (layout && !html)) throw mailError('Добавьте содержимое HTML-шаблона.');
		if (html && html.length > mailHtmlLimit) throw mailError('HTML шаблона превышает допустимый размер.');
		content.html = html;
		content.layout = layout;
		if (html && !text.trim()) text = plainFromMailHtml(html).slice(0, 200_000);
	}
	if (!text.trim() || text.length > 200_000 || text.includes('\0')) throw mailError('Введите текст шаблона.');
	try {
		const [saved] = id
			? await db(env, rowPath, { title, subject, body: text, ...content, revision: body.revision + 1 }, 'PATCH', { returnRows: true })
			: await db(env, `${table}?select=${detailFields}`, { [ownerColumn]: ownerId, title, subject, body: text, ...content }, 'POST', { returnRows: true });
		if (!saved) throw mailError('Шаблон уже изменился. Обновите список.', 409);
		return saved;
	} catch (error) {
		if (error.storageCode === '23505') throw mailError(
			scope === 'personal' ? 'У вас уже есть личный шаблон с таким названием.' : 'В этом ящике уже есть шаблон с таким названием.', 409);
		throw error;
	}
}
