import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const sql = name => readFile(new URL(`../../supabase/${name}`, import.meta.url), 'utf8');

it('backfills existing DB documents without changing legacy content and is repeatable', async () => {
 const pg = new PGlite();
 try {
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await pg.exec(await sql('schema.sql'));
  const documents = {
   emails: [{id:'email-project',slug:'example',projectName:'Example',supportEmail:'support@example.test',kycEmail:'kyc@example.test',vipEmail:'',updatedAt:'2026-10-08T00:00:00Z'}],
   bonuses: [{id:'bonus-project',slug:'example',name:'Example',bonuses:[{id:'bonus',name:'Welcome',order:0,minDepositAmount:0,content:'Исходный текст',translations:[{language:'ru',content:'Исходный текст'},{language:'en',content:'Source text'}]}]}],
   'bonus-tools': [{id:'rules',rules:[{id:'rule',site:'Example',group:'A',welcomeWager:'x30'}],currencyTables:[{name:'Currency',rows:[{base:'0 EUR',baseAmount:0,values:{EUR:'0',USD:'1.25'}}]}]}],
  };
  for (const [id,data] of Object.entries(documents)) await pg.query('insert into supportos_shared_content(id,data,version) values($1,$2,7)',[id,JSON.stringify(data)]);
  const before=(await pg.query('select * from supportos_shared_content order by id')).rows;
  await pg.exec(await sql('migrations/20260925031553_normalized_support_content.sql'));
  const backfill=await sql('migrations/20260925034948_backfill_normalized_support_content.sql');
  await pg.exec(backfill);
  const counts=async()=> (await pg.query(`select (select count(*)::int from supportos_projects) projects,
   (select count(*)::int from supportos_project_emails) emails,
   (select count(*)::int from supportos_welcome_bonuses) bonuses,
   (select count(*)::int from supportos_welcome_bonus_translations) translations,
   (select count(*)::int from supportos_bonus_rules) rules,
   (select count(*)::int from supportos_currency_rows) currency_rows,
   (select count(*)::int from supportos_currency_values) currency_values`)).rows[0];
  expect(await counts()).toEqual({projects:1,emails:2,bonuses:1,translations:2,rules:1,currency_rows:1,currency_values:2});
  expect((await pg.query('select distinct project_id from supportos_welcome_bonuses')).rows).toEqual([{project_id:'email-project'}]);
  expect((await pg.query('select min_deposit_amount from supportos_welcome_bonuses')).rows[0].min_deposit_amount).toBe('0');
  await pg.exec(backfill);
  expect(await counts()).toEqual({projects:1,emails:2,bonuses:1,translations:2,rules:1,currency_rows:1,currency_values:2});
  await pg.exec(await sql('migrations/20260925050000_normalized_content_crud.sql'));
  expect((await pg.query('select * from supportos_shared_content order by id')).rows).toEqual(before);
  expect((await pg.query('select version from supportos_content_revisions')).rows.every(row=>row.version===7)).toBe(true);
  await pg.exec('set role authenticated');
  await expect(pg.query('select * from supportos_project_emails')).rejects.toThrow('permission denied');
  await pg.exec('reset role; set role service_role');
  await expect(pg.query("update supportos_shared_content set data='[]' where id='emails'")).rejects.toThrow('permission denied');
 } finally { await pg.close(); }
},30000);
