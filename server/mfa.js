import { config, db } from './agent-monitor/_server.js';

export async function requireMfa(user, env) {
 const state = await db(config(env), 'rpc/supportos_mfa_session_state', { subject: user.id, sid: user.sessionId });
 if (state?.status === 'invalid_session') throw Object.assign(new Error('Сессия завершена. Войдите снова.'), { status: 401 });
 // getUser validates the exact JWT before its claims are read. A stale AAL1
 // token never inherits a later verification from the same session.
 if (state?.status !== 'approved' || (state.mfaEnabled !== false && user.aal !== 'aal2')) {
  throw Object.assign(new Error('Подтвердите вход через Google Authenticator'), { status: 403, code: 'mfa_required' });
 }
 user.mfaEnabled = state.mfaEnabled !== false;
}
