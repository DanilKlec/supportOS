import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {validContent} from './validation.js';
it('validates shared documents and bind imports',()=>{
 expect(validContent('emails',[{id:'a',slug:'a',projectName:'A',supportEmail:'a@b.com',kycEmail:'',vipEmail:''}])).toBe(true);
 expect(validContent('emails',[{id:'a',slug:'a',projectName:'A',supportEmail:'bad',kycEmail:'',vipEmail:''}])).toBe(false);
 expect(validContent('bonuses',[{id:'a',slug:'a',name:'A',bonuses:[{id:'b',name:'B',content:'Text',order:0}]}])).toBe(true);
 expect(validContent('binds',[{id:'a',slug:'a',expected:null,tags:[],translations:[{language:'ru',title:'Title',content:''}]}])).toBe(false);
});
it('publishes with current permissions, conflicts, atomic imports and audit',async()=>{
 const pg=new PGlite();const admin='11111111-1111-4111-8111-111111111111',support='22222222-2222-4222-8222-222222222222';
 try {
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const [id,role] of [[admin,'admin'],[support,'support']])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${role}@example.com`,JSON.stringify({role})]);
 await pg.exec(await readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
 const save=async(actor,expected)=>(await pg.query("select supportos_publish_content($1,'emails',$2,'[]') value",[actor,expected])).rows[0].value;
 await expect(save(support,0)).rejects.toThrow('Нет права');
 expect((await save(admin,0)).version).toBe(1);
 await expect(save(admin,0)).rejects.toThrow('уже изменены');
 expect((await save(admin,1)).version).toBe(2);
 const bind={id:'common',slug:'common',expected:null,tags:[],translations:[{language:'ru',title:'A',content:'B'}]};
 const publish=async(actor,rows)=>pg.query('select supportos_import_common_binds($1,$2)',[actor,JSON.stringify(rows)]);
 await expect(publish(support,[bind])).rejects.toThrow('Нет права');
 await publish(admin,[bind]);
 await expect(publish(admin,[{...bind,id:'duplicate'}])).rejects.toThrow('slug уже опубликован');
 await expect(publish(admin,[{...bind,id:'new',slug:'new'},bind])).rejects.toThrow('база изменилась');
 expect((await pg.query('select id from supportos_binds')).rows).toEqual([{id:'common'}]);
 await pg.exec(`set role authenticated;set request.jwt.claim.sub='${support}';`);
 await expect(pg.query('select * from supportos_shared_content')).rejects.toThrow('permission denied');
 await expect(save(support,2)).rejects.toThrow('permission denied');
 await pg.exec('reset role');
 expect((await pg.query('select count(*)::int n from supportos_access_audit')).rows[0].n).toBe(3);
 const mine=async(id,expected,operation='save')=>(await pg.query("select supportos_save_personal_content($1,'bonuses',$2,'[{\"id\":\"mine\"}]',$3) value",[id,expected,operation])).rows[0].value;
 expect((await mine(support,0)).owner_id).toBe(support);
 await expect(mine(support,0)).rejects.toThrow('Личная версия изменилась');
 expect((await mine(admin,0)).owner_id).toBe(admin);
 expect((await pg.query('select count(*)::int n from supportos_personal_content')).rows[0].n).toBe(2);
 await expect(pg.query("select supportos_save_personal_content($1,'emails',0,'[]','save')",[support])).rejects.toThrow('Некорректный справочник');
 await pg.exec('set role authenticated');
 await expect(mine(support,1)).rejects.toThrow('permission denied');
 await expect(pg.query('select * from supportos_personal_content')).rejects.toThrow('permission denied');
 await pg.exec('reset role');
 await mine(support,1,'reset');
 expect((await pg.query('select owner_id from supportos_personal_content')).rows).toEqual([{owner_id:admin}]);
 await pg.exec("delete from supportos_role_permissions where role_id='admin' and permission_id='projects.write'");
 await expect(save(admin,2)).rejects.toThrow('Нет права');
 await pg.exec(await readFile(new URL('../../supabase/shared-content.sql',import.meta.url),'utf8'));
 await expect(save(admin,2)).rejects.toThrow('Нет права');
 } finally {await pg.close();}
},30000);

it('publishes normalized content atomically without changing the legacy document',async()=>{
 const pg=new PGlite();const admin='11111111-1111-4111-8111-111111111111';
 try {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[admin,'admin@example.com',JSON.stringify({role:'admin'})]);
  await pg.exec(await readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/20260925031553_normalized_support_content.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/20260925050000_normalized_content_crud.sql',import.meta.url),'utf8'));
  await pg.exec('set role service_role');
  await expect(pg.query("insert into supportos_shared_content(id,data) values('emails','[]')")).rejects.toThrow('permission denied');
  await pg.exec('reset role');
  const payload=[{id:'project-1',projectName:'Example',slug:'example',emails:[{id:'email-1',type:'Support',email:'help@example.com'}]}];
  const publish=async(expected,data=payload)=>(await pg.query("select supportos_publish_normalized_content($1,'emails',$2,$3) value",[admin,expected,JSON.stringify(data)])).rows[0].value;
  const saved=await publish(0);
  expect(saved).toMatchObject({id:'emails',version:1,data:payload});
  expect((await pg.query('select type,email from supportos_project_emails')).rows).toEqual([{type:'Support',email:'help@example.com'}]);
  expect((await pg.query('select count(*)::int count from supportos_shared_content')).rows[0].count).toBe(0);
  await expect(publish(0,[])).rejects.toThrow('уже изменены');
  expect((await pg.query('select count(*)::int count from supportos_project_emails')).rows[0].count).toBe(1);
  expect((await publish(1,[])).version).toBe(2);
  expect((await pg.query('select count(*)::int count from supportos_project_emails')).rows[0].count).toBe(0);
  const bonusPayload=[{id:'project-1',name:'Example',slug:'example',bonuses:[{id:'bonus-1',name:'Welcome',content:'Текст',translations:[{language:'ru',content:'Текст'}],order:0}]}];
  const bonus=(await pg.query("select supportos_publish_normalized_content($1,'bonuses',0,$2) value",[admin,JSON.stringify(bonusPayload)])).rows[0].value;
  expect(bonus.version).toBe(1);
  expect((await pg.query('select content from supportos_welcome_bonus_translations')).rows).toEqual([{content:'Текст'}]);
  const brokenTools=[{id:'rules',slug:'rules',sourceUrl:'https://example.com',loadedAt:'2026-09-25T10:00:00Z',warnings:[],currencyTables:[],rules:[
   {id:'duplicate',group:'A',site:'Example',welcomeWager:'',welcomeMaxWin:'',noDeposit:'',retentionWager:'',retentionMaxWin:'',events:'',map:'',note:'',searchText:''},
   {id:'duplicate',group:'B',site:'Example',welcomeWager:'',welcomeMaxWin:'',noDeposit:'',retentionWager:'',retentionMaxWin:'',events:'',map:'',note:'',searchText:''},
  ]}];
  await expect(pg.query("select supportos_publish_normalized_content($1,'bonus-tools',0,$2)",[admin,JSON.stringify(brokenTools)])).rejects.toThrow('duplicate key');
  expect((await pg.query('select count(*)::int count from supportos_bonus_rules')).rows[0].count).toBe(0);
  expect((await pg.query("select count(*)::int count from supportos_content_revisions where id='bonus-tools'")).rows[0].count).toBe(0);
  const toolsPayload=[{...brokenTools[0],warnings:['Проверить источник'],rules:[brokenTools[0].rules[0]],currencyTables:[{name:'Currency',currencies:['EUR'],rows:[{base:'10 EUR',baseAmount:10,values:{EUR:'10 EUR'}}]}]}];
  const tools=(await pg.query("select supportos_publish_normalized_content($1,'bonus-tools',0,$2) value",[admin,JSON.stringify(toolsPayload)])).rows[0].value;
  expect(tools.version).toBe(1);
  expect((await pg.query("select metadata->'warnings' warnings from supportos_content_revisions where id='bonus-tools'")).rows[0].warnings).toEqual(['Проверить источник']);
  expect((await pg.query('select count(*)::int count from supportos_currency_values')).rows[0].count).toBe(1);
 } finally {await pg.close();}
},30000);
