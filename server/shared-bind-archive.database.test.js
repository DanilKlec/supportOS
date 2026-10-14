import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('archives and restores only the current shared revision, preserving personal versions and enforcing database authorization',async()=>{
 const pg=new PGlite();
 const actor='11111111-1111-4111-8111-111111111111',reader='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333';
 try{
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
   create table auth.sessions(id uuid primary key,user_id uuid);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;`);
  for(const [id,role] of [[actor,'admin'],[reader,'support']])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${role}@example.test`,{role}]);
  await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await pg.exec(`create function public.supportos_mfa_session_state(subject uuid,sid uuid) returns jsonb language sql as $$select jsonb_build_object('status',case when exists(select 1 from auth.sessions s where s.id=sid and s.user_id=subject) then 'approved' else 'invalid_session' end)$$;`);
  await pg.query('insert into auth.sessions values($1,$2)',[sid,actor]);
  await pg.exec(await readFile(new URL('../supabase/migrations/20261014202340_shared_bind_archive.sql',import.meta.url),'utf8'));
  await pg.exec(`insert into supportos_categories(id,name) values('cat','Общее');
   insert into supportos_binds(id,slug,category_id,translations,tags,updated_at) values('shared','shared','cat','[{"language":"ru","title":"Ответ","content":"Текст"},{"language":"en","title":"Answer","content":"Text"}]','["tag"]','2026-10-14');`);
  await pg.query("insert into supportos_binds(id,slug,owner_id,source_bind_id,category_id,translations) values('personal','personal',$1,'shared','cat','[]')",[reader]);
  const personal=(await pg.query("select * from supportos_binds where id='personal'")).rows[0];
  const change=async(expected,archived,user=actor,session=sid,id='shared')=>(await pg.query('select public.supportos_shared_bind_archive($1,$2,$3,$4,$5) value',[user,session,id,expected,archived])).rows[0].value;
  await expect(change('2026-10-14',true,reader)).rejects.toThrow('Нет права');
  await expect(change('2026-10-14',true,actor,reader)).rejects.toThrow('Нет права');
  await expect(change('2026-10-14',true,actor,sid,'personal')).rejects.toThrow('Личный бинд');
  await expect(change('2026-10-13',true)).rejects.toThrow('изменён другим');
  const removed=await change('2026-10-14',true);
  expect(removed).toMatchObject({id:'shared',owner_id:null,archived:true,tags:['tag'],translations:[{language:'ru',title:'Ответ',content:'Текст'},{language:'en',title:'Answer',content:'Text'}]});
  await expect(change('2026-10-14',false)).rejects.toThrow('изменён другим');
  const restored=await change(removed.updated_at,false);
  expect(restored).toMatchObject({id:'shared',archived:false,translations:removed.translations});
  expect((await pg.query("select * from supportos_binds where id='personal'")).rows[0]).toEqual(personal);
  expect((await pg.query("select action from supportos_access_audit where target_id='shared' order by id")).rows.map(r=>r.action)).toEqual(['library.bind.archive','library.bind.restore']);
  expect((await pg.query("select has_function_privilege('authenticated','public.supportos_shared_bind_archive(uuid,uuid,text,timestamptz,boolean)','execute') allowed")).rows[0].allowed).toBe(false);
  expect((await pg.query("select has_function_privilege('anon','public.supportos_shared_bind_archive(uuid,uuid,text,timestamptz,boolean)','execute') allowed")).rows[0].allowed).toBe(false);
 }finally{await pg.close();}
},30000);

