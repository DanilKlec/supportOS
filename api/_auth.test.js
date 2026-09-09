import { afterEach, expect, it, vi } from 'vitest';
import { authorize, requireUser } from './_auth.js';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('fails closed without a bearer token',async()=>{await expect(requireUser({headers:{}},{env})).rejects.toMatchObject({status:401});});
it('does not authorize anonymous Supabase users',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"id":"a","is_anonymous":true}')));await expect(requireUser({headers:{authorization:'Bearer token'}},{env})).rejects.toMatchObject({status:401});});
it('fails closed on auth service failure',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('network');}));await expect(requireUser({headers:{authorization:'Bearer token'}},{env})).rejects.toMatchObject({status:503});});
it('returns uncached 401 JSON for protected APIs',async()=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};expect(await authorize({headers:{},method:'GET'},res)).toBe(false);expect(res.statusCode).toBe(401);expect(res.headers['Cache-Control']).toContain('no-store');});
