import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

const pg = new PGlite();
const userId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const expectedIndexes = {
 supportos_bind_choices_source_idx: ['source_id'],
 supportos_bind_feedback_user_idx: ['user_id'],
 supportos_bind_proposals_author_resolved_idx: ['author_id', 'resolved_at'],
 supportos_bind_shares_owner_idx: ['owner_id'],
 supportos_bind_shares_source_idx: ['source_id'],
};
const targetTables = ['supportos_ai_guidance', 'supportos_bind_choices', 'supportos_bind_feedback',
 'supportos_bind_proposals', 'supportos_bind_shares', 'supportos_shared_content'];
let migration, verificationSql, beforeSnapshot, beforeIndexes, beforeVerification;

async function indexes() {
 return (await pg.query(`select indexname, indexdef from pg_indexes
  where schemaname='public' order by indexname`)).rows;
}
async function snapshot() {
 return (await pg.query(`select jsonb_build_object(
  'tables',(select jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity,
    'force_rls',relforcerowsecurity,'acl',relacl::text) order by relname)
   from pg_class where relnamespace='public'::regnamespace and relkind='r'),
  'constraints',(select jsonb_agg(jsonb_build_object('name',conname,'table',conrelid::regclass::text,
    'definition',pg_get_constraintdef(oid)) order by conrelid,conname) from pg_constraint),
  'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
  'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),
    'acl',proacl::text) order by p.oid) from pg_proc p
    where pronamespace in ('public'::regnamespace,'supportos_private'::regnamespace) and prokind='f')
 ) as snapshot`)).rows[0].snapshot;
}
const verify = async () => (await pg.query(verificationSql)).rows[0].verification;
const plan = async (sql, args) => (await pg.query('explain (format json) '+sql, args)).rows[0]['QUERY PLAN'][0].Plan;
function planIndexes(node) {
 return [node['Index Name'], ...(node.Plans ?? []).flatMap(planIndexes)].filter(Boolean);
}

beforeAll(async () => {
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await pg.exec(`insert into auth.users(id,email,raw_app_meta_data)
  select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
   'fixture-'||n||'@example.test','{"role":"support"}'::jsonb from generate_series(1,20) n`);
 for (const path of ['schema.sql','migrations/20260912194913_knowledge_signals.sql',
  'migrations/20260913013915_admin_ai_runtime.sql',
  'migrations/20261007210927_harden_all_supportos_relation_grants.sql'])
  await pg.exec(await readFile(new URL('../supabase/'+path, import.meta.url), 'utf8'));

 // Real schema + synthetic workload ONLY in this in-memory PostgreSQL instance.
 // Selectivity is explicit, so EXPLAIN tests need no enable_seqscan overrides.
 await pg.exec(`insert into supportos_binds(id,slug,category_id,translations)
  select 'fixture-'||n,'fixture-'||n,'fixture','[]'::jsonb from generate_series(1,5000) n;
  insert into supportos_bind_choices(user_id,source_id,branch)
   select ('00000000-0000-4000-8000-'||lpad((n%20+1)::text,12,'0'))::uuid,
    'fixture-'||n,'main' from generate_series(1,5000) n;
  insert into supportos_bind_feedback(bind_id,user_id,kind)
   select source_id,user_id,'helpful' from supportos_bind_choices;
  insert into supportos_bind_proposals(source_id,author_id,base_version,translations,tags,status,resolved_at)
   select source_id,user_id,now(),'[]'::jsonb,'[]'::jsonb,
    (array['pending','accepted','rejected','withdrawn'])[1+(substring(source_id from 9)::int/20)%4],
    case when (substring(source_id from 9)::int/20)%4=0 then null
     else now()-substring(source_id from 9)::int*interval '1 second' end
   from supportos_bind_choices;
  insert into supportos_bind_shares(bind_id,source_id,owner_id,recipient_id)
   select source_id,'fixture-'||(1+(substring(source_id from 9)::int/20)%100),user_id,
    ('00000000-0000-4000-8000-'||lpad(((substring(source_id from 9)::int%20+1)%20+1)::text,12,'0'))::uuid
   from supportos_bind_choices;
  insert into supportos_shared_content(id,data) values('emails','[]'),('bonuses','[]'),('bonus-tools','[]');`);
 const files = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
  .filter(name => name.endsWith('_useful_business_fk_indexes.sql'));
 expect(files).toHaveLength(1);
 migration = await readFile(new URL('../supabase/migrations/'+files[0], import.meta.url), 'utf8');
 verificationSql = await readFile(new URL('../supabase/verification/business-fk-indexes.sql', import.meta.url), 'utf8');
 beforeSnapshot = await snapshot(); beforeIndexes = await indexes(); beforeVerification = await verify();
 await pg.exec('begin');
 await pg.exec(migration);
 await pg.exec('commit');
 // Analyze synthetic test tables only, never mutate/reset production statistics.
 for (const table of targetTables) await pg.exec('analyze public.'+table);
}, 30000);
beforeEach(async () => { await pg.exec('begin'); });
afterEach(async () => { await pg.exec('rollback;reset role'); });
afterAll(async () => { await pg.close(); });

