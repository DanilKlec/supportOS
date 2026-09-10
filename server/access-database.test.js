import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('uses current server roles for RLS, prevents escalation and isolates personal records',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const sql=await readFile(new URL('../supabase/access-control.sql',import.meta.url),'utf8');await pg.exec(sql);await pg.exec(sql);
 const id='11111111-1111-4111-8111-111111111111';
 await pg.query('insert into auth.users values($1,$2)',[id,JSON.stringify({role:'support'})]);
 await pg.exec(`insert into supportos_categories(id,name) values('shared','Shared');set role authenticated;set request.jwt.claim.sub='${id}';`);
 expect((await pg.query('select * from supportos_categories')).rows).toHaveLength(1);
 await expect(pg.exec("insert into supportos_categories(id,name) values('bad','Bad')")).rejects.toThrow();
 await pg.query('insert into supportos_categories(id,name,owner_id) values($1,$2,$3)',['own','Own',id]);
 await expect(pg.exec("update supportos_categories set owner_id=null where id='own'")).rejects.toThrow();
 for(const role of ['shift','qc','admin','creator']){
  await pg.exec('reset role');await pg.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify({role}),id]);await pg.exec('set role authenticated');
  await pg.query('update supportos_categories set name=$1 where id=$2',[role,'shared']);
  expect((await pg.query("select name from supportos_categories where id='shared'")).rows[0].name).toBe(role);
 }
 await pg.exec('reset role');await pg.query('update auth.users set raw_app_meta_data=$1',[JSON.stringify({role:'creator',disabled:true})]);await pg.exec('set role authenticated');
 expect((await pg.query('select * from supportos_categories')).rows).toHaveLength(0);
 }finally{await pg.close();}
},30000);
