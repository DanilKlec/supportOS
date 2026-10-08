// Read one JSON line containing a DB snapshot from stdin. No live connections,
// no fixture writes to the repository, and no business content in the report.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const line = await new Promise(resolve => input.once('line', resolve));
input.close();
const snapshot = JSON.parse(line);
const pg = new PGlite();
const migration = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
try {
 await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 await pg.exec(await migration('schema.sql'));
 for (const row of snapshot.content) {
  await pg.query('insert into supportos_shared_content(id,data,version,updated_at) values($1,$2,$3,$4)',[row.id,JSON.stringify(row.data),row.version,row.updated_at]);
 }
 for (const row of snapshot.binds) {
  await pg.query('insert into supportos_binds(id,slug,category_id,folder_id,translations,tags) values($1,$2,$3,$4,$5,$6)',[row.id,row.slug,row.category_id,row.folder_id,JSON.stringify(row.translations),JSON.stringify(row.tags)]);
 }
 const legacyBefore=(await pg.query('select * from supportos_shared_content order by id')).rows;
 const bindsBefore=(await pg.query('select id,slug,translations,tags from supportos_binds order by id')).rows;
 for (const name of [
  '20260925031553_normalized_support_content.sql',
  '20260925034948_backfill_normalized_support_content.sql',
  '20260925040616_map_legacy_knowledge_structure.sql',
  '20260925050000_normalized_content_crud.sql',
 ]) await pg.exec(await migration(`migrations/${name}`));
 assert.deepEqual((await pg.query('select * from supportos_shared_content order by id')).rows,legacyBefore);
 assert.deepEqual((await pg.query('select id,slug,translations,tags from supportos_binds order by id')).rows,bindsBefore);
 const tables=['supportos_projects','supportos_project_emails','supportos_welcome_bonuses','supportos_welcome_bonus_translations','supportos_bonus_rules','supportos_currency_tables','supportos_currency_rows','supportos_currency_values','supportos_binds','supportos_categories','supportos_folders'];
 const counts={};
 for (const name of tables) counts[name]=(await pg.query(`select count(*)::int count from ${name}`)).rows[0].count;
 const mapping=(await pg.query('select side,status,count(*)::int count,count(*) filter(where changed)::int changed from supportos_legacy_bind_mapping_report group by side,status order by side,status')).rows;
 const unmapped=(await pg.query("select b.id from supportos_binds b left join supportos_categories c on c.id=b.category_id where c.id is null order by b.id")).rows;
 console.log(JSON.stringify({status:'PASS',legacyUnchanged:true,bindContentUnchanged:true,counts,mapping,unmappedBindIds:unmapped.map(row=>row.id)}));
} finally { await pg.close(); }
