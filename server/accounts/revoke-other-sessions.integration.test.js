import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import accounts from './index.js';
import registration from '../registration/index.js';
import binds from '../binds/index.js';
import generate from '../ai/generate.js';
import aiStatus from '../ai/status.js';
import { requireUser } from '../_auth.js';

// No mocks for application identity/Telegram/RBAC/critical guards or SQL RPCs.
// Only the external Auth/Telegram/PostgREST HTTP boundary is synthetic. Auth
// deliberately accepts valid, unexpired JWTs after their session was revoked.
const pg = new PGlite();
const actor = randomUUID(), foreign = randomUUID();
const current = randomUUID(), oldA = randomUUID(), oldB = randomUUID(), foreignSid = randomUUID();
const env = {
 SUPABASE_URL:'https://integration.supabase.test', SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable',
 SUPABASE_SERVICE_ROLE_KEY:'synthetic-service', TELEGRAM_BOT_TOKEN:'existing-synthetic-bot',
 TELEGRAM_BOT_USERNAME:'GetSupportOSBot', TELEGRAM_WEBHOOK_SECRET:'s'.repeat(40),
};
const signingKey = 'synthetic-integration-signing-key';
const signature = data => createHmac('sha256',signingKey).update(data).digest('base64url');
function jwt(user,sid) {
 const data=[{alg:'HS256',typ:'JWT'},{sub:user,session_id:sid,exp:Math.floor(Date.now()/1000)+3600}]
  .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 return `${data}.${signature(data)}`;
}
function verifiedClaims(bearer) {
 if(!bearer?.startsWith('Bearer '))return null;
 const [header,payload,sig]=bearer.slice(7).split('.');
 if(!header||!payload||!sig)return null;
 const expected=Buffer.from(signature(`${header}.${payload}`)),actual=Buffer.from(sig);
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;
 try { const claims=JSON.parse(Buffer.from(payload,'base64url').toString()); return claims.exp>Date.now()/1000?claims:null; }
 catch { return null; }
}
let tokens, botMessages, logoutCalls, databasePaths, authMode;
const response = () => ({headers:{},setHeader(key,value){this.headers[key]=value;},end(text){this.body=JSON.parse(text);},
 status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
function request(url,token=tokens.current,body) {
 return {url,method:body===undefined?'GET':'POST',body,
  headers:{authorization:`Bearer ${token}`,origin:'https://app.test',host:'app.test','user-agent':'Synthetic Chrome/130.0 (Windows NT 10.0)'},
  socket:{remoteAddress:'192.0.2.10'}};
}
async function call(handler,url,token=tokens.current,body) {
 const res=response();await handler(request(url,token,body),res);return res;
}
async function sqlRpc(name,args) {
 const entries=Object.entries(args);
 if(!/^supportos_[a-z_]+$/.test(name)||entries.some(([key])=>!/^[a-z_]+$/.test(key)))throw new Error('Unexpected RPC identifier');
 await pg.exec('savepoint http_rpc;set local role service_role');
 try {
  const result=(await pg.query(`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) value`,entries.map(([,value])=>value))).rows[0].value;
  await pg.exec('reset role;release savepoint http_rpc');return Response.json(result);
 } catch(error) {
  await pg.exec('rollback to savepoint http_rpc;release savepoint http_rpc');
  return Response.json({code:error.code,message:error.message},{status:400});
 }
}
async function transport(input,init={}) {
 const url=new URL(typeof input==='string'?input:input.url??String(input));
 const headers=new Headers(init.headers),method=init.method??'GET';
 const body=init.body?JSON.parse(init.body):undefined;
 if(url.origin===env.SUPABASE_URL&&url.pathname.startsWith('/auth/v1/')) {
  const claims=verifiedClaims(headers.get('Authorization'));
  if(!claims)return Response.json({message:'Invalid JWT'},{status:401});
  const user=(await pg.query('select id,email from auth.users where id=$1',[claims.sub])).rows[0];
  if(!user)return Response.json({message:'Unknown user'},{status:401});
  if(url.pathname==='/auth/v1/user')return Response.json(user);
  if(url.pathname==='/auth/v1/logout') {
   expect(method).toBe('POST');expect(headers.get('apikey')).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
   logoutCalls.push({actor:claims.sub,sid:claims.session_id,scope:url.searchParams.get('scope')});
   expect(url.searchParams.get('scope')).toBe('others');
   if(authMode==='error')return Response.json({message:'Synthetic Auth failure'},{status:500});
   if(authMode!=='no-op')await pg.query('delete from auth.sessions where user_id=$1 and id<>$2',[claims.sub,claims.session_id]);
   return new Response(null,{status:204});
  }
 }
 if(url.origin===env.SUPABASE_URL&&url.pathname.startsWith('/rest/v1/')) {
  expect(headers.get('apikey')).toBe(env.SUPABASE_SERVICE_ROLE_KEY);
  expect(headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  databasePaths.push(url.pathname);
  if(url.pathname.startsWith('/rest/v1/rpc/'))return sqlRpc(url.pathname.split('/').at(-1),body);
  if(url.pathname==='/rest/v1/supportos_binds'&&method==='GET'&&url.searchParams.get('owner_id')==='is.null') {
   await pg.exec('set local role service_role');
   try { return Response.json((await pg.query('select * from public.supportos_binds where owner_id is null order by id limit 500')).rows); }
   finally { await pg.exec('reset role'); }
  }
 }
 if(url.origin==='https://api.telegram.org'&&url.pathname.startsWith(`/bot${env.TELEGRAM_BOT_TOKEN}/`)) {
  expect(method).toBe('POST');
  if(url.pathname.endsWith('/sendMessage'))botMessages.push(body);
  else expect(url.pathname.endsWith('/answerCallbackQuery')).toBe(true);
  return Response.json({ok:true,result:{message_id:1}});
 }
 throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
}
async function begin(action='sessions.revoke_others',payload={},token=tokens.current) {
 const res=await call(accounts,'/api/accounts?action=critical',token,{operation:'begin',action,payload});
 expect(res.statusCode).toBe(200);
 return {id:res.body.id,token:res.body.token,callback:botMessages.at(-1).reply_markup.inline_keyboard[0][0].callback_data};
}
async function decide(proof,approved=true,tg=333) {
 const req=request('/api/registration?action=webhook',tokens.current,{callback_query:{id:'synthetic-callback',from:{id:tg},
  message:{chat:{type:'private',id:tg}},data:approved?proof.callback:proof.callback.replace('critical_approve:','critical_reject:')}});
 req.headers['x-telegram-bot-api-secret-token']=env.TELEGRAM_WEBHOOK_SECRET;
 const res=response();await registration(req,res);expect(res.statusCode).toBe(200);
}
const execute=(proof,token=tokens.current,extra={})=>call(accounts,'/api/accounts?action=revoke-other-sessions',token,{confirmation:proof?{id:proof.id,token:proof.token}:undefined,...extra});
const sessionIds=async()=>(await pg.query('select id from auth.sessions order by id')).rows.map(row=>row.id).sort();
const expectedSessions=[current,oldA,oldB,foreignSid].sort();
const revokedEvents=async()=>(await pg.query("select event_ref from supportos_login_events where event_type='sessions_revoked'")).rows;
const revokedAudit=async()=>(await pg.query("select * from supportos_access_audit where action='sessions.revoke_others' order by id")).rows;

beforeAll(async()=>{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz,created_at timestamptz default now(),updated_at timestamptz,refreshed_at timestamp,user_agent text);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant usage on schema auth to authenticated;`);
 await pg.query('insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,$2,$3,$4),($5,$6,$3,$7)',
  [actor,'admin@example.test','synthetic-hash',{role:'admin'},foreign,'foreign@example.test',{role:'support'}]);
 for(const path of ['schema.sql','migrations/20260923081810_telegram_registration.sql','migrations/20260923192252_telegram_login_2fa.sql',
  'migrations/20260923194400_telegram_password_confirmation.sql','migrations/20261007184859_active_user_sessions.sql',
  'migrations/20260929070633_server_only_supportos_grants.sql',
  'migrations/20261007191041_login_security_history.sql','migrations/20261007194247_telegram_critical_confirmation.sql',
  'migrations/20261007203642_critical_security_access_audit.sql','migrations/20261007204222_audit_registration_claim_completion.sql',
  'migrations/20261007205438_restrict_access_helper_execute.sql','migrations/20261007210927_harden_all_supportos_relation_grants.sql'])
  await pg.exec(await readFile(new URL('../../supabase/'+path,import.meta.url),'utf8'));
 await pg.query('insert into auth.sessions(id,user_id) values($1,$5),($2,$5),($3,$5),($4,$6)',[current,oldA,oldB,foreignSid,actor,foreign]);
 await pg.query("insert into supportos_telegram_links(user_id,telegram_id,source) values($1,333,'registration'),($2,444,'registration')",[actor,foreign]);
 // Fixtures represent previously completed login 2FA on each separate device.
 for(const [user,sid,tg,index] of [[actor,current,333,'a'],[actor,oldA,333,'b'],[actor,oldB,333,'c'],[foreign,foreignSid,444,'d']])
  await pg.query("insert into supportos_telegram_login_challenges(id,user_id,session_id,telegram_id,challenge_hash,status,approved_at) values($1,$2,$3,$4,$5,'approved',now())",[randomUUID(),user,sid,tg,index.repeat(64)]);
},20000);
beforeEach(async()=>{
 await pg.exec('begin');
 tokens={current:jwt(actor,current),oldA:jwt(actor,oldA),oldB:jwt(actor,oldB),foreign:jwt(foreign,foreignSid)};
 botMessages=[];logoutCalls=[];databasePaths=[];authMode='normal';
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 vi.stubGlobal('fetch',vi.fn(transport));
});
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await pg.exec('rollback;reset role');});
afterAll(async()=>{await pg.close();});

it('revokes others through the real backend + SDK and immediately blocks still-valid old JWTs at sensitive guards',async()=>{
 for(const token of [tokens.current,tokens.oldA,tokens.oldB]) {
  expect((await call(accounts,'/api/accounts?action=me',token)).statusCode).toBe(200);
  expect((await call(binds,'/api/binds?action=shared',token)).statusCode).toBe(200);
  await expect(requireUser(request('/api/accounts',token),{permission:'users.manage'})).resolves.toHaveProperty('sessionId');
 }
 const proof=await begin();await decide(proof);
 const result=await execute(proof);
 expect(result.statusCode).toBe(200);expect(result.body).toEqual({ok:true});
 expect(result.headers['Cache-Control']).toBe('private, no-store');
 expect(logoutCalls).toEqual([{actor,sid:current,scope:'others'}]);
 expect(await sessionIds()).toEqual([current,foreignSid].sort());
 const audit=await revokedAudit();expect(audit).toHaveLength(1);
 expect(audit[0]).toMatchObject({actor_id:actor,target_id:actor,action:'sessions.revoke_others',
  before_data:{other_sessions:2,current_session_id:current},
  after_data:{other_sessions:0,current_session_id:current,current_session_preserved:true}});
 expect(audit[0].created_at).toBeTruthy();
 expect(JSON.stringify(audit)).not.toContain(proof.token);expect(JSON.stringify(audit)).not.toContain(tokens.current);
 const listed=await call(accounts,'/api/accounts?action=sessions');
 expect(listed.body.sessions.map(row=>[row.id,row.is_current])).toEqual([[current,true]]);
 expect((await call(aiStatus,'/api/ai/status')).statusCode).toBe(200);
 expect((await call(binds,'/api/binds?action=shared')).statusCode).toBe(200);
 expect((await call(accounts,'/api/accounts?action=me',tokens.foreign)).statusCode).toBe(200);
 for(const [oldToken,oldSid] of [[tokens.oldA,oldA],[tokens.oldB,oldB]]) {
  // Auth still validates signature/expiry; the DB live-session gate must reject.
  expect((await fetch(env.SUPABASE_URL+'/auth/v1/user',{headers:{Authorization:`Bearer ${oldToken}`}})).status).toBe(200);
  expect((await pg.query('select status from supportos_telegram_login_challenges where session_id=$1',[oldSid])).rows[0].status).toBe('approved');
  await expect(requireUser(request('/api/accounts',oldToken),{permission:'users.manage'})).rejects.toMatchObject({status:401});
  for(const [handler,url,body] of [[accounts,'/api/accounts?action=me'],[accounts,'/api/accounts?action=sessions'],
   [accounts,'/api/accounts?action=login-history'],[accounts,'/api/accounts?action=revoke-other-sessions',{confirmation:{id:proof.id,token:proof.token},session_id:current,actor}],
   [binds,'/api/binds?action=shared&session_id='+current],[generate,'/api/ai/generate',{purpose:'composer',message:'Synthetic request',session_id:current}],[aiStatus,'/api/ai/status']]) {
   const cursor=databasePaths.length;
   const denied=await call(handler,url,oldToken,body);
   expect(denied.statusCode).toBe(401);
   expect(databasePaths.slice(cursor)).toEqual(['/rest/v1/rpc/supportos_tg_login_state']);
  }
 }
 expect(await revokedEvents()).toEqual([{event_ref:'critical:'+proof.id}]);
 expect(logoutCalls).toHaveLength(1);
 const replay=await execute(proof);expect(replay.statusCode).toBe(409);expect(logoutCalls).toHaveLength(1);
 expect(JSON.stringify(result.body)).not.toMatch(/access_token|refresh_token|token|session_id/);
});
it('a completed login 2FA or pending critical request alone cannot revoke sessions',async()=>{
 expect((await execute()).statusCode).toBe(428);
 const proof=await begin();expect((await execute(proof)).statusCode).toBe(428);
 expect(logoutCalls).toHaveLength(0);expect(await sessionIds()).toEqual(expectedSessions);expect(await revokedEvents()).toHaveLength(0);
});
it('requires a new Telegram confirmation for another revocation, even when a new session appears',async()=>{
 const first=await begin();await decide(first);expect((await execute(first)).statusCode).toBe(200);
 const newlyCreated=randomUUID();await pg.query('insert into auth.sessions(id,user_id) values($1,$2)',[newlyCreated,actor]);
 expect((await execute(first)).statusCode).toBe(409);expect(await sessionIds()).toContain(newlyCreated);
 // Avoid a real wait: age the used fixture's rate-limit timestamp, not its expiry.
 await pg.query("update supportos_telegram_critical_requests set created_at=now()-interval '20 seconds' where id=$1",[first.id]);
 const second=await begin();expect(second.id).not.toBe(first.id);expect(second.token).not.toBe(first.token);
 expect((await execute(second)).statusCode).toBe(428);expect(await sessionIds()).toContain(newlyCreated);
 await decide(second);expect((await execute(second)).statusCode).toBe(200);
 expect(await sessionIds()).toEqual([current,foreignSid].sort());expect(logoutCalls).toHaveLength(2);
 expect(await revokedEvents()).toHaveLength(2);
});
it.each(['expired','rejected'])('requires a fresh approval, rejecting %s critical confirmation before Auth revocation',async(state)=>{
 const proof=await begin();await decide(proof,state!=='rejected');
 if(state==='expired')await pg.query("update supportos_telegram_critical_requests set expires_at=now()-interval '1 second' where id=$1",[proof.id]);
 expect((await execute(proof)).statusCode).toBe(state==='expired'?410:428);
 expect(logoutCalls).toHaveLength(0);expect(await sessionIds()).toEqual(expectedSessions);
});
it('binds approval to actor/session/action and ignores target/scope/keep-session overrides',async()=>{
 const proof=await begin();await decide(proof);
 expect((await execute(proof,tokens.oldA)).statusCode).toBe(409);
 expect((await execute(proof,tokens.foreign)).statusCode).toBe(409);
 expect(logoutCalls).toHaveLength(0);
 const ok=await execute(proof,tokens.current,{actor:foreign,target:foreign,session_id:oldA,scope:'global'});
 expect(ok.statusCode).toBe(200);expect(await sessionIds()).toEqual([current,foreignSid].sort());
 expect(logoutCalls).toEqual([{actor,sid:current,scope:'others'}]);
});
it('cannot substitute approval for another critical action or an unauthenticated Telegram sender',async()=>{
 const proof=await begin('telegram.unlink');await decide(proof);
 expect((await execute(proof)).statusCode).toBe(409);expect(logoutCalls).toHaveLength(0);
 // Separate fixture reset is unnecessary: age only the synthetic rate-limit row.
 await pg.query("update supportos_telegram_critical_requests set created_at=now()-interval '20 seconds' where id=$1",[proof.id]);
 const revoke=await begin();await decide(revoke,true,444);
 expect((await execute(revoke)).statusCode).toBe(428);expect(await sessionIds()).toEqual(expectedSessions);
});
it.each(['error','no-op'])('fails closed on Auth %s and never records success or replays the consumed proof',async(mode)=>{
 const proof=await begin();await decide(proof);authMode=mode;
 expect((await execute(proof)).statusCode).toBe(503);
 expect(await revokedEvents()).toHaveLength(0);expect(await sessionIds()).toEqual(expectedSessions);
 expect(await revokedAudit()).toHaveLength(0);
 authMode='normal';expect((await execute(proof)).statusCode).toBe(409);expect(logoutCalls).toHaveLength(1);
});
it('cannot keep a revoked access token by swapping its signed session claim to current',async()=>{
 const proof=await begin();await decide(proof);await execute(proof);
 const [header,payload,sig]=tokens.oldA.split('.');
 const forgedClaims={...JSON.parse(Buffer.from(payload,'base64url').toString()),session_id:current};
 const forged=[header,Buffer.from(JSON.stringify(forgedClaims)).toString('base64url'),sig].join('.');
 const cursor=databasePaths.length;
 expect((await call(accounts,'/api/accounts?action=me',forged)).statusCode).toBe(401);
 expect(databasePaths).toHaveLength(cursor);
 expect((await call(accounts,'/api/accounts?action=me')).statusCode).toBe(200);
});
it('does not call Auth or consume approval if the pre-Auth audit cannot be committed',async()=>{
 const proof=await begin();await decide(proof);
 await pg.exec(`create function public.fixture_fail_intent_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit unavailable';end$$;
  create trigger fixture_fail_intent before insert on supportos_access_audit for each row execute function public.fixture_fail_intent_audit();`);
 expect((await execute(proof)).statusCode).toBe(400);
 expect(logoutCalls).toHaveLength(0);expect(await sessionIds()).toEqual(expectedSessions);
 expect(await revokedEvents()).toHaveLength(0);expect(await revokedAudit()).toHaveLength(0);
 expect((await pg.query('select status from supportos_telegram_critical_requests where id=$1',[proof.id])).rows[0].status).toBe('approved');
});
