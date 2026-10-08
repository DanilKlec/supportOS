import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

const pg = new PGlite();
const actor = randomUUID(), target = randomUUID();
const migrationUrl = new URL('../supabase/migrations/20261007210927_harden_all_supportos_relation_grants.sql', import.meta.url);
let migration, policiesBefore, serverAclBefore, countsBefore;
const tables = async () => (await pg.query(`select c.relname from pg_class c
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and starts_with(c.relname,'supportos_') and c.relkind in ('r','p')
 order by c.relname`)).rows.map(row => row.relname);
const policies = async () => (await pg.query(`select polrelid,polname,polcmd,polpermissive,polroles,
 pg_get_expr(polqual,polrelid) using_expr,pg_get_expr(polwithcheck,polrelid) check_expr
 from pg_policy order by polrelid,polname`)).rows;
const serverAcl = async () => (await pg.query(`select c.oid,c.relname,
 (select jsonb_agg(jsonb_build_object('privilege',a.privilege_type,'grantor',a.grantor,'grantable',a.is_grantable)
  order by a.privilege_type) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a
  where a.grantee='service_role'::regrole) grants,
 (select jsonb_agg(jsonb_build_object('column',col.attname,'privilege',a.privilege_type,'grantable',a.is_grantable)
  order by col.attnum,a.privilege_type) from pg_attribute col cross join lateral aclexplode(col.attacl) a
  where col.attrelid=c.oid and a.grantee='service_role'::regrole) column_grants
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relkind in ('r','p','v','m','S') order by c.oid`)).rows;
async function denied(sql, args = []) {
 await pg.exec('savepoint denied');
 try { await expect(pg.query(sql, args)).rejects.toMatchObject({ code: '42501' }); }
 finally { await pg.exec('rollback to savepoint denied;release savepoint denied'); }
}
async function counts() {
 const result = {};
 for (const name of await tables()) result[name] = (await pg.query(`select count(*)::int n from public."${name}"`)).rows[0].n;
 return result;
}

beforeAll(async () => {
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create role public_only_probe;create schema auth;
  create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  grant usage on schema auth to authenticated;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
 await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3),($4,$5,$6)',
  [actor,'admin@example.test',{role:'admin'},target,'support@example.test',{role:'support'}]);
 for (const path of ['schema.sql','migrations/20260912194913_knowledge_signals.sql','migrations/20260913013915_admin_ai_runtime.sql',
  'migrations/20260925031553_normalized_support_content.sql','migrations/20260925050000_normalized_content_crud.sql',
  'migrations/20260929070633_server_only_supportos_grants.sql',
  'migrations/20260923081810_telegram_registration.sql','migrations/20260923192252_telegram_login_2fa.sql',
  'migrations/20260923194400_telegram_password_confirmation.sql','migrations/20261006132526_normalized_team_glossary.sql',
  'migrations/20261006214000_ai_feedback_reviews.sql','migrations/20261007191041_login_security_history.sql',
  'migrations/20261007194247_telegram_critical_confirmation.sql','migrations/20261007203642_critical_security_access_audit.sql',
  'migrations/20261007204222_audit_registration_claim_completion.sql','migrations/20261007205438_restrict_access_helper_execute.sql'])
  await pg.exec(await readFile(new URL('../supabase/'+path, import.meta.url), 'utf8'));

 // Simulate real ACL drift, including new tables that were absent from the old allowlist.
 await pg.exec(`grant select(id),insert(id),update(id),references(id) on public.supportos_binds to public,anon,authenticated;
  create table public.supportos_future_fixture(id int primary key,payload text);
  create policy future_fixture_owned on public.supportos_future_fixture to authenticated using (id=1) with check (id=1);
  grant select(payload) on public.supportos_future_fixture to service_role;
  create sequence public.renamed_business_sequence owned by public.supportos_future_fixture.id;
  create sequence public.supportos_unowned_sequence;
  create table public.supportos_partition_fixture(id int) partition by range(id);
  create table public.child_without_prefix partition of public.supportos_partition_fixture for values from (0) to (10);
  create view public.supportos_view_fixture as select id from public.supportos_future_fixture;
  create materialized view public.supportos_materialized_fixture as select id from public.supportos_future_fixture;
  grant select(id) on public.supportos_view_fixture to public,authenticated;
  create table public.unrelated_fixture(id serial primary key);
  grant select on public.unrelated_fixture to public;
  insert into public.supportos_future_fixture values(1,'synthetic content');
  insert into public.supportos_binds(id,slug,category_id,translations) values('fixture','fixture','category','[]');`);
 policiesBefore = await policies(); serverAclBefore = await serverAcl(); countsBefore = await counts();
 migration = await readFile(migrationUrl, 'utf8');
 await pg.exec(migration);
}, 30000);
beforeEach(async () => { await pg.exec('begin'); });
afterEach(async () => { await pg.exec('rollback;reset role'); });
afterAll(async () => { await pg.close(); });

