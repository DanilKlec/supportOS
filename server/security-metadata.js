import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function securityMetadata(req, env) {
 const agent = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'].slice(0,512) : '';
 // Vercel overwrites its own header; never trust arbitrary X-Forwarded-For.
 const candidate = env.VERCEL === '1' ? req.headers?.['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
 const ip = typeof candidate === 'string' ? candidate.split(',')[0].trim() : '';
 if (!isIP(ip)) return {agent,ipHash:null};
 const secret = env.SECURITY_AUDIT_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
 if (!secret) throw Object.assign(new Error('Не настроен серверный ключ журнала безопасности'),{status:503});
 return {agent,ipHash:createHmac('sha256',secret).update(ip).digest('hex')};
}
