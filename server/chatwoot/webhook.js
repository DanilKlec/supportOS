import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config as serverConfig, db } from '../agent-monitor/_server.js';
import { config as chatwootConfig, routeWaitingConversations } from './index.js';
import { readBytes } from './_body.js';

const MAX_BODY_BYTES = 1_000_000;
const MAX_CLOCK_SKEW_SECONDS = 300;
const SUPPORTED_EVENTS = new Set([
	'conversation_created',
	'conversation_updated',
	'conversation_status_changed',
	'message_created',
	'message_updated',
	'webwidget_triggered',
]);

function respond(res, status, payload) {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.end(JSON.stringify(payload));
}

function constantTimeEqual(left, right) {
	const a = Buffer.from(String(left));
	const b = Buffer.from(String(right));
	return a.length === b.length && timingSafeEqual(a, b);
}

async function signingSecret(env) {
	const rows = await db(env, 'supportos_chatwoot_webhook_config?select=signing_secret&id=eq.main&limit=1');
	return rows?.[0]?.signing_secret ?? '';
}

async function saveEvent(env, event) {
	const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/supportos_chatwoot_webhook_events?on_conflict=delivery_id`, {
		method: 'POST',
		headers: {
			apikey: env.SUPABASE_SERVICE_ROLE_KEY,
			Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
			'Content-Type': 'application/json',
			Prefer: 'resolution=ignore-duplicates,return=representation',
		},
		body: JSON.stringify(event),
		signal: AbortSignal.timeout(10000),
	});
	if (!response.ok) throw new Error(`Webhook event storage failed: ${response.status}`);
	const inserted = await response.json().catch(() => []);
	return Array.isArray(inserted) && inserted.length > 0;
}

export default async function chatwootWebhook(req, res) {
	if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
	try {
		const bytes = await readBytes(req, MAX_BODY_BYTES);
		if (!bytes.length || bytes.length > MAX_BODY_BYTES) return respond(res, 413, { error: 'Webhook payload is empty or too large' });
		const timestamp = String(req.headers?.['x-chatwoot-timestamp'] ?? '');
		const signature = String(req.headers?.['x-chatwoot-signature'] ?? '');
		if (!/^\d{10,13}$/.test(timestamp) || !/^sha256=[a-f0-9]{64}$/i.test(signature))
			return respond(res, 401, { error: 'Invalid webhook signature' });
		const seconds = Number(timestamp.length === 13 ? Math.floor(Number(timestamp) / 1000) : timestamp);
		if (!Number.isSafeInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS)
			return respond(res, 401, { error: 'Expired webhook request' });

		const storage = serverConfig(process.env);
		const secret = await signingSecret(storage);
		if (!secret) return respond(res, 503, { error: 'Webhook secret is not configured in SupportOS' });
		const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(bytes).digest('hex')}`;
		if (!constantTimeEqual(expected, signature)) return respond(res, 401, { error: 'Invalid webhook signature' });

		let payload;
		try { payload = JSON.parse(bytes.toString('utf8')); } catch { return respond(res, 400, { error: 'Invalid JSON payload' }); }
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return respond(res, 400, { error: 'Invalid webhook payload' });
		const eventType = typeof payload.event === 'string' ? payload.event : '';
		if (!SUPPORTED_EVENTS.has(eventType)) return respond(res, 200, { received: true, ignored: true });
		const cfg = chatwootConfig(process.env);
		const accountId = Number(payload.account?.id ?? payload.account_id ?? payload.conversation?.account_id);
		if (!cfg || !Number.isSafeInteger(accountId) || String(accountId) !== cfg.accountId)
			return respond(res, 403, { error: 'Webhook account mismatch' });

		const conversation = payload.conversation ?? payload.current_conversation ?? payload;
		const conversationId = Number(conversation?.display_id ?? (conversation === payload && eventType.startsWith('message_') ? payload.conversation_id : conversation?.id ?? payload.conversation_id));
		const inboxId = Number(payload.inbox?.id ?? conversation?.inbox_id ?? payload.inbox_id);
		const validConversationId = Number.isSafeInteger(conversationId) && conversationId > 0 ? conversationId : null;
		const validInboxId = Number.isSafeInteger(inboxId) && inboxId > 0 ? inboxId : null;
		const deliveryHeader = String(req.headers?.['x-chatwoot-delivery'] ?? '').trim();
		const deliveryId = deliveryHeader && deliveryHeader.length <= 112
			? `delivery:${deliveryHeader}`
			: `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		const inserted = await saveEvent(storage, {
			delivery_id: deliveryId,
			event_type: eventType,
			account_id: accountId,
			inbox_id: validInboxId,
			conversation_id: validConversationId,
		});
		if (!inserted) return respond(res, 200, { received: true, duplicate: true });
		const needsRouting = eventType === 'conversation_created' || eventType === 'conversation_status_changed'
			|| eventType === 'conversation_updated' && !conversation.meta?.assignee && !conversation.assignee_id;
		if (needsRouting) await routeWaitingConversations(storage, cfg).catch(() => undefined);

		return respond(res, 200, { received: true, duplicate: false });
	} catch (error) {
		const status = Number.isInteger(error?.status) ? error.status : 503;
		return respond(res, status, { error: status === 413 ? 'Webhook payload is too large' : 'Webhook could not be processed' });
	}
}
