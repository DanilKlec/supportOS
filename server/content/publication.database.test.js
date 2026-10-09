import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

const admin = '11111111-1111-4111-8111-111111111111';
const support = '22222222-2222-4222-8222-222222222222';
const emails = [{ id: 'project-1', projectName: 'Example', slug: 'example', emails: [
 { id: 'email-1', type: 'Finance', email: 'finance@example.com', note: 'Synthetic', order: 0 },
 { id: 'email-2', type: 'Complaints', email: 'complaints@example.com', order: 1 },
] }];
const bonuses = [{ id: 'legacy-project-id', name: 'Example', slug: 'example', bonuses: [{
 id: 'bonus-1', name: 'Welcome', content: 'Текст', order: 0, minDepositAmount: 10,
 minDepositCurrency: 'EUR', reviewDue: '2026-10-20', responsible: 'Synthetic',
 translations: [{ language: 'ru', content: 'Текст' }, { language: 'en', content: 'Text' }],
}] }];
const rule = { id: 'rule-1', group: 'A', site: 'Example', welcomeWager: 'x10', welcomeMaxWin: '', noDeposit: '', retentionWager: '', retentionMaxWin: '', events: '', map: '', note: '', searchText: '' };
const tools = [{ id: 'rules', slug: 'rules', sourceUrl: 'https://example.com', loadedAt: '2026-10-09T00:00:00Z', warnings: ['Synthetic'], rules: [rule], currencyTables: [{ name: 'Currency', currencies: ['EUR'], rows: [{ base: '10 EUR', baseAmount: 10, values: { EUR: '10 EUR' } }] }] }];
const documents = [['emails', emails], ['bonuses', bonuses], ['bonus-tools', tools]];
let pg;
const migration = name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
// Expected SQL failures must not abort the surrounding test transaction.
const query = async (sql, params) => {
 await pg.exec('savepoint operation');
 try {
  const result = await pg.query(sql, params);
  await pg.exec('release savepoint operation');
  return result;
 } catch (error) {
  await pg.exec('rollback to savepoint operation; release savepoint operation');
  throw error;
 }
};
const publish = async (dataset, payload, expected = 3, actor = admin) =>
 (await query('select public.supportos_publish_normalized_content($1,$2,$3,$4) value', [actor, dataset, expected, JSON.stringify(payload)])).rows[0].value;

beforeAll(async () => {
 pg = new PGlite();
 await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
 for (const [id, role] of [[admin, 'admin'], [support, 'support']])
  await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)', [id, `${role}@example.com`, JSON.stringify({ role })]);
 await pg.exec(await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'));
 await pg.exec(await migration('20260925031553_normalized_support_content'));
 await pg.exec("insert into public.supportos_shared_content(id,data,version) values ('emails','[]',3),('bonuses','[]',3),('bonus-tools','[]',3)");
 // Reproduce the deployed state: read tables/revisions exist, but publish RPCs do not.
 await pg.exec(await migration('20261008114523_normalized_content_revisions'));
 expect((await pg.query("select to_regprocedure('public.supportos_publish_normalized_content(uuid,text,integer,jsonb)') missing")).rows[0].missing).toBeNull();
 await pg.exec(await migration('20261009082433_normalized_content_publication_rpc'));
 await pg.exec(await migration('20261009085144_safe_normalized_content_publication'));
 await pg.exec("insert into public.supportos_content_revisions(id,version) values ('emails',3),('bonuses',3),('bonus-tools',3)");
 await pg.exec("insert into public.supportos_projects(id,name,slug) values ('project-1','Example','example')");
}, 30000);
beforeEach(async () => { await pg.exec('begin; set local role service_role'); });
afterEach(async () => { await pg.exec('rollback'); });
afterAll(async () => { await pg?.close(); });

it('publishes arbitrary email types, notes and ordering as service_role, with a revision and audit', async () => {
 expect(await publish('emails', emails)).toMatchObject({ id: 'emails', data: emails, version: 4, updated_by: admin });
 expect((await query('select type,email,note,sort_order from public.supportos_project_emails order by sort_order')).rows).toEqual([
  { type: 'Finance', email: 'finance@example.com', note: 'Synthetic', sort_order: 0 },
  { type: 'Complaints', email: 'complaints@example.com', note: null, sort_order: 1 },
 ]);
 const edited = [{ ...emails[0], emails: [{ ...emails[0].emails[0], email: 'new@example.com' }] }];
 expect((await publish('emails', edited, 4)).version).toBe(5);
 expect((await query('select email from public.supportos_project_emails')).rows).toEqual([{ email: 'new@example.com' }]);
 expect((await query("select action,target_id,after_data->>'storage' storage from public.supportos_access_audit where action='content.publish'")).rows).toEqual([
  { action: 'content.publish', target_id: 'emails', storage: 'normalized' },
  { action: 'content.publish', target_id: 'emails', storage: 'normalized' },
 ]);
});

