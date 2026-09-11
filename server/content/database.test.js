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
 await pg.exec("delete from supportos_role_permissions where role_id='admin' and permission_id='projects.write'");
 await expect(save(admin,2)).rejects.toThrow('Нет права');
 await pg.exec(await readFile(new URL('../../supabase/shared-content.sql',import.meta.url),'utf8'));
 await expect(save(admin,2)).rejects.toThrow('Нет права');
 } finally {await pg.close();}
},30000);
