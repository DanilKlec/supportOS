import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {safeKnowledgeTopic} from '../shared/knowledge-gap.js';
it('rejects identifiers and credentials without returning their contents',()=>{
 for(const value of ['user@example.com','+37312345678','https://example.com','пароль секрет','token abcd','номер 123456','a'.repeat(121),'Имя / счёт'])expect(safeKnowledgeTopic(value)).toBeNull();
 expect(safeKnowledgeTopic('  Условия   вывода бонуса ')).toBe('условия вывода бонуса');
});
it('isolates feedback, toggles once per user, and denies direct writes and blocked users',async()=>{
 const pg=new PGlite();const actor='11111111-1111-4111-8111-111111111111';const other='22222222-2222-4222-8222-222222222222';
 try{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const id of [actor,other])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,'support@example.com',JSON.stringify({role:'support'})]);
 await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../supabase/migrations/20260912194913_knowledge_signals.sql',import.meta.url),'utf8');await pg.exec(sql);await pg.exec(sql);
 await pg.exec("insert into supportos_categories(id,name) values('test','Test');insert into supportos_binds(id,slug,category_id) values('test','test','test');");
 const call=async(who,operation,payload)=>(await pg.query('select supportos_knowledge_signal($1,$2,$3) value',[who,operation,JSON.stringify(payload)])).rows[0].value;
 expect(await call(actor,'feedback',{bindId:'test',kind:'helpful'})).toEqual({kind:'helpful'});
 expect(await call(actor,'feedback',{bindId:'test',kind:'helpful'})).toEqual({kind:null});
 await call(actor,'feedback',{bindId:'test',kind:'outdated'});await call(other,'feedback',{bindId:'test',kind:'helpful'});
 await expect(call(actor,'gap',{topic:'customer@example.com'})).rejects.toThrow();
 await call(actor,'gap',{topic:'bonus withdrawal'});
 await pg.exec(`set role authenticated;set request.jwt.claim.sub='${actor}';`);
 expect((await pg.query('select * from supportos_bind_feedback')).rows).toHaveLength(1);
 expect((await pg.query('select * from supportos_knowledge_gaps')).rows).toHaveLength(0);
 await expect(pg.exec("insert into supportos_bind_feedback(bind_id,user_id,kind) values('test','22222222-2222-4222-8222-222222222222','outdated')")).rejects.toThrow();
 await pg.exec('reset role');await pg.query("update supportos_users set status='disabled' where id=$1",[actor]);
 await expect(call(actor,'feedback',{bindId:'test',kind:'helpful'})).rejects.toThrow('Нет доступа');
 }finally{await pg.close();}
},30000);

