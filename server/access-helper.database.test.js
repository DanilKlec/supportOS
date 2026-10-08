import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';

const pg=new PGlite(),admin=randomUUID(),support=randomUUID(),creator=randomUUID(),pending=randomUUID();
const tables=['supportos_bind_feedback','supportos_binds','supportos_categories','supportos_folders','supportos_knowledge_gaps'];
const rpc=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
let migration,originalHelper,originalContext,originalChange;
const definition=async(name)=>(await pg.query('select pg_get_functiondef($1::regprocedure) definition',[name])).rows[0].definition;
async function denied(sql,args=[]) {
 await pg.exec('savepoint denied');
 try{await expect(pg.query(sql,args)).rejects.toMatchObject({code:'42501'});}
 finally{await pg.exec('rollback to savepoint denied;release savepoint denied');}
}
async function claims(subject) {
 await pg.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
  [subject,JSON.stringify({sub:subject,role:'authenticated',user_metadata:{role:'creator',permissions:['technical','roles.manage']},app_metadata:{role:'creator',supportos_role:'creator'}})]);
}
beforeAll(async()=>{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role public_only_probe;create schema auth;
  create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant usage on schema auth to authenticated,service_role;`);
 for(const [id,role] of [[admin,'admin'],[support,'support'],[creator,'creator']])
  await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,id+'@example.test',{role}]);
 for(const path of ['supabase/schema.sql','supabase/migrations/20260912194913_knowledge_signals.sql','supabase/migrations/20260929070633_server_only_supportos_grants.sql'])
  await pg.exec(await readFile(new URL('../'+path,import.meta.url),'utf8'));
 await pg.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[pending,'pending@example.test',{role:'creator'}]);
 await pg.exec("insert into supportos_binds(id,slug,category_id,translations) values('shared-fixture','shared-fixture','category','[]')");
 originalHelper=await definition('public.supportos_access(text)');originalContext=await definition('public.supportos_rbac_context(uuid)');originalChange=await definition('public.supportos_rbac_change(uuid,text,jsonb)');
 migration=await readFile(new URL('../supabase/migrations/20261007205438_restrict_access_helper_execute.sql',import.meta.url),'utf8');
 await pg.exec(migration);
},20000);
beforeEach(async()=>{await pg.exec('begin');});
afterEach(async()=>{await pg.exec('rollback;reset role');});
afterAll(async()=>{await pg.close();});

it('keeps all legacy policy callers and function/RBAC bodies unchanged while removing browser/PUBLIC execution',async()=>{
 expect(await definition('public.supportos_access(text)')).toBe(originalHelper);
 expect(await definition('public.supportos_rbac_context(uuid)')).toBe(originalContext);expect(await definition('public.supportos_rbac_change(uuid,text,jsonb)')).toBe(originalChange);
 const callers=(await pg.query(`select distinct p.polrelid::regclass::text table_name,p.polname from pg_depend d join pg_policy p on p.oid=d.objid
  where d.classid='pg_policy'::regclass and d.refclassid='pg_proc'::regclass and d.refobjid='public.supportos_access(text)'::regprocedure`)).rows;
 expect(callers).toHaveLength(14);expect([...new Set(callers.map(x=>x.table_name))].sort()).toEqual(tables);
 for(const role of ['anon','authenticated','public_only_probe','service_role'])
  expect((await pg.query("select has_function_privilege($1,'public.supportos_access(text)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(role==='service_role');
 expect((await pg.query("select count(*)::int n from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.supportos_access(text)'::regprocedure and a.grantee=0")).rows[0].n).toBe(0);
 await pg.exec(migration); // Idempotent ACL change.
});
it.each(['anon','authenticated','public_only_probe'])('blocks direct RPC execution for %s, even with a real Creator subject or forged elevated claims',async(role)=>{
 await claims(creator);await pg.exec('set local role '+role);
 for(const permission of ['read','write','binds.read','knowledge.write','users.manage','roles.manage','technical'])
  await denied('select public.supportos_access(permission=>$1)',[permission]);
 await denied('select public.supportos_rbac_context($1)',[creator]);
 await denied('select public.supportos_rbac_change($1,$2,$3)',[creator,'user.update',{id:support,status:'active',roles:['creator'],display_name:'Forged',version:1}]);
 await denied("insert into public.supportos_user_roles(user_id,role_id) values($1,'creator')",[support]);
 await denied("update public.supportos_users set status='active' where id=$1",[pending]);
});
it.each(tables)('does not expose %s through the Data API or column privileges',async(table)=>{
 const grants=(await pg.query("select has_table_privilege('authenticated',$1,'SELECT,INSERT,UPDATE,DELETE') table_access,has_any_column_privilege('authenticated',$1,'SELECT,INSERT,UPDATE') column_access",[table])).rows[0];
 expect(grants).toEqual({table_access:false,column_access:false});
 await claims(creator);await pg.exec('set local role authenticated');await denied('select * from public.'+table);
});
it('preserves legacy aliases and reads fresh DB roles, never forged/stale metadata',async()=>{
 await pg.query('update auth.users set raw_app_meta_data=$1,raw_user_meta_data=$1 where id=$2',[{role:'creator',permissions:['technical','roles.manage']},support]);
 await claims(support);await pg.exec('set local role service_role');
 expect(await rpc('supportos_access',['read'])).toBe(true);expect(await rpc('supportos_access',['binds.read'])).toBe(true);
 for(const permission of ['write','knowledge.write','roles.manage','technical'])expect(await rpc('supportos_access',[permission])).toBe(false);
 expect((await rpc('supportos_rbac_context',[support])).roles.map(r=>r.id)).toEqual(['support']);
 await pg.query("update supportos_users set status='disabled' where id=$1",[support]);
 expect(await rpc('supportos_access',['read'])).toBe(false);expect((await rpc('supportos_rbac_context',[support])).permissions).toEqual([]);
 await claims(pending);expect(await rpc('supportos_access',['read'])).toBe(false);
 await pg.query("select set_config('request.jwt.claim.sub','',true)");expect(await rpc('supportos_access',['read'])).toBe(false);
});
it('preserves server-role RBAC reads/mutations, audit and optimistic conflicts without permitting escalation',async()=>{
 await claims(support);await pg.exec('set local role service_role');
 const change={id:support,status:'active',roles:['shift'],display_name:'Employee',version:1};
 expect(await rpc('supportos_rbac_change',[admin,'user.update',change])).toMatchObject({status:'active',version:2});
 expect((await rpc('supportos_rbac_context',[support])).roles.map(r=>r.id)).toEqual(['shift']);
 expect(await rpc('supportos_access',['write'])).toBe(true);expect(await rpc('supportos_access',['knowledge.write'])).toBe(true);
 expect((await pg.query('select actor_id,target_id,action from supportos_access_audit')).rows).toEqual([{actor_id:admin,target_id:support,action:'user.update'}]);
 await pg.exec('savepoint conflict');await expect(rpc('supportos_rbac_change',[admin,'user.update',change])).rejects.toMatchObject({code:'40001'});await pg.exec('rollback to savepoint conflict');
 await denied('select supportos_rbac_change($1,$2,$3)',[support,'user.update',{...change,id:admin,version:1,roles:['creator']}]);
 await denied('select supportos_rbac_change($1,$2,$3)',[admin,'user.update',{...change,version:2,roles:['creator']}]);
 await denied('select supportos_rbac_change($1,$2,$3)',[admin,'role.save',{id:'escalation',name:'Escalation',version:0,permissions:['technical']}]);
 expect((await pg.query('select id from supportos_binds')).rows).toEqual([{id:'shared-fixture'}]);
});
it('fails closed if someone later accidentally grants browser SELECT on a legacy RLS table',async()=>{
 await pg.exec('grant select on public.supportos_binds to authenticated');await claims(creator);await pg.exec('set local role authenticated');
 await denied('select * from public.supportos_binds');
});
it.each(['grant select on public.supportos_binds to authenticated','grant select(id) on public.supportos_binds to authenticated','grant select on public.supportos_binds to public'])('refuses migration on browser grant drift: %s',async(grant)=>{
 await pg.exec('grant execute on function public.supportos_access(text) to authenticated;'+grant+';savepoint migration');
 await expect(pg.exec(migration)).rejects.toThrow('has browser grants');await pg.exec('rollback to savepoint migration');
 expect((await pg.query("select has_function_privilege('authenticated','public.supportos_access(text)','EXECUTE') allowed")).rows[0].allowed).toBe(true);
});
