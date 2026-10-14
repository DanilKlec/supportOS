import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

const pg=new PGlite(),actor=randomUUID(),target=randomUUID(),sid=randomUUID(),targetSid=randomUUID();
const hash=value=>createHash('sha256').update(value).digest('hex');
const rpc=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
const audit=async()=> (await pg.query('select * from supportos_access_audit order by id')).rows;
async function confirmed(action,data={}) {
 const id=randomUUID(),callback=hash(id),permit=hash('permit:'+id);
 expect(await rpc('supportos_critical_begin',[actor,sid,action,data,id,callback,permit,null,'Synthetic Chrome/130'])).toMatchObject({status:'pending'});
 expect(await rpc('supportos_critical_decide',[callback,333,'approved'])).toEqual({status:'approved'});
 return {id,execute:()=>rpc('supportos_critical_execute',[actor,sid,action,data,id,permit])};
}
beforeAll(async()=>{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant usage on schema auth to authenticated;`);
 await pg.query("insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,'admin@example.test','synthetic-old-hash',$3),($2,'user@example.test','synthetic-old-hash',$4)",[actor,target,{role:'admin'},{role:'support'}]);
 for(const path of ['supabase/schema.sql','supabase/migrations/20260913013915_admin_ai_runtime.sql',
  'supabase/migrations/20260923081810_telegram_registration.sql','supabase/migrations/20260923192252_telegram_login_2fa.sql',
  'supabase/migrations/20260923194400_telegram_password_confirmation.sql','supabase/migrations/20261007191041_login_security_history.sql',
  'supabase/migrations/20261007194247_telegram_critical_confirmation.sql','supabase/migrations/20261007203642_critical_security_access_audit.sql',
  'supabase/migrations/20261007204222_audit_registration_claim_completion.sql'])
  await pg.exec(await readFile(new URL('../'+path,import.meta.url),'utf8'));
 await pg.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[sid,actor,targetSid,target]);
 await pg.query("insert into supportos_telegram_links(user_id,telegram_id,source) values($1,333,'registration'),($2,444,'registration')",[actor,target]);
 await rpc('supportos_tg_login_begin',[actor,sid,randomUUID(),hash('login'),'Synthetic',null,false]);
 await rpc('supportos_tg_login_decide',[hash('login'),333,'approved']);
},20000);
beforeEach(async()=>{await pg.exec('begin;set role service_role');});
afterEach(async()=>{await pg.exec('rollback;reset role');});
afterAll(async()=>{await pg.close();});

it('audits account disable and effective rights without copying free text or credentials',async()=>{
 const proof=await confirmed('user.update',{id:target,status:'disabled',roles:['support'],version:1,
  display_name:'synthetic-pasted-secret',password:'synthetic-password',access_token:'synthetic-token'});
 expect(await proof.execute()).toMatchObject({status:'disabled'});
 expect(await proof.execute()).toEqual({error:'processed'});
 const rows=await audit();expect(rows).toHaveLength(1);
 expect(rows[0]).toMatchObject({actor_id:actor,actor_label:'admin@example.test',target_id:target,action:'user.update',
  before_data:{status:'active',version:1,roles:['support']},after_data:{status:'disabled',version:2,permissions:[],display_name_changed:true}});
 expect(rows[0].created_at).toBeTruthy();expect(JSON.stringify(rows)).not.toMatch(/synthetic-|display_name"|password|access_token/);
});
it('audits role creation/update/delete with permission snapshots and no secret-bearing descriptions',async()=>{
 const data={id:'custom_role',name:'Custom',description:'synthetic-api-key',version:0,permissions:['work']};
 await rpc('supportos_rbac_change',[actor,'role.save',data]);
 await rpc('supportos_rbac_change',[actor,'role.save',{...data,version:1,permissions:['work','binds.read']}]);
 await rpc('supportos_rbac_change',[actor,'role.delete',{id:data.id,version:2}]);
 const rows=await audit();expect(rows.map(r=>r.action)).toEqual(['role.save','role.save','role.delete']);
 expect(rows[0].before_data).toBeNull();expect(rows[0].after_data).toMatchObject({id:data.id,version:1,permissions:['work']});
 expect(rows[1].before_data.permissions).toEqual(['work']);expect(rows[1].after_data.permissions).toEqual(['binds.read','work']);
 expect(rows[2].before_data.version).toBe(2);expect(rows[2].after_data).toBeNull();
 expect(JSON.stringify(rows)).not.toMatch(/synthetic-api-key|"description"|"name"/);
});
it('rolls the mutation and permit consumption back when audit writing fails',async()=>{
 const proof=await confirmed('user.update',{id:target,status:'disabled',roles:['support'],version:1,display_name:''});
 await pg.exec(`reset role;create function public.fixture_audit_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic audit unavailable';end$$;
  create trigger fixture_fail before insert on supportos_access_audit for each row execute function public.fixture_audit_failure();set role service_role;savepoint mutation;`);
 await expect(proof.execute()).rejects.toThrow('synthetic audit unavailable');await pg.exec('rollback to savepoint mutation');
 expect(await rpc('supportos_rbac_context',[target])).toMatchObject({status:'active',version:1});
 expect((await pg.query('select status from supportos_telegram_critical_requests where id=$1',[proof.id])).rows[0].status).toBe('approved');
 expect(await audit()).toHaveLength(0);
});
it('creates one account audit in the Auth transaction, independently of later role assignment',async()=>{
 const proof=await confirmed('user.create',{email:'created@example.test',password:'synthetic-password',roles:['support']});
 expect(await proof.execute()).toEqual({ok:true});expect(await audit()).toHaveLength(0);
 const id=randomUUID();await pg.exec('reset role');
 await pg.query("insert into auth.users(id,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values($1,'created@example.test','synthetic-password-hash',$2,$3)",
  [id,{supportos_creation_request:proof.id,secret:'synthetic-secret'},{actor:'forged',password:'synthetic-password'}]);
 await pg.exec('set role service_role');
 expect((await audit())[0]).toMatchObject({actor_id:actor,target_id:id,action:'user.create',before_data:null,after_data:{id,status:'pending',version:1}});
 expect((await pg.query('select status from supportos_telegram_critical_requests where id=$1',[proof.id])).rows[0].status).toBe('completed');
 expect(JSON.stringify(await audit())).not.toMatch(/synthetic-|password|secret|raw_.*meta|forged/);
 await pg.exec('reset role');await pg.query("update auth.users set email='renamed@example.test' where id=$1",[id]);
 expect(await audit()).toHaveLength(1);
});
it('rejects an invalid creation reference without committing an account or audit row',async()=>{
 const id=randomUUID();await pg.exec('reset role;savepoint creation');
 await expect(pg.query("insert into auth.users(id,email,raw_app_meta_data) values($1,'fake@example.test',$2)",[id,{supportos_creation_request:randomUUID()}])).rejects.toThrow('Missing account creation audit context');
 await pg.exec('rollback to savepoint creation');
 expect((await pg.query('select id from auth.users where id=$1',[id])).rows).toHaveLength(0);expect(await audit()).toHaveLength(0);
});
it.each([false,true])('audits a claimed Telegram registration, including Auth finishing after expiry (%s)',async(expired)=>{
 // A legitimate UUID may contain the Telegram fixture digits without leaking its ID.
 const id='00000777-0000-4000-8000-000000000007';
 await pg.query("insert into supportos_telegram_registration(id,login,browser_hash,start_hash,ip_hash,telegram_id,verified_at,claimed_at,expires_at) values($1,'registered',$2,$3,$4,777,now(),now(),now()+$5::interval)",
  [id,hash(id),hash('start:'+id),hash('synthetic-ip'),expired?'-1 second':'5 minutes']);
 await pg.exec('reset role');await pg.query("insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values($1,'registered@supportos.local','synthetic-password-hash',$2)",[id,{telegram_registration:id,telegram_id:'777'}]);
 expect(await audit()).toHaveLength(1);expect((await audit())[0]).toMatchObject({actor_id:id,target_id:id,action:'user.create',
  before_data:null,after_data:{id,status:'pending'},event_ref:'registration:'+id});
 expect(JSON.stringify(await audit())).not.toMatch(/synthetic-|[":]777[",}]|telegram_id|password_hash|browser_hash|start_hash/);
});
it('does not let server registration metadata bypass a missing verified claim',async()=>{
 const id=randomUUID();await pg.exec('reset role;savepoint unclaimed');
 await expect(pg.query("insert into auth.users(id,email,raw_app_meta_data) values($1,'unclaimed@supportos.local',$2)",[id,{telegram_registration:id}])).rejects.toThrow('Missing registration creation audit context');
 await pg.exec('rollback to savepoint unclaimed');expect(await audit()).toHaveLength(0);
 expect((await pg.query('select id from auth.users where id=$1',[id])).rows).toHaveLength(0);
});
it.each(['telegram.unlink','telegram.change'])('enriches %s with safe before/after and no duplicate event',async(action)=>{
 const proof=await confirmed(action);expect(await proof.execute()).toEqual({ok:true});expect(await proof.execute()).toEqual({error:'processed'});
 expect(await audit()).toHaveLength(1);expect((await audit())[0]).toMatchObject({actor_id:actor,target_id:actor,action,
  before_data:{linked:true},after_data:{linked:false},event_ref:'critical:'+proof.id});
});
it.each([true,false])('audits Telegram link administrator review (%s) without challenge credentials',async(approve)=>{
 await pg.query('delete from supportos_telegram_links where user_id=$1',[target]);
 const id=randomUUID();await rpc('supportos_tg_link_begin',[target,targetSid,id,hash(id)]);
 await rpc('supportos_tg_link_verify',[hash(id),555,'synthetic-secret-username']);
 expect(await rpc('supportos_tg_link_review',[actor,sid,id,approve])).toBe(true);
 const rows=await audit();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({actor_id:actor,target_id:target,
  action:approve?'telegram.link.approve':'telegram.link.reject',before_data:{linked:false,request_status:'verified'},
  after_data:{linked:approve,request_status:approve?'approved':'rejected'}});
 expect(JSON.stringify(rows)).not.toContain('synthetic-secret-username');expect(JSON.stringify(rows)).not.toContain(hash(id));
});
it.each(['change','recovery'])('audits successful password %s and revocation together, without password/hash/token',async(mode)=>{
 const id=randomUUID(),permit='synthetic-one-time-password-permit';
 await rpc('supportos_password_begin',[id,mode==='change'?actor:null,mode==='change'?sid:null,mode==='recovery'?'admin@example.test':'',hash(actor),null,hash('browser'),hash('challenge'),'Synthetic']);
 expect(await rpc('supportos_password_decide',[hash('challenge'),333,true])).toBe(true);
 expect(await rpc('supportos_password_claim',[hash('browser'),hash(permit)])).toEqual({userId:actor});expect(await audit()).toHaveLength(0);
 await pg.exec('reset role');
 await pg.query("update auth.users set encrypted_password='synthetic-new-hash',raw_app_meta_data=jsonb_build_object('supportos_password_permit',$2::text) where id=$1",[actor,permit]);
 await pg.exec('set constraints all immediate');
 const rows=await audit();expect(rows.map(r=>r.action).sort()).toEqual(['password.'+mode,'sessions.revoke_all'].sort());
 expect(rows.every(r=>r.actor_id===actor&&r.target_id===actor&&r.created_at)).toBe(true);
 expect(rows.find(r=>r.action==='sessions.revoke_all')).toMatchObject({before_data:{active_sessions:1},after_data:{active_sessions:0}});
 expect((await pg.query('select id from auth.sessions where user_id=$1',[actor])).rows).toHaveLength(0);
 expect(JSON.stringify(rows)).not.toMatch(/synthetic-|encrypted_password|permit_hash|browser_hash|challenge_hash|access_token|refresh_token/);
});
it('does not audit an unconfirmed password change and rolls failed Auth changes back',async()=>{
 await pg.exec('reset role;savepoint password_change');
 await pg.query("update auth.users set encrypted_password='synthetic-bypass' where id=$1",[actor]);
 await expect(pg.exec('set constraints all immediate')).rejects.toThrow('Telegram confirmation');
 await pg.exec('rollback to savepoint password_change');expect(await audit()).toHaveLength(0);
 expect((await pg.query('select encrypted_password from auth.users where id=$1',[actor])).rows[0].encrypted_password).toBe('synthetic-old-hash');
});
it('audits confirmed local logout once; live sessions are not success events',async()=>{
 expect(await rpc('supportos_record_session_revoked',[actor,sid,null,'Synthetic'])).toEqual({error:'not_revoked'});expect(await audit()).toHaveLength(0);
 for(let i=0;i<2;i++)expect(await rpc('supportos_request_logout_audit',[actor,sid])).toEqual({ok:true});
 expect(await audit()).toHaveLength(1);expect((await audit())[0]).toMatchObject({action:'session.logout.requested',after_data:{phase:'auth_pending'}});
 await pg.exec('reset role');await pg.query('delete from auth.sessions where id=$1',[sid]);await pg.exec('set role service_role');
 for(let i=0;i<2;i++)expect(await rpc('supportos_record_session_revoked',[actor,sid,null,'Synthetic'])).toEqual({ok:true});
 expect(await audit()).toHaveLength(2);expect((await audit())[1]).toMatchObject({action:'session.logout',actor_id:actor,target_id:actor,
  before_data:{session_id:sid},after_data:{session_id:sid,active:false}});
});
it('keeps AI audit metadata-only and preserves its optimistic conflict behavior',async()=>{
 const document={entries:[],feedback:[],global:'synthetic-hidden-instruction',_change:{id:'main',kind:'rules'}};
 expect(await rpc('supportos_save_ai_runtime',[actor,1,'instructions',document])).toEqual({ok:true});
 const rows=await audit();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({actor_id:actor,action:'ai.instructions',target_id:'main',before_data:{version:1},after_data:{version:2,kind:'rules'}});
 expect(JSON.stringify(rows)).not.toContain('synthetic-hidden-instruction');
 await pg.exec('savepoint conflict');await expect(rpc('supportos_save_ai_runtime',[actor,1,'instructions',document])).rejects.toThrow('AI-документ изменён');
 await pg.exec('rollback to savepoint conflict');expect(await audit()).toHaveLength(1);
});
it('is append-only, browser-inaccessible, and keeps narrow private readers private',async()=>{
 await rpc('supportos_rbac_change',[actor,'role.save',{id:'audit_test',name:'Audit',permissions:['work'],version:0}]);
 for(const role of ['anon','authenticated','service_role']){
  await pg.exec('reset role;set role '+role);
  for(const sql of ['update supportos_access_audit set actor_label=\'forged\'','delete from supportos_access_audit','truncate supportos_access_audit']){
   await pg.exec('savepoint forbidden');await expect(pg.exec(sql)).rejects.toThrow('permission denied');await pg.exec('rollback to savepoint forbidden');
  }
  if(role!=='service_role'){
   for(const sql of ['select * from supportos_access_audit',`select supportos_private.audit_session_count('${actor}')`]){
    await pg.exec('savepoint forbidden');await expect(pg.exec(sql)).rejects.toThrow('permission denied');await pg.exec('rollback to savepoint forbidden');
   }
  }
 }
 await pg.exec('reset role');
 for(const sql of ['update supportos_access_audit set actor_label=\'forged\'','delete from supportos_access_audit','truncate supportos_access_audit']){
  await pg.exec('savepoint immutable');await expect(pg.exec(sql)).rejects.toThrow('append-only');await pg.exec('rollback to savepoint immutable');
 }
 expect(await audit()).toHaveLength(1);
});
