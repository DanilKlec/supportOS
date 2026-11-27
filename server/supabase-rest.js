import { createHash, timingSafeEqual } from 'node:crypto';

export function equal(a, b) {
 return timingSafeEqual(createHash('sha256').update(String(a ?? '')).digest(),createHash('sha256').update(String(b ?? '')).digest());
}
export function config(env = process.env, extra = []) {
 const resolved = { ...env, SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL };
 const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', ...extra].filter(key => !resolved[key]);
 if (missing.length) throw Object.assign(new Error(`Настройте серверные переменные: ${missing.join(', ')}`), {status:503});
 return resolved;
}
export async function db(env, path, body, method = body === undefined ? 'GET' : 'POST', { returnRows = false } = {}) {
 const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/${path}`, {
  method, headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json', ...(returnRows ? { Prefer: 'return=representation' } : {})},
  body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000)
 });
 if(!response.ok) {
  const failure=await response.json().catch(()=>null);
  const storageCode=typeof failure?.code==='string'&&/^[A-Z0-9]{5,10}$/.test(failure.code)?failure.code:undefined;
  const hint=response.status===404&&['PGRST205','PGRST202'].includes(storageCode)
   ?'Не применены необходимые миграции серверной БД.'
   :response.status===401||response.status===403?'Проверьте серверную конфигурацию и права доступа к хранилищу.':'Не удалось выполнить запрос к серверному хранилищу.';
  throw Object.assign(new Error(`Ошибка хранилища (${response.status}). ${hint}`),{status:502,storageStatus:response.status,storageCode});
 }
 const text = await response.text(); return text ? JSON.parse(text) : null;
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