it('adds exactly five full leading-key btree indexes, keeps every old index and is idempotent', async () => {
 const all = await indexes();
 expect(all.filter(index => !Object.hasOwn(expectedIndexes,index.indexname))).toEqual(beforeIndexes);
 expect(all.length-beforeIndexes.length).toBe(5);
 const metadata = (await pg.query(`select c.relname as name,am.amname as method,i.indisvalid,i.indisready,
  i.indpred is null as full_index,i.indisunique,
  (select jsonb_agg(a.attname order by key.position) from unnest(i.indkey) with ordinality key(attnum,position)
   join pg_attribute a on a.attrelid=i.indrelid and a.attnum=key.attnum
   where key.position<=i.indnkeyatts) as columns
  from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam
  where c.relname=any($1) order by c.relname`, [Object.keys(expectedIndexes)])).rows;
 expect(metadata).toHaveLength(5);
 for (const row of metadata) expect(row).toEqual({name:row.name,method:'btree',indisvalid:true,
  indisready:true,full_index:true,indisunique:false,columns:expectedIndexes[row.name]});
 expect(all.find(index => index.indexname==='supportos_bind_proposals_author_resolved_idx').indexdef)
  .toContain('(author_id, resolved_at DESC)');
 await pg.exec(migration);
 expect(await indexes()).toEqual(all);
});

it('preserves rows, FK/unique constraints, RPC definitions, RLS and grants', async () => {
 expect(await snapshot()).toEqual(beforeSnapshot);
 expect((await verify()).row_counts).toEqual(beforeVerification.row_counts);
 for (const role of ['anon','authenticated']) for (const table of targetTables)
  expect((await pg.query(`select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed`,[role,table])).rows[0].allowed).toBe(false);
});

it('verifies all seven FKs without mistaking a later or partial index key for coverage', async () => {
 expect(beforeVerification.missing_targets).toEqual([]);
 expect(beforeVerification.targets).toHaveLength(7);
 expect(beforeVerification.targets.every(target => !target.covered)).toBe(true);
 expect(beforeVerification.missing_required).toHaveLength(5);
 const result = await verify();
 expect(result.missing_targets).toEqual([]); expect(result.missing_required).toEqual([]);
 expect(result.targets.filter(target => target.covered)).toHaveLength(5);
 expect(result.intentional_exceptions.map(target => [target.table_name,target.column_name,target.covered]))
  .toEqual([['supportos_ai_guidance','updated_by',false],['supportos_shared_content','updated_by',false]]);
 // Missing/renamed target constraints must not produce a false green audit.
 await pg.exec('alter table supportos_bind_choices drop constraint supportos_bind_choices_source_id_fkey');
 expect((await verify()).missing_targets).toEqual([{table_name:'supportos_bind_choices',column_name:'source_id'}]);
});

it('plans the actual user results and outgoing-share queries with the new indexes', async () => {
 const queries = [
  ['supportos_bind_feedback_user_idx', 'select bind_id,kind from supportos_bind_feedback where user_id=$1 limit 1000', [userId(1)]],
  ['supportos_bind_proposals_author_resolved_idx', `select id,source_id,status,resolved_at,translations
   from supportos_bind_proposals where author_id=$1 and status in ('accepted','rejected') order by resolved_at desc limit 50`, [userId(1)]],
  ['supportos_bind_shares_owner_idx', `select s.id,s.source_id,u.email from supportos_bind_shares s
   join supportos_users u on u.id=s.recipient_id where s.owner_id=$1`, [userId(1)]],
 ];
 for (const [index,sql,args] of queries) expect(planIndexes(await plan(sql,args))).toContain(index);
});

it('does not accept partial or INCLUDE-only indexes as complete FK coverage', async () => {
 await pg.exec(`drop index supportos_bind_choices_source_idx;
  create index fixture_choices_partial on supportos_bind_choices(source_id) where branch='main';
  create index fixture_choices_include on supportos_bind_choices(user_id) include(source_id);`);
 const result = await verify();
 expect(result.missing_required.map(target => target.foreign_key)).toEqual(['supportos_bind_choices_source_id_fkey']);
 expect(result.targets.find(target => target.table_name==='supportos_bind_choices').indexes).toEqual([]);
});

it('plans source-only FK cascade lookups across all owners without forcing the planner', async () => {
 for (const [table,index] of [['supportos_bind_choices','supportos_bind_choices_source_idx'],
  ['supportos_bind_shares','supportos_bind_shares_source_idx']])
  expect(planIndexes(await plan('select 1 from '+table+' where source_id=$1', ['fixture-42']))).toContain(index);
});

it('keeps parent bind UPDATE checks and source DELETE cascades intact', async () => {
 const before = (await pg.query(`select count(*)::int n from supportos_bind_shares where source_id='fixture-42'`)).rows[0].n;
 expect(before).toBeGreaterThan(0);
 await pg.exec('savepoint parent_update');
 await expect(pg.exec("update supportos_binds set id='renamed-fixture' where id='fixture-42'"))
  .rejects.toMatchObject({code:'23503'});
 await pg.exec('rollback to savepoint parent_update;release savepoint parent_update');
 await pg.exec("delete from supportos_binds where id='fixture-42'");
 for (const table of ['supportos_bind_choices','supportos_bind_proposals','supportos_bind_shares'])
  expect((await pg.query('select count(*)::int n from '+table+" where source_id='fixture-42'")).rows[0].n).toBe(0);
 expect((await pg.query("select count(*)::int n from supportos_bind_feedback where bind_id='fixture-42'")).rows[0].n).toBe(0);
});

it('keeps user DELETE cascades across pending/resolved proposals, shares and feedback intact', async () => {
 const states = (await pg.query('select distinct status from supportos_bind_proposals where author_id=$1',[userId(1)])).rows;
 expect(states).toHaveLength(4);
 await pg.query('delete from auth.users where id=$1',[userId(1)]);
 for (const [table,column] of [['supportos_bind_proposals','author_id'],['supportos_bind_shares','owner_id'],
  ['supportos_bind_feedback','user_id'],['supportos_bind_choices','user_id']])
  expect((await pg.query('select count(*)::int n from '+table+' where '+column+'=$1',[userId(1)])).rows[0].n).toBe(0);
});
