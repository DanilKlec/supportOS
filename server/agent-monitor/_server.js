import { createHash, timingSafeEqual } from 'node:crypto';

export function equal(a, b) {
 return timingSafeEqual(createHash('sha256').update(String(a ?? '')).digest(),createHash('sha256').update(String(b ?? '')).digest());
}
export function normalizeStatus(status) {
 return ({accepting_chats:'on',not_accepting_chats:'off',offline:'offline'})[String(status).replaceAll(' ','_')] ?? 'unknown';
}
export function config(env = process.env, extra = []) {
 const resolved = { ...env, SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL };
 const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', ...extra].filter(key => !resolved[key]);
 if (missing.length) throw Object.assign(new Error(`Настройте серверные переменные: ${missing.join(', ')}`), {status:503});
 return resolved;
}
export async function db(env, path, body, method = body === undefined ? 'GET' : 'POST') {
 const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${path}`, {
  method, headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},
  body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000)
 });
 if(!response.ok) throw Object.assign(new Error(`Ошибка хранилища (${response.status}). Проверьте миграцию agent-monitor.sql.`),{status:502});
 const text = await response.text(); return text ? JSON.parse(text) : null;
}
export async function live(env, action, body = {}, area='agent') {
 const response = await fetch(`https://api.livechatinc.com/v3.5/${area}/action/${action}`, {method:'POST',headers:{Authorization:env.LIVECHAT_AUTHORIZATION,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 if(!response.ok) throw Object.assign(new Error(`LiveChat: ${response.status}. Проверьте токен и права agents--all:ro.`),{status:502});
 return response.json();
}
export async function collect(env) {
 env = config(env, ['LIVECHAT_AUTHORIZATION']);
 if(!await db(env,'rpc/monitor_lock',{lock_id:'collect',seconds:20})) return {skipped:true};
 const at = new Date().toISOString();
 const [agents,statuses] = await Promise.all([live(env,'list_agents',{},'configuration'),live(env,'list_routing_statuses')]);
 if(!Array.isArray(agents)||!Array.isArray(statuses)) throw Object.assign(new Error('Неожиданный формат LiveChat API'),{status:502});
 const statusById = new Map(statuses.map(item=>[item.agent_id, normalizeStatus(item.status)]));
 // An omitted status is unknown, never inferred to mean offline.
 const rows = agents.map(agent=>({id:agent.id,name:agent.name || agent.id,status:statusById.get(agent.id) ?? 'unknown'}));
 await db(env,'rpc/monitor_ingest',{rows,observed:at,origin:'poll'});
 await db(env,'monitor_control?id=eq.collect',{updated_at:at},'PATCH');
 return {collected:rows.length,at};
}
export async function allRows(env,path) {
 const rows=[];
 for(let offset=0; ; offset+=1000) {
  const page=await db(env,`${path}&limit=1000&offset=${offset}`);
  rows.push(...page);
  if(page.length<1000) return rows;
  if(rows.length>=200000) throw Object.assign(new Error('Слишком большой отчёт. Обратитесь к администратору.'),{status:413});
 }
}

