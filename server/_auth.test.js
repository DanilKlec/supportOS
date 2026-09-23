import { afterEach, expect, it, vi } from 'vitest';
const rbac=vi.hoisted(()=>({loadAccess:vi.fn()}));
vi.mock('./_rbac.js',()=>rbac);
const mfa=vi.hoisted(()=>({requireTelegram:vi.fn(async()=>{})}));
vi.mock('./telegram-2fa.js',()=>mfa);
import { authorize, requireUser } from './_auth.js';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'};
it('rejects disabled accounts and uses database permissions over legacy admin metadata',async()=>{
 const request={headers:{authorization:'Bearer x.'+Buffer.from(JSON.stringify({sub:'u',session_id:'11111111-1111-4111-8111-111111111111'})).toString('base64url')+'.signature'}};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:'u',app_metadata:{role:'admin',supportos_role:'support'}}))));
 rbac.loadAccess.mockResolvedValue({status:'active',permissions:['work']});
 await expect(requireUser(request,{env,permission:'users.manage'})).rejects.toMatchObject({status:403});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:'u',app_metadata:{role:'admin',disabled:true}}))));
 rbac.loadAccess.mockResolvedValue({status:'disabled',permissions:[]});
 await expect(requireUser(request,{env})).rejects.toMatchObject({status:403});
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('fails closed without a bearer token',async()=>{await expect(requireUser({headers:{}},{env})).rejects.toMatchObject({status:401});});
it('does not authorize anonymous Supabase users',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"id":"a","is_anonymous":true}')));await expect(requireUser({headers:{authorization:'Bearer token'}},{env})).rejects.toMatchObject({status:401});});
it('fails closed on auth service failure',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('network');}));await expect(requireUser({headers:{authorization:'Bearer token'}},{env})).rejects.toMatchObject({status:503});});
it('returns uncached 401 JSON for protected APIs',async()=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};expect(await authorize({headers:{},method:'GET'},res)).toBe(false);expect(res.statusCode).toBe(401);expect(res.headers['Cache-Control']).toContain('no-store');});
it('requires the second factor even with valid password and active permissions',async()=>{
 const token='x.'+Buffer.from(JSON.stringify({sub:'u',session_id:'11111111-1111-4111-8111-111111111111'})).toString('base64url')+'.signature';
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:'u'}))));
 mfa.requireTelegram.mockRejectedValueOnce(Object.assign(new Error('Telegram 2FA required'),{status:403,code:'telegram_2fa_required'}));
 await expect(requireUser({headers:{authorization:`Bearer ${token}`}},{env})).rejects.toMatchObject({status:403,code:'telegram_2fa_required'});
 expect(mfa.requireTelegram).toHaveBeenLastCalledWith(expect.objectContaining({id:'u',sessionId:'11111111-1111-4111-8111-111111111111'}),env);
});
it('rejects missing or mismatched session claims after Supabase validates the token',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:'u'}))));
 for(const claims of [{sub:'u'},{sub:'other',session_id:'11111111-1111-4111-8111-111111111111'}]){
  const token='x.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.sig';
  await expect(requireUser({headers:{authorization:`Bearer ${token}`}},{env})).rejects.toMatchObject({status:401});
 }
});
