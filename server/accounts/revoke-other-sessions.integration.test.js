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

// No mocks for application identity/TOTP/RBAC/critical guards or SQL RPCs.
// Only the external Auth/PostgREST HTTP boundary is synthetic. Auth
// deliberately accepts valid, unexpired JWTs after their session was revoked.
const pg = new PGlite();
const actor = randomUUID(), foreign = randomUUID();
const current = randomUUID(), oldA = randomUUID(), oldB = randomUUID(), foreignSid = randomUUID();
const env = {
 SUPABASE_URL:'https://integration.supabase.test', SUPABASE_PUBLISHABLE_KEY:'synthetic-publishable',
 SUPABASE_SERVICE_ROLE_KEY:'synthetic-service', SECURITY_AUDIT_SECRET:'s'.repeat(40),
};
const signingKey = 'synthetic-integration-signing-key';
const signature = data => createHmac('sha256',signingKey).update(data).digest('base64url');
let verifiedAt;
function jwt(user,sid,at=verifiedAt) {
 const data=[{alg:'HS256',typ:'JWT'},{sub:user,session_id:sid,aal:'aal2',amr:[{method:'totp',timestamp:at}],exp:Math.floor(Date.now()/1000)+3600}]
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
   expect(['others','local','global']).toContain(url.searchParams.get('scope'));
   if(authMode==='error')return Response.json({message:'Synthetic Auth failure'},{status:500});
   if(authMode!=='no-op') {
    const scope=url.searchParams.get('scope');
    if(scope==='others') await pg.query('delete from auth.sessions where user_id=$1 and id<>$2',[claims.sub,claims.session_id]);
    else if(scope==='local') await pg.query('delete from auth.sessions where user_id=$1 and id=$2',[claims.sub,claims.session_id]);
    else await pg.query('delete from auth.sessions where user_id=$1',[claims.sub]);
   }
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
 throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
}
async function begin(action='sessions.revoke_others',payload={},token=tokens.current) {
 verifiedAt++;
 if(token===tokens.current) {tokens.current=jwt(actor,current);token=tokens.current;}
 const res=await call(accounts,'/api/accounts?action=critical',token,{operation:'begin',action,payload});
 expect(res.statusCode).toBe(200);
 return {id:res.body.id,token:res.body.token};
}
async function decide(proof,approved=true) {
 if(!approved) expect((await call(accounts,'/api/accounts?action=critical',tokens.current,{operation:'cancel',id:proof.id})).statusCode).toBe(200);
}
const execute=(proof,token=tokens.current,extra={})=>call(accounts,'/api/accounts?action=revoke-other-sessions',token,{confirmation:proof?{id:proof.id,token:proof.token}:undefined,...extra});
const sessionIds=async()=>(await pg.query('select id from auth.sessions order by id')).rows.map(row=>row.id).sort();
const expectedSessions=[current,oldA,oldB,foreignSid].sort();
const revokedEvents=async()=>(await pg.query("select event_ref from supportos_login_events where event_type='sessions_revoked'")).rows;
const revokedAudit=async()=>(await pg.query("select * from supportos_access_audit where action='sessions.revoke_others' order by id")).rows;