it('publishes and edits bonuses/translations using catalog IDs without touching emails', async () => {
 await publish('emails', emails);
 expect((await publish('bonuses', bonuses)).version).toBe(4);
 expect((await query('select project_id,review_due::text,responsible from public.supportos_welcome_bonuses')).rows).toEqual([{ project_id: 'project-1', review_due: '2026-10-20', responsible: 'Synthetic' }]);
 const changed = [{ ...bonuses[0], bonuses: [{ ...bonuses[0].bonuses[0], translations: [{ language: 'ru', content: 'Обновлено' }] }] }];
 expect((await publish('bonuses', changed, 4)).version).toBe(5);
 expect((await query('select language,content from public.supportos_welcome_bonus_translations')).rows).toEqual([{ language: 'ru', content: 'Обновлено' }]);
 expect((await query('select count(*)::int n from public.supportos_project_emails')).rows[0].n).toBe(2);
});

it('publishes bonus rules and currency tables, including server identity sequences', async () => {
 expect((await publish('bonus-tools', tools)).version).toBe(4);
 expect((await query('select project_id,welcome_wager from public.supportos_bonus_rules')).rows).toEqual([{ project_id: 'project-1', welcome_wager: 'x10' }]);
 expect((await query('select currency_code,amount::text from public.supportos_currency_values')).rows).toEqual([{ currency_code: 'EUR', amount: '10' }]);
 expect((await query("select metadata->'warnings' warnings from public.supportos_content_revisions where id='bonus-tools'")).rows[0].warnings).toEqual(['Synthetic']);
 expect((await publish('bonus-tools', tools, 4)).version).toBe(5);
 expect((await query('select count(*)::int n from public.supportos_currency_values')).rows[0].n).toBe(1);
});

it.each(documents)('preserves optimistic conflicts for %s and does not change the published data', async (dataset, payload) => {
 await publish(dataset, payload);
 await expect(publish(dataset, [], 3)).rejects.toMatchObject({ code: '40001' });
 expect((await query('select version from public.supportos_content_revisions where id=$1', [dataset])).rows[0].version).toBe(4);
});

it.each(documents)('checks current write permission for %s inside the server RPC', async (dataset, payload) => {
 await expect(publish(dataset, payload, 3, support)).rejects.toMatchObject({ code: '42501' });
 await query('delete from public.supportos_role_permissions where role_id=$1 and permission_id=$2', ['admin', dataset === 'emails' ? 'projects.write' : 'bonuses.write']);
 await expect(publish(dataset, payload)).rejects.toMatchObject({ code: '42501' });
 expect((await query('select version from public.supportos_content_revisions where id=$1', [dataset])).rows[0].version).toBe(3);
});

it('rolls back a failed publication and never writes the legacy archive', async () => {
 await publish('emails', emails);
 const duplicate = [{ ...emails[0], emails: [emails[0].emails[0], emails[0].emails[0]] }];
 await expect(publish('emails', duplicate, 4)).rejects.toMatchObject({ code: '23505' });
 expect((await query('select count(*)::int n from public.supportos_project_emails')).rows[0].n).toBe(2);
 expect((await query("select version from public.supportos_content_revisions where id='emails'")).rows[0].version).toBe(4);
 expect((await query('select id,data,version from public.supportos_shared_content order by id')).rows).toEqual([
  { id: 'bonus-tools', data: [], version: 3 }, { id: 'bonuses', data: [], version: 3 }, { id: 'emails', data: [], version: 3 },
 ]);
 await expect(query("select public.supportos_publish_content($1,'emails',3,'[]')", [admin])).rejects.toMatchObject({ code: '42501' });
});

it.each(['anon', 'authenticated'])('keeps normalized tables and both RPCs inaccessible to %s', async role => {
 await pg.exec(`set local role ${role}`);
 await expect(publish('emails', emails)).rejects.toMatchObject({ code: '42501' });
 await expect(query("select public.supportos_upsert_content_project('p','P','p')")).rejects.toMatchObject({ code: '42501' });
 await expect(query('select * from public.supportos_project_emails')).rejects.toMatchObject({ code: '42501' });
});

it('saves shared bind imports as service_role and preserves permissions, history and timestamp conflicts', async () => {
 const bind = { id: 'common', slug: 'common', expected: null, tags: [], translations: [{ language: 'ru', title: 'Ответ', content: 'Текст' }] };
 const save = rows => query('select public.supportos_import_common_binds($1,$2) n', [admin, JSON.stringify(rows)]);
 expect((await save([bind])).rows[0].n).toBe(1);
 const expected = (await query('select updated_at::text from public.supportos_binds where id=$1', [bind.id])).rows[0].updated_at;
 await expect(save([bind])).rejects.toMatchObject({ code: '40001' });
 expect((await save([{ ...bind, expected, tags: ['updated'] }])).rows[0].n).toBe(1);
 expect((await query('select tags from public.supportos_binds where id=$1', [bind.id])).rows[0].tags).toEqual(['updated']);
 expect((await query('select count(*)::int n from public.supportos_bind_history where source_id=$1', [bind.id])).rows[0].n).toBe(2);
 await expect(query('select public.supportos_import_common_binds($1,$2)', [support, JSON.stringify([{ ...bind, id: 'denied' }])])).rejects.toMatchObject({ code: '42501' });
});

