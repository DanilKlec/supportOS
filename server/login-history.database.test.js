import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';

it('records committed security events once, isolates history and enforces append-only storage', async () => {
 const pg=new PGlite();
 const user=randomUUID(),other=randomUUID(),admin=randomUUID(),sid=randomUUID(),otherSid=randomUUID(),adminSid=randomUUID();
 const digest=value=>createHash('sha256').update(value).digest('hex');
 try {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   grant usage on schema auth to authenticated;`);
  await pg.query(`insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values
   ($1,'support@example.test','old',$4),($2,'other@example.test','old',$4),($3,'admin@example.test','old',$5)`,[user,other,admin,{role:'support'},{role:'admin'}]);
  for(const path of ['supabase/schema.sql','supabase/migrations/20260923081810_telegram_registration.sql','supabase/migrations/20260923192252_telegram_login_2fa.sql','supabase/migrations/20260923194400_telegram_password_confirmation.sql','supabase/migrations/20261007191041_login_security_history.sql']) {
   await pg.exec(await readFile(new URL('../'+path,import.meta.url),'utf8'));
  }
  await pg.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',[sid,user,otherSid,other,adminSid,admin]);
  await pg.query("insert into supportos_telegram_links(user_id,telegram_id,source) values($1,111,'registration'),($2,222,'registration'),($3,333,'registration')",[user,other,admin]);
  const rpc=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  const rows=async()=> (await pg.query('select * from supportos_login_events order by id')).rows;
  const history=(actor=user,session=sid,target=null,before=null)=>rpc('supportos_login_history',[actor,session,target,before]);
  await pg.exec('set role service_role');
  for(const [u,s,tg,proof,decision] of [[user,sid,111,'a','approved'],[other,otherSid,222,'b','rejected'],[admin,adminSid,333,'c','approved']]) {
   await rpc('supportos_tg_login_begin',[u,s,randomUUID(),proof.repeat(64),'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 synthetic-raw-agent','d'.repeat(64),false]);
   expect(await rpc('supportos_tg_login_decide',[proof.repeat(64),999,decision])).toEqual({error:'invalid'});
   expect(await rpc('supportos_tg_login_decide',[proof.repeat(64),tg,decision])).toEqual({status:decision});
   expect(await rpc('supportos_tg_login_decide',[proof.repeat(64),tg,decision])).toEqual({error:'processed'});
  }
  expect(await rows()).toHaveLength(3);
  expect((await rows())[0]).toMatchObject({user_id:user,session_id:sid,event_type:'login_approved',browser:'Chrome',os:'Windows',telegram_result:'approved',ip_hash:'d'.repeat(64)});
  expect((await rows())[1]).toMatchObject({event_type:'login_rejected',telegram_result:'rejected'});
  expect(JSON.stringify(await rows())).not.toMatch(/raw-agent|refresh_token|access_token|password|192\.0\.2/);
  expect((await history()).events.map(e=>e.user_id)).toEqual([user]);
  expect(await history(user,sid,other)).toEqual({error:'forbidden'});
  expect(await history(other,otherSid)).toEqual({error:'invalid_session'});
  expect((await history(admin,adminSid,other)).events).toHaveLength(1);
  await pg.exec('reset role');
  await pg.query("update supportos_users set status='disabled' where id=$1",[user]);
  await pg.exec('set role service_role');
  expect(await history()).toEqual({error:'forbidden'});
  await pg.exec('reset role');
  await pg.query("update supportos_users set status='active' where id=$1",[user]);
  // Pagination must not leak another user or lose/duplicate rows at a boundary.
  for(let i=0;i<51;i++) await pg.query("insert into supportos_login_events(user_id,event_type,event_ref) values($1,'sessions_revoked',$2)",[user,'fixture:'+i]);
  await pg.exec('set role service_role');
  const first=await history(),second=await history(user,sid,null,first.nextCursor);
  expect(first.events).toHaveLength(50);expect(first.nextCursor).toMatch(/^[0-9]+$/);
  expect(second.events).toHaveLength(2);expect(second.nextCursor).toBeNull();
  expect(new Set([...first.events,...second.events].map(e=>e.id)).size).toBe(52);
  expect([...first.events,...second.events].every(e=>e.user_id===user)).toBe(true);
  expect(await history(user,sid,null,-1)).toEqual({error:'invalid_cursor'});
  // An active session cannot be declared revoked by a client assertion.
  expect(await rpc('supportos_record_session_revoked',[user,sid,null,'Browser'])).toEqual({error:'not_revoked'});
  await pg.exec('reset role');
  await pg.query('delete from auth.sessions where id=$1',[sid]);
  await pg.exec('set role service_role');
  expect(await rpc('supportos_record_session_revoked',[user,sid,null,'Mozilla/5.0 (Android) Chrome/130'])).toEqual({ok:true});
  expect(await rpc('supportos_record_session_revoked',[user,sid,null,'Mozilla/5.0 (Android) Chrome/130'])).toEqual({ok:true});
  expect((await rows()).filter(e=>e.event_ref==='logout:'+sid)).toHaveLength(1);
  expect((await rows()).filter(e=>e.event_type==='login_rejected')).toHaveLength(1); // logout is not a Telegram rejection
  await expect(pg.exec('update supportos_login_events set browser=null')).rejects.toThrow('permission denied');
  await expect(pg.exec('delete from supportos_login_events')).rejects.toThrow('permission denied');
  await expect(pg.exec('truncate supportos_login_events')).rejects.toThrow('permission denied');
  await pg.exec('reset role');
  const count=(await rows()).length;
  for(const sql of ['update supportos_login_events set browser=null','delete from supportos_login_events','truncate supportos_login_events']) await expect(pg.exec(sql)).rejects.toThrow('append-only');
  expect(await rows()).toHaveLength(count);
  for(const role of ['anon','authenticated']) {
   await pg.exec('set role '+role);
   await expect(rows()).rejects.toThrow('permission denied');
   await expect(history()).rejects.toThrow('permission denied');
   await expect(pg.query("insert into supportos_login_events(user_id,event_type,event_ref) values($1,'login_approved','forged')",[user])).rejects.toThrow('permission denied');
   await pg.exec('reset role');
  }
  // Password completion and session revocation commit together with Auth.
  const cancelId=randomUUID(),cancelSid=randomUUID();
  await pg.query("insert into supportos_telegram_login_challenges(id,user_id,session_id,telegram_id,challenge_hash,user_agent) values($1,$2,$3,222,$4,'Firefox/130 Linux synthetic-raw-agent')",[cancelId,other,cancelSid,'e'.repeat(64)]);
  await pg.exec('set role service_role');
  await rpc('supportos_tg_login_cancel',[other,cancelSid]);
  const cancelled=(await rows()).find(e=>e.event_ref==='login:'+cancelId);
  expect(cancelled).toMatchObject({event_type:'login_rejected',telegram_result:'not_confirmed',browser:'Firefox',os:'Linux',ip_hash:null});
  await pg.exec('reset role');
  const request=randomUUID(),proof='synthetic-password-permit';
  await pg.exec('set role service_role');
  await rpc('supportos_password_begin',[request,admin,adminSid,'',digest(admin),null,'browser-digest','challenge-digest','Mozilla/5.0 (iPhone) CriOS/130 Safari/1 synthetic-raw-agent']);
  expect(await rpc('supportos_password_decide',['challenge-digest',333,true])).toBe(true);
  expect(await rpc('supportos_password_claim',['browser-digest',digest(proof)])).toEqual({userId:admin});
  const beforePassword=(await rows()).length;
  await pg.exec('reset role');
  await expect(pg.query("update auth.users set encrypted_password='bypass' where id=$1",[admin])).rejects.toThrow('Telegram confirmation');
  expect(await rows()).toHaveLength(beforePassword);
  await pg.exec('begin');
  await pg.query("update auth.users set encrypted_password='synthetic-new-hash',raw_app_meta_data=jsonb_build_object('supportos_password_permit',$2::text) where id=$1",[admin,proof]);
  await pg.exec('commit');
  const passwordEvents=(await rows()).filter(e=>e.event_ref==='password:'+request);
  expect(passwordEvents.map(e=>e.event_type).sort()).toEqual(['password_changed','sessions_revoked']);
  expect(passwordEvents.every(e=>e.browser==='Chrome'&&e.os==='iOS'&&e.telegram_result==='approved'&&e.ip_hash===null)).toBe(true);
  expect((await pg.query('select id from auth.sessions where user_id=$1',[admin])).rows).toHaveLength(0);
  expect(JSON.stringify(passwordEvents)).not.toMatch(/synthetic-raw-agent|synthetic-password-permit|synthetic-new-hash|browser-digest|challenge-digest/);
 } finally { await pg.close(); }
},30000);