it('covers the full business schema, preserves all rows/policies and does not widen server privileges', async () => {
 const names = await tables();
 expect(names).toEqual(expect.arrayContaining(['supportos_projects','supportos_project_emails','supportos_welcome_bonuses',
  'supportos_welcome_bonus_translations','supportos_bonus_rules','supportos_currency_tables','supportos_currency_rows',
  'supportos_currency_values','supportos_content_revisions','supportos_glossary_terms','supportos_ai_feedback_reviews',
  'supportos_users','supportos_access_audit','supportos_login_events','supportos_telegram_critical_requests']));
 expect(await policies()).toEqual(policiesBefore);
 expect(await serverAcl()).toEqual(serverAclBefore);
 expect(await counts()).toEqual(countsBefore);
 expect((await pg.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and starts_with(c.relname,'supportos_') and c.relkind in ('r','p') and not c.relrowsecurity`)).rows[0].n).toBe(0);
 await pg.exec(migration);
 expect(await policies()).toEqual(policiesBefore); expect(await serverAcl()).toEqual(serverAclBefore);
});
it.each(['anon','authenticated','public_only_probe'])('removes table, column, PUBLIC and sequence privileges for %s', async role => {
 for (const name of [...await tables(),'child_without_prefix','supportos_view_fixture','supportos_materialized_fixture']) {
  expect((await pg.query(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') table_access,
   has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') column_access`, [role,'public.'+name])).rows[0])
   .toEqual({table_access:false,column_access:false});
 }
 for (const name of ['supportos_access_audit_id_seq','supportos_bind_history_id_seq','supportos_login_events_id_seq',
  'supportos_knowledge_gaps_id_seq','supportos_currency_tables_id_seq','supportos_currency_rows_id_seq',
  'renamed_business_sequence','supportos_unowned_sequence'])
  expect((await pg.query("select has_sequence_privilege($1,$2,'USAGE,SELECT,UPDATE') allowed",[role,'public.'+name])).rows[0].allowed).toBe(false);
 await pg.exec('set local role '+role);
 for (const sql of ['select id from public.supportos_binds','insert into public.supportos_future_fixture values(2,\'forged\')',
  'update public.supportos_binds set archived=true','delete from public.supportos_binds','truncate public.supportos_future_fixture',
  'select * from public.supportos_view_fixture','select * from public.supportos_materialized_fixture','select * from public.child_without_prefix',
  "select last_value from public.supportos_access_audit_id_seq","select nextval('public.supportos_bind_history_id_seq')",
  "select setval('public.supportos_access_audit_id_seq',999)"])
  await denied(sql);
});
it('keeps service-role content CRUD, append-only journals and DB RBAC working', async () => {
 await pg.exec('set local role service_role');
 await pg.exec("insert into supportos_projects(id,name,slug) values('fixture','Fixture','fixture')");
 await pg.exec("insert into supportos_project_emails(id,project_id,type,email) values('address','fixture','Support','support@example.test')");
 await pg.exec("update supportos_project_emails set type='Finance' where id='address'");
 expect((await pg.query('select type from supportos_project_emails')).rows).toEqual([{type:'Finance'}]);
 await pg.exec("delete from supportos_project_emails where id='address'");
 await pg.exec("insert into supportos_currency_tables(name) values('synthetic currencies')");
 expect((await pg.query('select id from supportos_currency_tables')).rows[0].id).toBeTruthy();
 const change = {id:target,status:'active',roles:['shift'],display_name:'Employee',version:1};
 expect((await pg.query('select supportos_rbac_change($1,$2,$3) value',[actor,'user.update',change])).rows[0].value).toMatchObject({version:2});
 expect((await pg.query('select action from supportos_access_audit')).rows).toEqual([{action:'user.update'}]);
 for (const table of ['supportos_access_audit','supportos_login_events']) {
  expect((await pg.query("select has_table_privilege('service_role',$1,'SELECT') read,has_table_privilege('service_role',$1,'INSERT') append,has_table_privilege('service_role',$1,'UPDATE,DELETE,TRUNCATE') mutate",[table])).rows[0])
   .toEqual({read:true,append:true,mutate:false});
  await denied('update '+table+" set created_at=now()"); await denied('delete from '+table);
 }
});
it('leaves managed Auth objects, unrelated tables/sequences and global defaults untouched', async () => {
 expect((await pg.query("select relrowsecurity from pg_class where oid='auth.sessions'::regclass")).rows[0].relrowsecurity).toBe(false);
 for (const role of ['anon','authenticated','public_only_probe'])
  expect((await pg.query("select has_table_privilege($1,'public.unrelated_fixture','SELECT') allowed",[role])).rows[0].allowed).toBe(true);
 await pg.exec('set local role authenticated'); await denied('select * from auth.sessions'); await pg.exec('reset role');
 expect((await pg.query("select has_sequence_privilege('authenticated','public.unrelated_fixture_id_seq','USAGE') allowed")).rows[0].allowed).toBe(true);
 // Prefix-specific future protection must live in each new migration, not in a global allow-all policy/default change.
 await pg.exec('create table public.unrelated_future_fixture(id int)');
 expect((await pg.query("select has_table_privilege('authenticated','public.unrelated_future_fixture','SELECT') allowed")).rows[0].allowed).toBe(true);
});
it('provides a read-only verification query that detects real table/column/sequence drift', async () => {
 const sql = await readFile(new URL('../supabase/verification/server-only-business-grants.sql',import.meta.url),'utf8');
 const check = async () => (await pg.query(sql)).rows[0].verification;
 expect(await check()).toMatchObject({tables_without_rls:0,violations:[]});
 await pg.exec(`grant select(id) on supportos_binds to authenticated;
  grant usage on sequence renamed_business_sequence to anon;
  grant select on supportos_project_emails to public;`);
 expect((await check()).violations).toEqual(expect.arrayContaining([
  {schema:'public',name:'supportos_binds',kind:'r',role:'authenticated'},
  {schema:'public',name:'renamed_business_sequence',kind:'S',role:'anon'},
  {schema:'public',name:'supportos_project_emails',kind:'r',role:'anon'},
  {schema:'public',name:'supportos_project_emails',kind:'r',role:'authenticated'},
 ]));
 await pg.exec(migration); expect(await check()).toMatchObject({tables_without_rls:0,violations:[]});
});
it.each(['table','sequence','maintain'])('fails closed and atomically rolls back on inherited %s grants', async kind => {
 await pg.exec(`create role drift_fixture;grant drift_fixture to authenticated;
  grant ${kind==='maintain'?'maintain':'select'} on ${kind==='sequence'?'sequence public.supportos_unowned_sequence':'public.supportos_future_fixture'} to drift_fixture;
  grant select on public.supportos_binds to anon;savepoint migration_drift`);
 await expect(pg.exec(migration)).rejects.toMatchObject({code:'42501'});
 await pg.exec('rollback to savepoint migration_drift;release savepoint migration_drift');
 expect((await pg.query("select has_table_privilege('anon','public.supportos_binds','SELECT') allowed")).rows[0].allowed).toBe(true);
});
it('has no production browser business CRUD/RPC/realtime callers', async () => {
 const root = new URL('../src/', import.meta.url);
 const scan = async directory => {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
   const file = new URL(entry.name+(entry.isDirectory()?'/':''),directory);
   if (entry.isDirectory()) await scan(file);
   else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
    const source = await readFile(file,'utf8');
    expect(source,file.pathname).not.toMatch(/supabaseService\s*\.\s*(?:select|insert|upsert|updateWhere|delete|rpc)\s*\(/);
    expect(source,file.pathname).not.toMatch(/(?:supabase|client)\s*\.\s*(?:from|rpc|channel)\s*\(/);
    expect(source,file.pathname).not.toContain('postgres_changes');
   }
  }
 };
 await scan(root);
});
