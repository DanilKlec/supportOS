import { defaultInvitation, renderInvitation, validateInvitation } from '../../shared/staff-invitation.js';
import { composeRaw, gmail, googleConfig, mailboxToken } from '../mail/google.js';
import { db } from '../supabase-rest.js';

const settingsTable = 'supportos_staff_invitation_settings';
const deliveryTable = 'supportos_staff_invitation_deliveries';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export async function loadInvitationSettings(env) {
	const rows = await db(env, `${settingsTable}?singleton=eq.true&select=sender_id,template,revision`).catch((error) => {
		if (error.storageCode === 'PGRST205') return [];
		throw error;
	});
	const row = rows?.[0];
	return {
		senderId: row?.sender_id ?? null,
		template: { ...defaultInvitation, ...row?.template },
		revision: row?.revision ?? 0,
	};
}

export async function getInvitationSettings(env) {
	const [settings, senders] = await Promise.all([
		loadInvitationSettings(env),
		db(env, 'supportos_mailboxes?provider=eq.gmail&select=id,address&order=address'),
	]);
	return { ...settings, senders, gmailConfigured: Boolean(googleConfig(env)) };
}

export async function saveInvitationSettings(env, input) {
	const { revision, senderId } = input ?? {};
	if (!Number.isSafeInteger(revision) || revision < 1 || revision >= 2147483647)
		throw fail('Обновите страницу, чтобы загрузить текущую версию шаблона.', 409);
	if (senderId !== null) {
		if (typeof senderId !== 'string' || !uuid.test(senderId)) throw fail('Выберите подключённый ящик Gmail.');
		const boxes = await db(env, `supportos_mailboxes?id=eq.${senderId}&provider=eq.gmail&select=id`);
		if (!boxes?.length) throw fail('Этот почтовый ящик больше недоступен.', 409);
	}
	let template;
	try { template = validateInvitation(input.template); }
	catch (error) { throw fail(error.message); }
	const updated = await db(env, `${settingsTable}?singleton=eq.true&revision=eq.${revision}&select=revision`, {
		sender_id: senderId, template, revision: revision + 1,
	}, 'PATCH', { returnRows: true });
	if (!updated?.length) throw fail('Шаблон изменился. Обновите его перед сохранением.', 409);
	return { senderId, template, revision: updated[0].revision };
}

export async function lastCustomInvitation(env, userId) {
	const rows = await db(env, `${deliveryTable}?user_id=eq.${userId}&select=sent_at`).catch((error) => {
		if (error.storageCode === 'PGRST205') return [];
		throw error;
	});
	return rows?.[0]?.sent_at ?? null;
}

export async function sendCustomInvitation(env, settings, admin, user, name, redirectTo) {
	const cfg = googleConfig(env);
	if (!cfg) throw fail('Настройте Gmail для отправки или выберите стандартное письмо в администрировании.', 503);
	const [box] = await db(env, `supportos_mailboxes?id=eq.${settings.senderId}&provider=eq.gmail&select=id,address,encrypted_token`);
	if (!box) throw fail('Почтовый ящик для приглашений недоступен. Выберите ящик в настройках.', 409);
	const token = await mailboxToken(cfg, box);
	if (!await db(env, 'rpc/supportos_claim_staff_invitation', { target: user.id }))
		throw fail('Приглашение уже отправляется. Повторить отправку можно через минуту.', 429);
	const { data, error } = await admin.generateLink({ type: 'invite', email: user.email, options: { redirectTo } });
	if (error || data?.user?.id !== user.id || !data.properties?.action_link)
		throw fail('Supabase не смог создать ссылку приглашения.', 502);
	const link = new URL(data.properties.action_link);
	if (link.origin !== new URL(env.SUPABASE_URL).origin || !link.pathname.endsWith('/auth/v1/verify') ||
		link.searchParams.get('type') !== 'invite' || link.searchParams.get('redirect_to') !== redirectTo ||
		!link.searchParams.get('token') || link.username || link.password)
		throw fail('Supabase вернул некорректную ссылку приглашения.', 502);
	const content = renderInvitation(settings.template, { name: name?.trim() || user.email, email: user.email, url: link.href });
	const raw = composeRaw(`SupportOS <${box.address}>`, { ...content, to: user.email }, false);
	const sent = await gmail(token, '/messages/send', { method: 'POST', body: { raw } });
	if (!sent.id) throw fail('Gmail не подтвердил отправку приглашения.', 502);
	await db(env, `${deliveryTable}?user_id=eq.${user.id}`, { sent_at: new Date().toISOString() }, 'PATCH')
		.catch(() => console.error('Staff invitation delivery timestamp could not be saved'));
}