beforeAll(async()=>{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz,aal text default 'aal2',factor_id uuid,created_at timestamptz default now(),updated_at timestamptz,refreshed_at timestamp,user_agent text);
  create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text);
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
  'migrations/20261007205438_restrict_access_helper_execute.sql','migrations/20261007210927_harden_all_supportos_relation_grants.sql','migrations/20261013102133_google_authenticator_auth.sql','migrations/20261013104812_optional_mfa_enrollment.sql'])
  await pg.exec(await readFile(new URL('../../supabase/'+path,import.meta.url),'utf8'));
 await pg.query('insert into auth.sessions(id,user_id) values($1,$5),($2,$5),($3,$5),($4,$6)',[current,oldA,oldB,foreignSid,actor,foreign]);
 for(const [user,sid] of [[actor,current],[actor,oldA],[actor,oldB],[foreign,foreignSid]]) {
  const factor=randomUUID();await pg.query("insert into auth.mfa_factors values($1,$2,'totp','verified')",[factor,user]);
  await pg.query("update auth.sessions set factor_id=$1 where id=$2",[factor,sid]);
 }
},20000);
beforeEach(async()=>{
 await pg.exec('begin');
 verifiedAt=Math.floor(Date.now()/1000);
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

  await expect(requireUser(request('/api/accounts',oldToken),{permission:'users.manage'})).rejects.toMatchObject({status:401});
  for(const [handler,url,body] of [[accounts,'/api/accounts?action=me'],[accounts,'/api/accounts?action=sessions'],
   [accounts,'/api/accounts?action=login-history'],[accounts,'/api/accounts?action=revoke-other-sessions',{confirmation:{id:proof.id,token:proof.token},session_id:current,actor}],
   [binds,'/api/binds?action=shared&session_id='+current],[generate,'/api/ai/generate',{purpose:'composer',message:'Synthetic request',session_id:current}],[aiStatus,'/api/ai/status']]) {
   const cursor=databasePaths.length;
   const denied=await call(handler,url,oldToken,body);
   expect(denied.statusCode).toBe(401);
   expect(databasePaths.slice(cursor)).toEqual(['/rest/v1/rpc/supportos_mfa_session_state']);
  }
 }
 expect(await revokedEvents()).toEqual([{event_ref:'critical:'+proof.id}]);
 expect(logoutCalls).toHaveLength(1);
 const replay=await execute(proof);expect(replay.statusCode).toBe(409);expect(logoutCalls).toHaveLength(1);
 expect(JSON.stringify(result.body)).not.toMatch(/access_token|refresh_token|token|session_id/);
});
it('requires a fresh TOTP verification and a payload-bound permit',async()=>{
 expect((await execute()).statusCode).toBe(428);
 const stale=jwt(actor,current,Math.floor(Date.now()/1000)-120);
 expect((await call(accounts,'/api/accounts?action=critical',stale,{operation:'begin',action:'sessions.revoke_others',payload:{}})).statusCode).toBe(428);
 expect(logoutCalls).toHaveLength(0);expect(await sessionIds()).toEqual(expectedSessions);
});
it('requires a new TOTP confirmation for another revocation, even when a new session appears',async()=>{
 const first=await begin();await decide(first);expect((await execute(first)).statusCode).toBe(200);
 const newlyCreated=randomUUID();await pg.query('insert into auth.sessions(id,user_id) values($1,$2)',[newlyCreated,actor]);
 expect((await execute(first)).statusCode).toBe(409);expect(await sessionIds()).toContain(newlyCreated);
 // Avoid a real wait: age the used fixture's rate-limit timestamp, not its expiry.
 await pg.query("update supportos_telegram_critical_requests set created_at=now()-interval '20 seconds' where id=$1",[first.id]);
 const second=await begin();expect(second.id).not.toBe(first.id);expect(second.token).not.toBe(first.token);
 expect(await sessionIds()).toContain(newlyCreated);
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
it('cannot substitute approval for another action or reuse the same verified TOTP token',async()=>{
 const proof=await begin('role.save',{id:'custom',name:'Custom',description:'',permissions:['work'],version:0});
 expect((await execute(proof)).statusCode).toBe(409);
 const replay=await call(accounts,'/api/accounts?action=critical',tokens.current,{operation:'begin',action:'sessions.revoke_others',payload:{}});
 expect(replay.statusCode).toBe(409);expect(replay.body.code).toBe('critical_mfa_reused');
 expect(logoutCalls).toHaveLength(0);expect(await sessionIds()).toEqual(expectedSessions);
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
it('rejects AAL1 tokens and enforces the same TOTP rule in existing RLS helpers',async()=>{
 const claims={sub:actor,session_id:current,aal:'aal1',exp:Math.floor(Date.now()/1000)+3600};
 const data=[{alg:'HS256',typ:'JWT'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const token=`${data}.${signature(data)}`;
 const denied=await call(accounts,'/api/accounts?action=me',token);
 expect(denied.statusCode).toBe(403);expect(denied.body.code).toBe('mfa_required');
 await pg.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify(claims)]);
 await pg.exec('set local role authenticated');
 expect((await pg.query('select supportos_private.telegram_session_approved() value')).rows[0].value).toBe(false);
 await pg.exec('reset role');
 await pg.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({...claims,aal:'aal2'})]);
 await pg.exec('set local role authenticated');
 expect((await pg.query('select supportos_private.telegram_session_approved() value')).rows[0].value).toBe(true);
 await pg.exec('savepoint no_direct_rpc');
 await expect(pg.query('select public.supportos_mfa_session_state($1,$2)',[actor,current])).rejects.toThrow('permission denied');
 await pg.exec('rollback to savepoint no_direct_rpc;reset role');
});
it('allows ordinary access without MFA but still enforces live sessions, RBAC and critical confirmation',async()=>{
 await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);
 await pg.query("update auth.sessions set aal='aal1',factor_id=null where user_id=$1",[actor]);
 const claims={sub:actor,session_id:current,aal:'aal1',exp:Math.floor(Date.now()/1000)+3600};
 const data=[{alg:'HS256',typ:'JWT'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const token=`${data}.${signature(data)}`;
 const me=await call(accounts,'/api/accounts?action=me',token);
 expect(me.statusCode).toBe(200);expect(me.body.mfaEnabled).toBe(false);
 expect((await call(accounts,'/api/accounts?action=sessions',token)).statusCode).toBe(200);
 expect((await call(accounts,'/api/accounts?action=critical',token,{operation:'begin',action:'sessions.revoke_others',payload:{}})).statusCode).toBe(428);
 await pg.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify(claims)]);
 await pg.exec('set local role authenticated');
 expect((await pg.query('select supportos_private.telegram_session_approved() value')).rows[0].value).toBe(true);
 await pg.exec('reset role');
 await pg.query("update supportos_users set status='disabled' where id=$1",[actor]);
 expect((await call(accounts,'/api/accounts?action=sessions',token)).statusCode).toBe(403);
 await pg.query('delete from auth.sessions where id=$1',[current]);
 expect((await call(accounts,'/api/accounts?action=me',token)).statusCode).toBe(401);
});
it('does not enable MFA until QR verification, then rejects existing AAL1 tokens',async()=>{
 await pg.query("update auth.mfa_factors set status='unverified' where user_id=$1",[actor]);
 await pg.query("update auth.sessions set aal='aal1' where id=$1",[current]);
 const claims={sub:actor,session_id:current,aal:'aal1',exp:Math.floor(Date.now()/1000)+3600};
 const data=[{alg:'HS256',typ:'JWT'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 const token=`${data}.${signature(data)}`;
 expect((await call(accounts,'/api/accounts?action=me',token)).body.mfaEnabled).toBe(false);
 await pg.query("update auth.mfa_factors set status='verified' where id=(select factor_id from auth.sessions where id=$1)",[current]);
 expect((await call(accounts,'/api/accounts?action=me',token)).statusCode).toBe(403);
 await pg.query("update auth.sessions set aal='aal2' where id=$1",[current]);
 expect((await call(accounts,'/api/accounts?action=me',token)).statusCode).toBe(403);
 expect((await call(accounts,'/api/accounts?action=me')).body.mfaEnabled).toBe(true);
});
it('invalidates a critical permit when all MFA factors are removed',async()=>{
 const proof=await begin();
 await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);
 expect((await call(accounts,'/api/accounts?action=me')).body.mfaEnabled).toBe(false);
 expect((await execute(proof)).statusCode).toBe(410);
 expect(logoutCalls).toHaveLength(0);
 expect(await sessionIds()).toEqual(expectedSessions);
});
it('requires a verified TOTP factor even for an AAL2 session and invalidates removed factors',async()=>{
 await pg.query("update auth.mfa_factors set status='unverified' where id=(select factor_id from auth.sessions where id=$1)",[current]);
 expect((await call(accounts,'/api/accounts?action=me')).statusCode).toBe(403);
 await pg.query("update auth.mfa_factors set status='verified',factor_type='phone' where user_id=$1",[actor]);
 expect((await call(accounts,'/api/accounts?action=me')).statusCode).toBe(403);
});
it('keeps new Google identities pending and audits native password changes without any bot permit',async()=>{
 const id=randomUUID();await pg.query('insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,$2,$3,$4)',[id,'google@example.test','old-hash',{provider:'google'}]);
 expect((await pg.query('select status from supportos_users where id=$1',[id])).rows[0].status).toBe('pending');
 expect((await pg.query('select count(*) n from supportos_user_roles where user_id=$1',[id])).rows[0].n).toBe(0);
 await pg.query('update auth.users set encrypted_password=$1 where id=$2',['new-hash',id]);
 const events=(await pg.query('select event_type,event_ref from supportos_login_events where user_id=$1',[id])).rows;
 expect(events).toHaveLength(1);expect(events[0].event_type).toBe('password_changed');
 expect(events[0].event_ref).toMatch(/^auth-password:/);
 expect(JSON.stringify((await pg.query('select * from supportos_access_audit where target_id=$1',[id])).rows)).not.toMatch(/old-hash|new-hash/);
});
it('supports audited global logout after a password change and blocks all old access tokens',async()=>{
 const result=await call(registration,'/api/registration?action=logout-all',tokens.current,{});
 expect(result.statusCode).toBe(200);expect(logoutCalls).toEqual([{actor,sid:current,scope:'global'}]);
 expect(await sessionIds()).toEqual([foreignSid]);
 for(const token of [tokens.current,tokens.oldA,tokens.oldB]) expect((await call(accounts,'/api/accounts?action=me',token)).statusCode).toBe(401);
 expect((await revokedEvents()).map(event=>event.event_ref)).toEqual(['logout:'+current]);
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
