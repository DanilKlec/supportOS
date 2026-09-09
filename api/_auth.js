// Verify with Supabase Auth on every request; decoded JWTs and browser stores are not authorization.
export async function requireUser(request, { supervisor = false, env = process.env } = {}) {
 const header = request.headers.authorization;
 if (typeof header !== 'string' || !/^Bearer \S+$/i.test(header)) throw Object.assign(new Error('Войдите в SupportOS'), { status: 401 });
 const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
 const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
 if (!url || !key) throw Object.assign(new Error('Supabase Auth не настроен на сервере'), { status: 503 });
 let result;
 try {
  result = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
   headers: { apikey: key, Authorization: header }, signal: AbortSignal.timeout(10000),
  });
 } catch { throw Object.assign(new Error('Сервис авторизации недоступен'), { status: 503 }); }
 if (!result.ok) throw Object.assign(new Error(result.status >= 500 ? 'Сервис авторизации недоступен' : 'Сессия недействительна. Войдите снова.'), { status: result.status >= 500 ? 503 : 401 });
 const user = await result.json();
 if (!user?.id || user.is_anonymous) throw Object.assign(new Error('Войдите с личным аккаунтом'), { status: 401 });
 if (supervisor && !['admin', 'supervisor'].includes(user.app_metadata?.role)) throw Object.assign(new Error('Доступ разрешён только руководителям'), { status: 403 });
 return user;
}
export async function authorize(request, response) {
 if (request.method === 'OPTIONS') return true;
 response.setHeader('Cache-Control', 'private, no-store');
 try { await requireUser(request); return true; }
 catch (error) {
  response.statusCode = error.status ?? 503;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error: error.status ? error.message : 'Сервис авторизации недоступен' }));
  return false;
 }
}
