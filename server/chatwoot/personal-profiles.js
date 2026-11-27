import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { db } from '../supabase-rest.js';

const table = 'supportos_chatwoot_personal_profiles';

function accountKey(cfg) {
	return createHash('sha256').update(`${cfg.base}\n${cfg.accountId}`).digest('hex');
}

function storageKey(env) {
	return hkdfSync('sha256', env.SUPABASE_SERVICE_ROLE_KEY, '', 'supportos/chatwoot-personal-profile/v1', 32);
}

function recordPath(cfg, userId) {
	return `${table}?user_id=eq.${encodeURIComponent(userId)}&account_key=eq.${accountKey(cfg)}`;
}

const associatedData = (cfg, userId) => Buffer.from(`${userId}:${accountKey(cfg)}`);

export async function readPersonalToken(env, cfg, userId) {
	const [row] = await db(env, `${recordPath(cfg, userId)}&select=sealed_token&limit=1`);
	if (!row) return null;
	try {
		const bytes = Buffer.from(row.sealed_token, 'base64url');
		const decipher = createDecipheriv('aes-256-gcm', storageKey(env), bytes.subarray(0, 12));
		decipher.setAAD(associatedData(cfg, userId));
		decipher.setAuthTag(bytes.subarray(12, 28));
		return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
	} catch {
		throw Object.assign(new Error('Подключите личный профиль Chatwoot заново.'), { status: 409 });
	}
}

export async function savePersonalToken(env, cfg, userId, token) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', storageKey(env), iv);
	cipher.setAAD(associatedData(cfg, userId));
	const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
	const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
	const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?on_conflict=user_id,account_key`, {
		method: 'POST',
		headers: {
			apikey: env.SUPABASE_SERVICE_ROLE_KEY,
			Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
			'Content-Type': 'application/json',
			Prefer: 'resolution=merge-duplicates,return=minimal',
		},
		body: JSON.stringify({ user_id: userId, account_key: accountKey(cfg), sealed_token: sealed }),
		signal: AbortSignal.timeout(10000),
	});
	if (!response.ok) throw Object.assign(new Error('Не удалось сохранить подключение Chatwoot.'), { status: 502 });
}

export async function removePersonalToken(env, cfg, userId) {
	await db(env, recordPath(cfg, userId), undefined, 'DELETE');
}
