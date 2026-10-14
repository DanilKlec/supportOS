import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

const pg=new PGlite(),admin=randomUUID(),user=randomUUID(),other=randomUUID(),sid=randomUUID(),userSid=randomUUID(),otherSid=randomUUID();
const rpc=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
const payload=()=>({id:user,roles:['support'],status:'active',display_name:'Employee',version:1});
async function begin(action='user.update',data=payload(),actor=admin,session=sid) {
 const id=randomUUID(),callback=id.replaceAll('-','').repeat(2),permit=randomUUID().replaceAll('-','').repeat(2);
 const result=await rpc('supportos_critical_begin',[actor,session,action,data,id,callback,permit,'a'.repeat(64),'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0']);
 return {id,callback,permit,result,action,data,actor,session};
}
const execute=(c,overrides={})=>rpc('supportos_critical_execute',[overrides.actor??c.actor,overrides.session??c.session,overrides.action??c.action,overrides.data??c.data,c.id,overrides.permit??c.permit]);
const approve=(c,tg=333)=>rpc('supportos_critical_decide',[c.callback,tg,'approved']);
beforeAll(async()=>{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant usage on schema auth to authenticated;`);
 await pg.query(`insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values
  ($1,'admin@example.test','old',$4),($2,'user@example.test','old',$5),($3,'other@example.test','old',$5)`,[admin,user,other,{role:'admin'},{role:'support'}]);
 for(const path of ['supabase/schema.sql','supabase/migrations/20260923081810_telegram_registration.sql','supabase/migrations/20260923192252_telegram_login_2fa.sql','supabase/migrations/20260923194400_telegram_password_confirmation.sql','supabase/migrations/20261007191041_login_security_history.sql','supabase/migrations/20261007194247_telegram_critical_confirmation.sql'])
  await pg.exec(await readFile(new URL('../'+path,import.meta.url),'utf8'));
 await pg.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',[sid,admin,userSid,user,otherSid,other]);
 await pg.query("insert into supportos_telegram_links(user_id,telegram_id,source) values($1,333,'registration'),($2,111,'registration'),($3,222,'registration')",[admin,user,other]);
 for(const [u,s,tg,hash] of [[admin,sid,333,'b'],[user,userSid,111,'c'],[other,otherSid,222,'d']]) {
  await rpc('supportos_tg_login_begin',[u,s,randomUUID(),hash.repeat(64),'synthetic','a'.repeat(64),false]);
  await rpc('supportos_tg_login_decide',[hash.repeat(64),tg,'approved']);
 }
},20000);
beforeEach(async()=>{await pg.exec('begin;set role service_role');});
afterEach(async()=>{await pg.exec('rollback;reset role');});
afterAll(async()=>{await pg.close();});

it('requires approval and binds the one-time permit to actor/session/action/target/exact payload',async()=>{
 const c=await begin();expect(c.result.status).toBe('pending');
 expect(await execute(c)).toEqual({error:'not_approved'});
 expect(await approve(c,999)).toEqual({error:'invalid'});expect(await approve(c)).toEqual({status:'approved'});
 expect(await approve(c)).toEqual({error:'processed'});
 for(const mutation of [{actor:other},{session:otherSid},{action:'role.delete'},{data:{...c.data,id:other}},{data:{...c.data,roles:['admin']}},{data:{...c.data,status:'disabled'}},{permit:'f'.repeat(64)}])
  expect(await execute(c,mutation)).toEqual({error:'invalid'});
 expect(await execute(c)).toMatchObject({status:'active',version:2});
 expect(await execute(c)).toEqual({error:'processed'});
 expect((await pg.query('select status from supportos_telegram_critical_requests where id=$1',[c.id])).rows[0].status).toBe('completed');
 const columns=(await pg.query("select column_name from information_schema.columns where table_name='supportos_telegram_critical_requests'")).rows.map(r=>r.column_name);
 expect(columns).not.toContain('payload');expect(columns).not.toContain('token');expect(columns).not.toContain('ip');
});
it('rejects expired/cancelled confirmations and rechecks session + effective permissions',async()=>{
 const c=await begin();await approve(c);
 await pg.query("update supportos_telegram_critical_requests set expires_at=now()-interval '1 second' where id=$1",[c.id]);
 expect(await execute(c)).toEqual({error:'expired'});
 await pg.query("update supportos_telegram_critical_requests set created_at=now()-interval '20 seconds' where id=$1",[c.id]);
 const cancelled=await begin();await rpc('supportos_critical_state',[admin,sid,cancelled.id,true]);
 expect(await approve(cancelled)).toEqual({error:'processed'});expect(await execute(cancelled)).toEqual({error:'not_approved'});
 await pg.query("update supportos_telegram_critical_requests set created_at=now()-interval '20 seconds'");
 const revoked=await begin();await approve(revoked);
 await pg.exec('reset role');await pg.query("delete from supportos_user_roles where user_id=$1",[admin]);await pg.exec('set role service_role');
 expect(await execute(revoked)).toEqual({error:'expired'});
});
it('a revoked session or changed linked Telegram cannot approve or execute',async()=>{
 const c=await begin();await approve(c);
 await pg.exec('reset role');await pg.query('delete from auth.sessions where id=$1',[sid]);await pg.exec('set role service_role');
 expect(await execute(c)).toEqual({error:'expired'});
});
it('a changed Telegram identity invalidates pending confirmation',async()=>{
 const c=await begin();await pg.query('update supportos_telegram_links set telegram_id=999 where user_id=$1',[admin]);
 expect(await approve(c)).toEqual({error:'expired'});
});
it('preserves optimistic 409/RBAC guards and rolls back permit consumption on transactional failure',async()=>{
 const c=await begin('user.update',{...payload(),version:999});await approve(c);
 await pg.exec('savepoint optimistic');
 await expect(execute(c)).rejects.toThrow('Данные изменились');
 await pg.exec('rollback to savepoint optimistic');
 expect((await pg.query('select status from supportos_telegram_critical_requests where id=$1',[c.id])).rows[0].status).toBe('approved');
 expect((await pg.query('select version from supportos_users where id=$1',[user])).rows[0].version).toBe(1);
});
it('disables an account only after Telegram confirmation',async()=>{
 const c=await begin('user.update',{...payload(),status:'disabled'});await approve(c);
 expect(await execute(c)).toMatchObject({status:'disabled'});
});
it('confirms role permissions with existing RBAC transaction, not a parallel editor',async()=>{
 const c=await begin('role.save',{id:'custom',name:'Custom',description:'',permissions:['work'],version:0});
 await approve(c);expect(await execute(c)).toEqual({ok:true});
 expect((await pg.query("select permission_id from supportos_role_permissions where role_id='custom'")).rows).toEqual([{permission_id:'work'}]);
});
it('claims others-only signout once and records success only after other sessions are absent',async()=>{
 const extra=randomUUID();await pg.exec('reset role');await pg.query('insert into auth.sessions(id,user_id) values($1,$2)',[extra,admin]);await pg.exec('set role service_role');
 const c=await begin('sessions.revoke_others',{});await approve(c);expect(await execute(c)).toEqual({ok:true});expect(await execute(c)).toEqual({error:'processed'});
 expect(await rpc('supportos_critical_sessions_completed',[admin,sid,c.id])).toEqual({error:'not_completed'});
 await pg.exec('reset role');await pg.query('delete from auth.sessions where id=$1',[extra]);await pg.exec('set role service_role');
 expect(await rpc('supportos_critical_sessions_completed',[admin,sid,c.id])).toEqual({ok:true});
 expect(await rpc('supportos_critical_sessions_completed',[admin,sid,c.id])).toEqual({error:'not_completed'});
 expect((await pg.query('select count(*) n from supportos_login_events where event_ref=$1',['critical:'+c.id])).rows[0].n).toBe(1);
 expect((await pg.query('select supportos_private.session_live($1,$2) live',[admin,sid])).rows[0].live).toBe(true);
});
it.each(['telegram.unlink','telegram.change'])('%s cannot resurrect a completed legacy registration and reuses existing link review',async(action)=>{
 await pg.query("insert into supportos_telegram_registration(id,login,browser_hash,start_hash,ip_hash,telegram_id,verified_at,claimed_at,completed_at) values($1,'legacy_admin',$2,$3,$2,333,now(),now(),now())",[admin,'e'.repeat(64),'f'.repeat(64)]);
 // Existing password guards already bind to the linked Telegram; do not rewrite them.
 await rpc('supportos_password_begin',[randomUUID(),admin,sid,'','a'.repeat(64),'a'.repeat(64),'1'.repeat(64),'2'.repeat(64)]);
 expect(await rpc('supportos_password_decide',['2'.repeat(64),333,true])).toBe(true);
 const c=await begin(action,{});await approve(c);expect(await execute(c)).toEqual({ok:true});
 expect((await rpc('supportos_tg_login_state',[admin,sid])).status).toBe('link_required');
 expect((await pg.query('select count(*) n from supportos_telegram_links where user_id=$1',[admin])).rows[0].n).toBe(0);
 expect((await pg.query('select completed_at,telegram_unlinked_at from supportos_telegram_registration where id=$1',[admin])).rows[0]).toMatchObject({completed_at:expect.any(Date),telegram_unlinked_at:expect.any(Date)});
 expect(await rpc('supportos_password_claim',['1'.repeat(64),'3'.repeat(64)])).toEqual({error:'invalid'});
 // The existing admin-reviewed link path is still allowed; no new link verifier.
 await pg.query("insert into supportos_telegram_links(user_id,telegram_id,source) values($1,444,'admin')",[admin]);
 expect((await rpc('supportos_tg_login_state',[admin,sid])).status).toBe('required');
});
it('isolates status by actor/session and blocks browser table/RPC access',async()=>{
 const c=await begin();expect(await rpc('supportos_critical_state',[other,otherSid,c.id,false])).toEqual({error:'invalid'});
 await pg.exec('reset role');
 for(const role of ['anon','authenticated']) {
  expect((await pg.query("select has_table_privilege($1,'public.supportos_telegram_critical_requests','SELECT') allowed",[role])).rows[0].allowed).toBe(false);
  expect((await pg.query("select has_function_privilege($1,'public.supportos_critical_execute(uuid,uuid,text,jsonb,uuid,text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  expect((await pg.query("select has_table_privilege($1,'auth.sessions','SELECT') allowed",[role])).rows[0].allowed).toBe(false);
 }
 expect((await pg.query("select relrowsecurity from pg_class where oid='public.supportos_telegram_critical_requests'::regclass")).rows[0].relrowsecurity).toBe(true);
});
it('rate limits sending and never lets a non-manager request user/role mutations',async()=>{
 expect((await begin('user.update',payload(),user,userSid)).result).toEqual({error:'forbidden'});
 const c=await begin();expect((await begin()).result).toEqual({error:'rate_limit'});
 expect((await rpc('supportos_critical_state',[admin,userSid,c.id,false])).error).toBe('invalid');
});
