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
function jwt(user,sid,at=verifiedAt,aal='aal2') {
 const data=[{alg:'HS256',typ:'JWT'},{sub:user,session_id:sid,aal,amr:[{method:'totp',timestamp:at}],exp:Math.floor(Date.now()/1000)+3600}]
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
let tokens, botMessages, logoutCalls, databasePaths, authMode, accountCalls;
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
  if(url.pathname==='/auth/v1/admin/users'&&method==='POST'&&headers.get('Authorization')===`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
   const subject=randomUUID();accountCalls.push({subject,method});
   await pg.query('insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,$2,$3,$4)',[subject,body.email,'synthetic-created-hash',body.app_metadata]);
   return Response.json({id:subject,email:body.email});
  }
  const factorPath=url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)\/factors(?:\/([^/]+))?$/);
  if(factorPath&&headers.get('Authorization')===`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
   const [,subject,factorId]=factorPath;accountCalls.push({subject,method,...(factorId?{factorId}:{})});
   if(method==='GET') {
    if(authMode==='mfa-list-error')return Response.json({message:'Synthetic MFA failure'},{status:500});
    return Response.json((await pg.query('select * from auth.mfa_factors where user_id=$1',[subject])).rows);
   }
   if(method==='DELETE'&&factorId) {
    if(authMode==='mfa-delete-error')return Response.json({message:'Synthetic MFA failure'},{status:500});
    if(authMode!=='mfa-no-op')await pg.query('delete from auth.mfa_factors where user_id=$1 and id=$2',[subject,factorId]);
    if(authMode==='mfa-concurrent-session')await pg.query('insert into auth.sessions(id,user_id) values($1,$2)',[randomUUID(),subject]);
    if(authMode==='mfa-concurrent-factor')await pg.query("insert into auth.mfa_factors values($1,$2,'totp','verified')",[randomUUID(),subject]);
    return Response.json({id:factorId});
   }
   throw new Error('Unexpected MFA request');
  }
  if(url.pathname.startsWith('/auth/v1/admin/users/')&&headers.get('Authorization')===`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
   const subject=url.pathname.split('/').at(-1);
   accountCalls.push({subject,method});
   if(authMode==='error')return Response.json({message:'Synthetic Auth failure'},{status:500});
   if(method==='PUT'){
    await pg.query('update auth.users set encrypted_password=$1 where id=$2',['synthetic-updated-hash',subject]);
    if(authMode==='concurrent-session')await pg.query('insert into auth.sessions(id,user_id) values($1,$2)',[randomUUID(),subject]);
   }
   else if(method==='DELETE')await pg.query('delete from auth.users where id=$1',[subject]);
   else throw new Error('Unexpected account action');
   return Response.json({id:subject,email:'foreign@example.test'});
  }
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
  const catalogTables={'/rest/v1/supportos_roles':'supportos_roles','/rest/v1/supportos_permissions':'supportos_permissions','/rest/v1/supportos_role_permissions':'supportos_role_permissions'};
  if(method==='GET'&&catalogTables[url.pathname])return Response.json((await pg.query(`select * from public.${catalogTables[url.pathname]} order by 1 limit 1000 offset $1`,[Number(url.searchParams.get('offset')??0)])).rows);
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
 await pg.exec('create table public.supportos_content_revisions(id text primary key,updated_by uuid references public.supportos_users(id));');
 await pg.exec(await readFile(new URL('../../supabase/migrations/20261006214000_ai_feedback_reviews.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../../supabase/migrations/20261014111330_admin_account_management.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../../supabase/migrations/20261014112108_admin_password_session_completion.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../../supabase/migrations/20261014112652_admin_account_confirmation_dialog.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../../supabase/migrations/20261014114417_admin_create_confirmation_dialog.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../../supabase/migrations/20261014114917_admin_access_confirmation_dialog.sql',import.meta.url),'utf8'));
 await pg.exec(await readFile(new URL('../../supabase/migrations/20261014122016_admin_user_security.sql',import.meta.url),'utf8'));
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
 botMessages=[];logoutCalls=[];databasePaths=[];authMode='normal';accountCalls=[];
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

it('changes a password after the dialog confirmation without another TOTP and revokes old JWTs',async()=>{
 const payload={id:foreign,version:1,password:'synthetic-new-password'};
 const denied=await call(accounts,'/api/accounts',tokens.current,{action:'user.password',payload});
 expect(denied.statusCode).toBe(400);expect(accountCalls).toEqual([]);
 const staleTotpToken=jwt(actor,current,verifiedAt-600);
 const success=await call(accounts,'/api/accounts',staleTotpToken,{action:'user.password',payload,confirmed:true});
 expect(success.statusCode).toBe(200);expect(accountCalls).toEqual([{subject:foreign,method:'PUT'}]);
 expect((await call(accounts,'/api/accounts?action=me',tokens.foreign)).statusCode).toBe(401);
 expect((await call(accounts,'/api/accounts?action=me')).statusCode).toBe(200);
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.password',payload,confirmed:true})).statusCode).toBe(409);
 const audit=(await pg.query("select * from supportos_access_audit where action like 'user.password%'")).rows;
 expect(audit.map(row=>row.action).sort()).toEqual(['user.password','user.password.requested']);
 expect(audit.every(row=>row.actor_id===actor&&row.target_id===foreign)).toBe(true);
 expect(JSON.stringify(audit)).not.toMatch(/synthetic-new-password|password_digest|encrypted_password/);
});
it('deletes the account through Auth while preserving shared content, reviews and the admin audit',async()=>{
 await pg.query("update supportos_ai_guidance set updated_by=$1 where id='main'",[foreign]);
 await pg.query("insert into supportos_content_revisions(id,updated_by) values('fixture',$1)",[foreign]);
 await pg.query("insert into supportos_ai_feedback_reviews(id,comment,answer_ref,actor_id) values('fixture','Feedback','hash',$1)",[foreign]);
 const payload={id:foreign,version:1};
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.delete',payload,confirmed:true})).statusCode).toBe(200);
 expect(accountCalls).toEqual([{subject:foreign,method:'DELETE'}]);
 expect((await pg.query('select id from supportos_users where id=$1',[foreign])).rows).toHaveLength(0);
 expect((await call(accounts,'/api/accounts?action=me',tokens.foreign)).statusCode).toBe(401);
 expect((await pg.query("select updated_by from supportos_ai_guidance where id='main'")).rows[0].updated_by).toBeNull();
 expect((await pg.query("select updated_by from supportos_content_revisions where id='fixture'")).rows[0].updated_by).toBeNull();
 expect((await pg.query("select actor_id from supportos_ai_feedback_reviews where id='fixture'")).rows[0].actor_id).toBeNull();
 expect((await pg.query("select actor_id,before_data from supportos_access_audit where action='user.delete'")).rows[0]).toMatchObject({actor_id:actor,before_data:{email:'foreign@example.test'}});
});
it.each(['user.password','user.delete','user.mfa.reset','user.sessions.revoke'])('protects own/Creator/higher-privilege accounts for %s',async(action)=>{
 const payload={id:actor,version:1,password:'synthetic-new-password'};
 expect((await call(accounts,'/api/accounts',tokens.current,{action,payload,confirmed:true})).statusCode).toBe(400);
 await pg.query("insert into supportos_user_roles(user_id,role_id) values($1,'creator')",[foreign]);
 expect((await call(accounts,'/api/accounts',tokens.current,{action,payload:{...payload,id:foreign},confirmed:true})).statusCode).toBe(403);
 await pg.query("delete from supportos_user_roles where user_id=$1 and role_id='creator'",[foreign]);
 await pg.query("insert into supportos_role_permissions(role_id,permission_id) values('support','technical') on conflict do nothing");
 expect((await call(accounts,'/api/accounts',tokens.current,{action,payload:{...payload,id:foreign},confirmed:true})).statusCode).toBe(403);
 expect(accountCalls).toHaveLength(0);
});
it('rejects stale employee versions without recording an operation or revoking sessions',async()=>{
 const payload={id:foreign,version:999};
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.delete',payload,confirmed:true})).statusCode).toBe(409);
 expect(await sessionIds()).toEqual(expectedSessions);expect(accountCalls).toEqual([]);
 expect((await pg.query("select id from supportos_telegram_critical_requests where action='user.delete'")).rows).toHaveLength(0);
});
it('does not report success or completion when Auth rejects a password update',async()=>{
 const payload={id:foreign,version:1,password:'synthetic-new-password'};authMode='error';
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.password',payload,confirmed:true})).statusCode).toBe(502);
 expect((await pg.query("select id from supportos_access_audit where action='user.password'")).rows).toHaveLength(0);
 expect((await pg.query('select encrypted_password from auth.users where id=$1',[foreign])).rows[0].encrypted_password).toBe('synthetic-hash');
});
it('denies direct client access to the account session bridge and completion RPC',async()=>{
 await pg.exec('set local role authenticated;savepoint forbidden_function');
 await expect(pg.query('select supportos_private.revoke_account_sessions($1,$2,$3,$4)',[actor,current,foreign,randomUUID()])).rejects.toThrow('permission denied');
 await pg.exec('rollback to savepoint forbidden_function');
 await expect(pg.query('select public.supportos_account_action_completed($1,$2,$3)',[actor,current,randomUUID()])).rejects.toThrow('permission denied');
 await pg.exec('rollback to savepoint forbidden_function;reset role');
});
it('also closes employee sessions created during the external password update',async()=>{
 const payload={id:foreign,version:1,password:'synthetic-new-password'};authMode='concurrent-session';
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.password',payload,confirmed:true})).statusCode).toBe(200);
 expect((await pg.query('select id from auth.sessions where user_id=$1',[foreign])).rows).toHaveLength(0);
});
it.each(['user.password','user.delete'])('allows %s for a live administrator who has not enabled MFA',async(action)=>{
 await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);
 await pg.query("update auth.sessions set aal='aal1' where user_id=$1",[actor]);
 const token=jwt(actor,current,verifiedAt-600,'aal1');
 expect((await call(accounts,'/api/accounts',token,{action,confirmed:true,payload:{id:foreign,version:1,password:'synthetic-new-password'}})).statusCode).toBe(200);
 expect(accountCalls).toHaveLength(1);
});
it.each([false,true])('creates an employee without another TOTP, including an unenrolled administrator (%s)',async(unenrolled)=>{
 if(unenrolled){await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);await pg.query("update auth.sessions set aal='aal1' where user_id=$1",[actor]);}
 const token=jwt(actor,current,verifiedAt-600,unenrolled?'aal1':'aal2');
 const body={action:'create',confirmed:true,email:'created@example.test',password:'synthetic-new-password',display_name:'Created',roles:['support']};
 const result=await call(accounts,'/api/accounts',token,body);
 expect(result.statusCode).toBe(201);expect(result.body.warning).toBeUndefined();expect(accountCalls).toHaveLength(1);
 expect((await pg.query('select status,display_name from supportos_users where id=$1',[result.body.id])).rows[0]).toEqual({status:'active',display_name:'Created'});
 expect((await pg.query('select role_id from supportos_user_roles where user_id=$1',[result.body.id])).rows).toEqual([{role_id:'support'}]);
 const audit=(await pg.query("select * from supportos_access_audit where action='user.create' and target_id=$1",[result.body.id])).rows;
 expect(audit).toHaveLength(1);expect(audit[0].actor_id).toBe(actor);expect(JSON.stringify(audit)).not.toContain('synthetic-new-password');
});
it.each([false,true])('changes employee roles/status after ordinary confirmation, including unenrolled admin (%s)',async(unenrolled)=>{
 if(unenrolled){await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);await pg.query("update auth.sessions set aal='aal1' where user_id=$1",[actor]);}
 const token=jwt(actor,current,verifiedAt-600,unenrolled?'aal1':'aal2');
 const payload={id:foreign,version:1,status:'active',roles:['qc'],display_name:'Employee'};
 expect((await call(accounts,'/api/accounts',token,{action:'user.update',payload})).statusCode).toBe(400);
 const result=await call(accounts,'/api/accounts',token,{action:'user.update',confirmed:true,payload});
 expect(result.statusCode).toBe(200);expect(result.body.permissions).toContain('monitor.read');expect(result.body.version).toBe(2);
 expect((await call(accounts,'/api/accounts',token,{action:'user.update',confirmed:true,payload:{...payload,status:'disabled',version:2}})).statusCode).toBe(200);
 expect((await call(binds,'/api/binds?action=shared',tokens.foreign)).statusCode).toBe(403);
 expect((await pg.query("select actor_id from supportos_access_audit where action='user.update' and target_id=$1",[foreign])).rows).toEqual([{actor_id:actor},{actor_id:actor}]);
});
it.each([false,true])('edits role permissions through ordinary confirmation, including unenrolled admin (%s)',async(unenrolled)=>{
 if(unenrolled){await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);await pg.query("update auth.sessions set aal='aal1' where user_id=$1",[actor]);}
 const token=jwt(actor,current,verifiedAt-600,unenrolled?'aal1':'aal2');
 const payload={id:'fixture_role',version:0,name:'Fixture',description:'',permissions:['work']};
 expect((await call(accounts,'/api/accounts',token,{action:'role.save',confirmed:true,payload})).statusCode).toBe(200);
 expect((await call(accounts,'/api/accounts',token,{action:'role.save',confirmed:true,payload:{...payload,version:1,permissions:['work','monitor.read']}})).statusCode).toBe(200);
 expect((await pg.query("select permission_id from supportos_role_permissions where role_id='fixture_role' order by permission_id")).rows).toEqual([{permission_id:'monitor.read'},{permission_id:'work'}]);
 expect((await call(accounts,'/api/accounts',token,{action:'role.delete',confirmed:true,payload:{id:'fixture_role',version:2}})).statusCode).toBe(200);
 expect((await pg.query("select id from supportos_roles where id='fixture_role'")).rows).toHaveLength(0);
});
it('preserves account and role privilege guards without a separate TOTP challenge',async()=>{
 const payload={id:actor,version:1,status:'disabled',roles:['support'],display_name:''};
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.update',confirmed:true,payload})).statusCode).toBe(400);
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'role.delete',confirmed:true,payload:{id:'creator',version:1}})).statusCode).toBe(400);
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.update',confirmed:true,payload:{...payload,id:foreign,roles:['creator']}})).statusCode).toBe(403);
});
it.each([false,true])('resets all employee MFA factors and sessions after ordinary confirmation (unenrolled admin: %s)',async(unenrolled)=>{
 if(unenrolled){await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);await pg.query("update auth.sessions set aal='aal1' where user_id=$1",[actor]);}
 const token=jwt(actor,current,verifiedAt-600,unenrolled?'aal1':'aal2');
 await pg.query("insert into auth.mfa_factors values($1,$2,'totp','unverified')",[randomUUID(),foreign]);
 const payload={id:foreign,version:1};
 expect((await call(accounts,'/api/accounts',token,{action:'user.mfa.reset',payload})).statusCode).toBe(400);
 expect(accountCalls).toHaveLength(0);expect(await sessionIds()).toEqual(expectedSessions);
 const result=await call(accounts,'/api/accounts',token,{action:'user.mfa.reset',payload,confirmed:true,actor:foreign});
 expect(result.statusCode).toBe(200);
 expect(accountCalls.filter(row=>row.method==='DELETE')).toHaveLength(2);
 expect(accountCalls.every(row=>row.subject===foreign)).toBe(true);
 expect((await pg.query('select id from auth.mfa_factors where user_id=$1',[foreign])).rows).toHaveLength(0);
 expect((await call(accounts,'/api/accounts?action=me',tokens.foreign)).statusCode).toBe(401);
 expect((await call(accounts,'/api/accounts?action=me',token)).statusCode).toBe(200);
 const audit=(await pg.query("select * from supportos_access_audit where action='user.mfa.reset'")).rows;
 expect(audit).toHaveLength(1);expect(audit[0]).toMatchObject({actor_id:actor,target_id:foreign,before_data:{mfa_enabled:true,mfa_factors:2,sessions:1},after_data:{mfa_enabled:false,mfa_factors:0,sessions:0,sessions_revoked:true}});
 expect((await call(accounts,'/api/accounts',token,{action:'user.mfa.reset',payload,confirmed:true})).statusCode).toBe(409);
 // The reset account can sign in again without inheriting any of its old JWTs.
 const freshSid=randomUUID();await pg.query("insert into auth.sessions(id,user_id,aal) values($1,$2,'aal1')",[freshSid,foreign]);
 expect((await call(accounts,'/api/accounts?action=me',jwt(foreign,freshSid,verifiedAt,'aal1'))).statusCode).toBe(200);
});
it.each([false,true])('revokes only the selected employee sessions while preserving password/MFA (unenrolled admin: %s)',async(unenrolled)=>{
 if(unenrolled){await pg.query('delete from auth.mfa_factors where user_id=$1',[actor]);await pg.query("update auth.sessions set aal='aal1' where user_id=$1",[actor]);}
 const token=jwt(actor,current,verifiedAt-600,unenrolled?'aal1':'aal2');
 const extra=randomUUID();await pg.query('insert into auth.sessions(id,user_id) values($1,$2)',[extra,foreign]);
 const payload={id:foreign,version:1};
 expect((await call(accounts,'/api/accounts',token,{action:'user.sessions.revoke',payload})).statusCode).toBe(400);
 expect((await call(accounts,'/api/accounts',token,{action:'user.sessions.revoke',payload,confirmed:true})).statusCode).toBe(200);
 expect(accountCalls).toHaveLength(0);expect(logoutCalls).toHaveLength(0);
 expect((await pg.query('select id from auth.sessions where user_id=$1',[foreign])).rows).toHaveLength(0);
 expect((await call(accounts,'/api/accounts?action=me',tokens.foreign)).statusCode).toBe(401);
 expect((await call(accounts,'/api/accounts?action=me',token)).statusCode).toBe(200);
 expect((await pg.query('select encrypted_password from auth.users where id=$1',[foreign])).rows[0].encrypted_password).toBe('synthetic-hash');
 expect((await pg.query('select id from auth.mfa_factors where user_id=$1',[foreign])).rows).toHaveLength(1);
 expect((await pg.query("select after_data from supportos_access_audit where action='user.sessions.revoke'")).rows[0].after_data).toMatchObject({sessions:0,mfa_enabled:true,sessions_revoked:true});
});
it.each(['user.mfa.reset','user.sessions.revoke'])('rejects stale versions and missing permission without touching %s',async(action)=>{
 expect((await call(accounts,'/api/accounts',tokens.current,{action,confirmed:true,payload:{id:foreign,version:999}})).statusCode).toBe(409);
 expect(await sessionIds()).toEqual(expectedSessions);expect(accountCalls).toHaveLength(0);
 await pg.query("delete from supportos_role_permissions where role_id='admin' and permission_id='users.manage'");
 expect((await call(accounts,'/api/accounts',tokens.current,{action,confirmed:true,payload:{id:foreign,version:1}})).statusCode).toBe(403);
 expect(await sessionIds()).toEqual(expectedSessions);expect(accountCalls).toHaveLength(0);
});
it.each(['mfa-list-error','mfa-delete-error','mfa-no-op','mfa-concurrent-factor'])('never reports a completed reset after %s',async(mode)=>{
 authMode=mode;
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.mfa.reset',confirmed:true,payload:{id:foreign,version:1}})).statusCode).toBe(502);
 expect((await pg.query("select id from supportos_access_audit where action='user.mfa.reset'")).rows).toHaveLength(0);
 expect((await call(accounts,'/api/accounts?action=me',tokens.foreign)).statusCode).toBe(401);
});
it('revokes sessions created while Auth removes the MFA factors',async()=>{
 authMode='mfa-concurrent-session';
 expect((await call(accounts,'/api/accounts',tokens.current,{action:'user.mfa.reset',confirmed:true,payload:{id:foreign,version:1}})).statusCode).toBe(200);
 expect((await pg.query('select id from auth.sessions where user_id=$1',[foreign])).rows).toHaveLength(0);
});
it('blocks direct client access to the MFA snapshot helper',async()=>{
 await pg.exec('set local role authenticated;savepoint forbidden_snapshot');
 await expect(pg.query('select supportos_private.account_security_snapshot($1,$2,$3,$4)',[actor,current,foreign,randomUUID()])).rejects.toThrow('permission denied');
 await pg.exec('rollback to savepoint forbidden_snapshot;reset role');
});
