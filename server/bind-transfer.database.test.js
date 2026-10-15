import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('persists atomic placement and ordering, preserves text and enforces ownership on shared and personal transfers',async()=>{
 const pg=new PGlite();const actor='11111111-1111-4111-8111-111111111111',reader='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333',readerSid='44444444-4444-4444-8444-444444444444';
 try {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  for(const [id,role] of [[actor,'admin'],[reader,'support']])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,role+'@example.test',{role}]);
  await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await pg.exec(`create function public.supportos_mfa_session_state(subject uuid,sid uuid) returns jsonb language sql as $$select jsonb_build_object('status',case when exists(select 1 from auth.sessions s where s.id=sid and s.user_id=subject) then 'approved' else 'invalid_session' end)$$;`);
  await pg.query('insert into auth.sessions values($1,$2),($3,$4)',[sid,actor,readerSid,reader]);
  for(const file of ['20261014162453_shared_library_editor.sql','20261014164837_shared_library_remove_containers.sql','20261015054816_bind_tree_order.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await pg.exec(`insert into supportos_categories(id,name) values('cat','Раздел');insert into supportos_folders(id,category_id,name) values('old','cat','Старая'),('new','cat','Новая');insert into supportos_binds(id,slug,category_id,folder_id,translations,tags) values('a','a','cat','old','[{"language":"ru","title":"A","content":"Исходный текст"}]','["tag"]'),('b','b','cat','old','[]','[]'),('c','c','cat','new','[]','[]');`);
  await pg.query("insert into supportos_categories(id,owner_id,name) values('private',$1,'Личное');",[reader]);
  await pg.query("insert into supportos_binds(id,owner_id,slug,category_id,translations) values('foreign',$1,'foreign','private','[]')",[reader]);
  const move=async(payload,user=actor,session=sid)=>(await pg.query('select public.supportos_bind_transfer($1,$2,$3) value',[user,session,payload])).rows[0].value;
  const source=(id,folderId)=>({id,categoryId:'cat',folderId});
  const request={sources:[source('a','old'),source('b','old')],categoryId:'cat',folderId:'new',beforeId:'c'};
  await expect(move(request,actor,readerSid)).rejects.toThrow('Нет доступа');
  await expect(move({...request,sources:[source('a','old'),{id:'foreign',categoryId:'private'}]})).rejects.toThrow('чужие бинды');
  expect((await pg.query("select folder_id from supportos_binds where id='a'")).rows[0].folder_id).toBe('old');
  const saved=await move(request);
  expect(saved.binds.map(b=>b.id)).toEqual(['a','b','c']);
  expect(saved.binds[0]).toMatchObject({folder_id:'new',order_index:1,translations:[{language:'ru',title:'A',content:'Исходный текст'}],tags:['tag']});
  expect((await pg.query("select id from supportos_binds where folder_id='new' order by order_index")).rows.map(b=>b.id)).toEqual(['a','b','c']);
  await expect(move(request)).rejects.toThrow('уже перемещён');
  expect((await move({sources:[source('c','new')],categoryId:'cat',folderId:'new',beforeId:'a'})).binds.map(b=>b.id)).toEqual(['c','a','b']);
  const before=(await pg.query("select * from supportos_binds where id='a'")).rows[0];
  const personal=await move({sources:[source('a','new')],categoryId:'private'},reader,readerSid);
  expect(personal.replacements.a).toBeTruthy();
  expect(personal.binds.find(b=>b.id===personal.replacements.a)).toMatchObject({owner_id:reader,source_bind_id:'a',category_id:'private',translations:before.translations});
  expect((await pg.query("select * from supportos_binds where id='a'")).rows[0]).toEqual(before);
  await expect(move({sources:[source('b','new')],categoryId:'private'})).rejects.toThrow('Раздел назначения недоступен');
  expect((await pg.query("select has_function_privilege('authenticated','public.supportos_bind_transfer(uuid,uuid,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);
  expect((await pg.query("select has_function_privilege('anon','public.supportos_bind_transfer(uuid,uuid,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);
 } finally {await pg.close();}
},30000);

