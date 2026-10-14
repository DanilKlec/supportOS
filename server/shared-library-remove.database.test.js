import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
const actor='11111111-1111-4111-8111-111111111111',reader='22222222-2222-4222-8222-222222222222',sid='33333333-3333-4333-8333-333333333333';
async function setup(){
 const pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create table auth.sessions(id uuid primary key,user_id uuid);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated;`);
 for(const [id,role] of [[actor,'admin'],[reader,'support']])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${role}@example.test`,{role}]);
 await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await pg.exec(`create function public.supportos_mfa_session_state(subject uuid,sid uuid) returns jsonb language sql as $$select jsonb_build_object('status',case when exists(select 1 from auth.sessions s where s.id=sid and s.user_id=subject) then 'approved' else 'invalid_session' end)$$;`);
 await pg.query('insert into auth.sessions values($1,$2)',[sid,actor]);
 for(const file of ['20261014162453_shared_library_editor.sql','20261014164837_shared_library_remove_containers.sql'])await pg.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const change=async(entity,payload)=>(await pg.query("select public.supportos_shared_tree_change($1,$2,$3,'save',$4) value",[actor,sid,entity,payload])).rows[0].value.row;
 const remove=async(entity,payload,user=actor,session=sid)=>(await pg.query('select public.supportos_shared_tree_remove($1,$2,$3,$4) value',[user,session,entity,payload])).rows[0].value;
 const bind=async(id,category,folder=null,owner=null,source=null,archived=false)=>pg.query('insert into supportos_binds(id,slug,category_id,folder_id,owner_id,source_bind_id,translations,tags,archived) values($1,$1,$2,$3,$4,$5,$6,$7,$8)',[id,category,folder,owner,source,[{language:'ru',title:id,content:'Текст '+id}],['tag'],archived]);
 return {pg,change,remove,bind};
}

it('dissolves populated folders, retaining nesting, archived binds and personal versions, and rejects stale or duplicate structure',async()=>{
 const {pg,change,remove,bind}=await setup();
 try{
  const category=await change('category',{name:'Общее'}),parent=await change('folder',{name:'Родитель',categoryId:category.id});
  const folder=await change('folder',{name:'Старое',categoryId:category.id,parentId:parent.id});
  const child=await change('folder',{name:'Вложенное',categoryId:category.id,parentId:folder.id});
  const grandchild=await change('folder',{name:'Глубже',categoryId:category.id,parentId:child.id});
  const sibling=await change('folder',{name:'Вложенное',categoryId:category.id,parentId:parent.id});
  await pg.query("insert into supportos_folders(id,owner_id,category_id,parent_id,name) values('personal-folder',$1,$2,$3,'Личная')",[reader,category.id,folder.id]);
  await bind('shared',category.id,folder.id);await bind('nested',category.id,child.id);
  await bind('personal',category.id,folder.id,reader,'shared');await bind('archived',category.id,folder.id,null,null,true);
  const request={id:folder.id,expected:folder.updated_at,strategy:'keep'};
  await expect(remove('folder',{id:folder.id,expected:folder.updated_at})).rejects.toThrow('Папка содержит');
  await expect(remove('folder',{...request,expected:'2000-01-01'})).rejects.toThrow('изменена другим');
  await expect(remove('folder',request)).rejects.toThrow('уже есть папка');
  expect((await pg.query("select folder_id from supportos_binds where id='shared'")).rows[0].folder_id).toBe(folder.id);
  await change('folder',{id:sibling.id,expected:sibling.updated_at,name:'Другая',categoryId:category.id,parentId:parent.id});
  expect(await remove('folder',request)).toMatchObject({ok:true,row:null,foldersMoved:2,bindsMoved:3});
  expect((await pg.query('select id from supportos_folders where id=$1',[folder.id])).rows).toEqual([]);
  expect((await pg.query('select parent_id from supportos_folders where id=$1',[child.id])).rows[0].parent_id).toBe(parent.id);
  expect((await pg.query('select parent_id from supportos_folders where id=$1',[grandchild.id])).rows[0].parent_id).toBe(child.id);
  expect((await pg.query("select owner_id,parent_id from supportos_folders where id='personal-folder'")).rows[0]).toEqual({owner_id:reader,parent_id:parent.id});
  const personal=(await pg.query("select * from supportos_binds where id='personal'")).rows[0];
  expect(personal).toMatchObject({owner_id:reader,source_bind_id:'shared',folder_id:parent.id,translations:[{language:'ru',title:'personal',content:'Текст personal'}],tags:['tag']});
  expect((await pg.query("select archived,folder_id from supportos_binds where id='archived'")).rows[0]).toEqual({archived:true,folder_id:parent.id});
  expect((await pg.query('select count(*)::int n from supportos_binds')).rows[0].n).toBe(4);
  await expect(bind('late-personal',category.id,folder.id,reader,'shared')).rejects.toThrow('Папка больше недоступна');
  await expect(pg.query("insert into supportos_folders(id,owner_id,category_id,parent_id,name) values('late-folder',$1,$2,$3,'Поздняя')",[reader,category.id,folder.id])).rejects.toThrow('Родительская папка больше недоступна');
  await expect(remove('folder',{id:'personal-folder',strategy:'keep'})).rejects.toThrow('Личная структура');
  expect((await pg.query("select after_data from supportos_access_audit where action='library.folder.contents-preserved'")).rows[0].after_data).toMatchObject({parentId:parent.id,bindsMoved:3,foldersMoved:2});
 }finally{await pg.close();}
},30000);