it('uses predicate-scoped DELETEs compatible with the Supabase safe-update guard', async () => {
 const { definition } = (await query("select pg_get_functiondef('public.supportos_publish_normalized_content(uuid,text,integer,jsonb)'::regprocedure) definition")).rows[0];
 const deletes = definition.match(/delete\s+from\s+[^;]+;/gi) ?? [];
 expect(deletes.length).toBeGreaterThan(0);
 for (const statement of deletes) {
  expect(statement).toMatch(/\bwhere\b/i);
  expect(statement).not.toMatch(/\bwhere\s+(?:true|1\s*=\s*1)\b/i);
 }
 expect(definition).not.toMatch(/safeupdate|truncate/i);
});

it('updates email IDs in place, removes only omitted addresses and keeps the project catalog', async () => {
 await publish('emails', emails);
 const original = (await query("select created_at::text from public.supportos_project_emails where id='email-1'")).rows[0].created_at;
 const changed = [{ ...emails[0], emails: [{ ...emails[0].emails[0], type: 'Verification', email: 'new@example.com' }] }];
 await publish('emails', changed, 4);
 expect((await query('select id,type,email,created_at::text from public.supportos_project_emails')).rows).toEqual([{ id: 'email-1', type: 'Verification', email: 'new@example.com', created_at: original }]);
 await publish('emails', [], 5);
 expect((await query('select count(*)::int n from public.supportos_project_emails')).rows[0].n).toBe(0);
 expect((await query('select id from public.supportos_projects')).rows).toEqual([{ id: 'project-1' }]);
});

it('preserves bonus identity and removes omitted translations and bonuses', async () => {
 await publish('bonuses', bonuses);
 const original = (await query("select created_at::text from public.supportos_welcome_bonuses where id='bonus-1'")).rows[0].created_at;
 const changed = [{ ...bonuses[0], bonuses: [{ ...bonuses[0].bonuses[0], translations: [{ language: 'ru', content: 'Обновлено' }] }] }];
 await publish('bonuses', changed, 4);
 expect((await query('select id,created_at::text from public.supportos_welcome_bonuses')).rows).toEqual([{ id: 'bonus-1', created_at: original }]);
 expect((await query('select language,content from public.supportos_welcome_bonus_translations')).rows).toEqual([{ language: 'ru', content: 'Обновлено' }]);
 await publish('bonuses', [], 5);
 expect((await query('select count(*)::int n from public.supportos_welcome_bonus_translations')).rows[0].n).toBe(0);
});

it('retains currency table identity, replaces only its rows and removes omitted rules/tables', async () => {
 await publish('bonus-tools', tools);
 const original = (await query('select id,created_at::text from public.supportos_currency_tables')).rows[0];
 await publish('bonus-tools', [{ ...tools[0], rules: [{ ...rule, welcomeWager: 'x20' }] }], 4);
 expect((await query('select id,created_at::text from public.supportos_currency_tables')).rows).toEqual([original]);
 expect((await query('select welcome_wager from public.supportos_bonus_rules')).rows).toEqual([{ welcome_wager: 'x20' }]);
 await publish('bonus-tools', [{ ...tools[0], rules: [], currencyTables: [] }], 5);
 for (const table of ['supportos_bonus_rules', 'supportos_currency_tables', 'supportos_currency_rows', 'supportos_currency_values'])
  expect((await query(`select count(*)::int n from public.${table}`)).rows[0].n).toBe(0);
});

it.each([
 ['emails', [{ ...emails[0], emails: [emails[0].emails[0], emails[0].emails[0]] }]],
 ['bonuses', [{ ...bonuses[0], bonuses: [bonuses[0].bonuses[0], bonuses[0].bonuses[0]] }]],
 ['bonus-tools', [{ ...tools[0], rules: [rule, rule] }]],
 ['bonus-tools', [{ ...tools[0], currencyTables: [tools[0].currencyTables[0], { ...tools[0].currencyTables[0], name: 'currency' }] }]],
])('does not silently overwrite duplicate %s identities during reconciliation', async (dataset, payload) => {
 await expect(publish(dataset, payload)).rejects.toMatchObject({ code: '23505' });
 expect((await query('select version from public.supportos_content_revisions where id=$1', [dataset])).rows[0].version).toBe(3);
});
