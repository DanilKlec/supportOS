import { config } from '../agent-monitor/_server.js';
import { logoutAction } from '../session-logout.js';
import { requireUser } from '../_auth.js';

// Registration, recovery and TOTP use Supabase Auth. Bot actions are retired.
export default async function handler(req, res) {
 res.setHeader('Cache-Control', 'private, no-store');
 res.setHeader('Content-Type', 'application/json; charset=utf-8');
 const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
 try {
  const action=new URL(req.url,'http://localhost').searchParams.get('action');
  if (!['logout','logout-all'].includes(action)) return send(410, { error: 'Этот способ авторизации больше не используется' });
  if (req.method !== 'POST') return send(405, { error: 'POST required' });
  if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: 'Invalid origin' });
  if(action==='logout-all') await requireUser(req,{permission:null});
  return send(200, await logoutAction(req, config(), action==='logout-all'?'global':'local'));
 } catch (error) { return send(error.status ?? 503, { error: error.status ? error.message : 'Не удалось завершить сессию' }); }
}