it('removes an old section by transferring all references atomically and requires an authorized destination and valid session',async()=>{
 const {pg,change,remove,bind}=await setup();
 try{
  const source=await change('category',{name:'Старый раздел'}),destination=await change('category',{name:'Новая база'});
  const root=await change('folder',{name:'Ответы',categoryId:source.id});
  const child=await change('folder',{name:'Внутри',categoryId:source.id,parentId:root.id});
  const conflicting=await change('folder',{name:'Ответы',categoryId:destination.id});
  await pg.query("insert into supportos_categories(id,owner_id,name) values('private-category',$1,'Личная')",[reader]);
  await pg.query("insert into supportos_folders(id,owner_id,category_id,name) values('personal-root',$1,$2,'Личная папка')",[reader,source.id]);
  await bind('shared',source.id,child.id);await bind('at-root',source.id);
  await bind('personal',source.id,'personal-root',reader,'shared');await bind('unrelated','private-category',null,reader);
  const request={id:source.id,expected:source.updated_at,strategy:'keep',destinationCategoryId:destination.id};
  await expect(remove('category',request,reader)).rejects.toThrow('Нет права');
  await expect(remove('category',request,actor,'44444444-4444-4444-8444-444444444444')).rejects.toThrow('Нет права');
  await expect(remove('category',{...request,destinationCategoryId:'private-category'})).rejects.toThrow('Выберите другой общий раздел');
  await expect(remove('category',{...request,expected:'2000-01-01'})).rejects.toThrow('изменена другим');
  await expect(remove('category',request)).rejects.toThrow('уже есть папка');
  expect((await pg.query('select category_id from supportos_folders where id=$1',[root.id])).rows[0].category_id).toBe(source.id);
  await change('folder',{id:conflicting.id,expected:conflicting.updated_at,name:'Другое',categoryId:destination.id});
  expect(await remove('category',request)).toMatchObject({ok:true,foldersMoved:3,bindsMoved:3});
  expect((await pg.query('select id from supportos_categories where id=$1',[source.id])).rows).toEqual([]);
  expect((await pg.query('select category_id,parent_id from supportos_folders where id=$1',[child.id])).rows[0]).toEqual({category_id:destination.id,parent_id:root.id});
  expect((await pg.query("select category_id,owner_id,source_bind_id,translations from supportos_binds where id='personal'")).rows[0]).toMatchObject({category_id:destination.id,owner_id:reader,source_bind_id:'shared',translations:[{language:'ru',title:'personal',content:'Текст personal'}]});
  expect((await pg.query("select category_id from supportos_binds where id='unrelated'")).rows[0].category_id).toBe('private-category');
  const current=(await pg.query('select updated_at::text stamp from supportos_categories where id=$1',[destination.id])).rows[0].stamp;
  await expect(remove('category',{id:destination.id,expected:current,strategy:'keep'})).rejects.toThrow('Выберите другой общий раздел');
  await expect(bind('late',source.id,null,reader)).rejects.toThrow('Раздел больше недоступен');
  await expect(pg.query("insert into supportos_folders(id,owner_id,category_id,name) values('late-folder',$1,$2,'Поздняя')",[reader,source.id])).rejects.toThrow('Раздел папки больше недоступен');
  const empty=await change('category',{name:'Пустой'});
  expect(await remove('category',{id:empty.id,expected:empty.updated_at,strategy:'keep'})).toMatchObject({ok:true,row:null});
  expect((await pg.query("select has_function_privilege('authenticated','public.supportos_shared_tree_remove(uuid,uuid,text,jsonb)','execute') allowed")).rows[0].allowed).toBe(false);
 }finally{await pg.close();}
},30000);
