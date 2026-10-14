import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('serializes AI edits, retains feedback and denies unprivileged database access',async()=>{
 const pg=new PGlite();const admin='11111111-1111-4111-8111-111111111111',support='22222222-2222-4222-8222-222222222222';
 try {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  for(const [id,role] of [[admin,'admin'],[support,'support']])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${role}@example.test`,JSON.stringify({role})]);
  await pg.exec(await readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
  await pg.exec("insert into supportos_role_permissions(role_id,permission_id) values('support','tools')");
  await pg.exec(await readFile(new URL('../../supabase/migrations/20260913013915_admin_ai_runtime.sql',import.meta.url),'utf8'));
  const permissions=(await pg.query('select supportos_rbac_context($1) ctx',[admin])).rows[0].ctx.permissions;
  expect(permissions).toEqual(expect.arrayContaining(['composer.use','translator.use','ai.rules','ai.tests','ai.playground','ai.publish']));
  const filtered=(await pg.query("select supportos_rbac_list_users('',1,'active','support') data")).rows[0].data;
  expect(filtered.total).toBe(1);expect(filtered.users[0].id).toBe(support);
  const save=(actor,expected,operation,value)=>pg.query('select supportos_save_ai_runtime($1,$2,$3,$4)',[actor,expected,operation,JSON.stringify(value)]);
  await expect(save(support,1,'save',{entries:[]})).rejects.toThrow('Нет права');
  await save(admin,1,'save',{entries:[{id:'k',status:'draft'}]});
  await expect(save(admin,1,'save',{entries:[]})).rejects.toThrow('изменён');
  await save(support,0,'feedback',{rating:'negative',reason:'Не тот язык'});
  await save(admin,2,'publish',{entries:[{id:'k',status:'published'}],feedback:[]});
  const row=(await pg.query("select document,version from supportos_ai_guidance where id='main'")).rows[0];
  expect(row.version).toBe(3);expect(row.document.feedback).toHaveLength(1);expect(row.document.feedback[0].author).toBe(support);
  expect((await pg.query("select action from supportos_access_audit where action like 'ai.%' order by id")).rows.map(r=>r.action)).toEqual(['ai.save','ai.publish']);
  await pg.exec('set role authenticated');
  await expect(save(admin,4,'save',{entries:[]})).rejects.toThrow('permission denied');
  await expect(pg.query('select * from supportos_ai_guidance')).rejects.toThrow('permission denied');
 }finally {await pg.close();}
},30000);
