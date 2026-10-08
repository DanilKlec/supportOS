import { requireIdentity } from './_auth.js';
import { adminClient } from './accounts/index.js';
import { db } from './agent-monitor/_server.js';
import { securityMetadata } from './security-metadata.js';

export async function logoutAction(req, env) {
 // Logout must remain available before 2FA and for disabled/pending accounts.
 const user = await requireIdentity(req,env);
 const metadata = securityMetadata(req,env);
 // Auth + PostgREST cannot share a transaction: persist intent first, then
 // record success only after the existing RPC verifies actual revocation.
 const intent = await db(env,'rpc/supportos_request_logout_audit',{subject:user.id,sid:user.sessionId});
 if (!intent?.ok) throw Object.assign(new Error('Не удалось зарегистрировать запрос завершения сессии. Повторите попытку.'),{status:503});
 const {error} = await adminClient(env).signOut(req.headers.authorization.slice(7),'local');
 // Auth can reject a retry after revocation. The RPC still verifies absence;
 // an active session or a provider/network error must never get a success event.
 if (error && ![401,403,404].includes(error.status)) throw Object.assign(new Error('Не удалось завершить сессию. Повторите попытку.'),{status:503});
 const result = await db(env,'rpc/supportos_record_session_revoked',{
  subject:user.id,sid:user.sessionId,ip_digest:metadata.ipHash,agent:metadata.agent,
 });
 if (!result?.ok) throw Object.assign(new Error('Не удалось подтвердить завершение сессии. Повторите попытку.'),{status:503});
 return {ok:true};
}
