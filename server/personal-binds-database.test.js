import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('isolates personal copies, protects common originals and audits manager edits with conflicts',async()=>{
 const pg=new PGlite();const admin='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
 try {
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const [id,role] of [[admin,'admin'],[a,'support'],[b,'support']])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${role}@example.com`,JSON.stringify({role})]);
 await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await pg.exec(`insert into supportos_binds(id,slug,category_id,translations) values('common','common','shared','[{"language":"ru","title":"Base","content":"Original"}]');`);
 const change=async(actor,target,operation,payload)=>(await pg.query('select supportos_personal_bind_change($1,$2,$3,$4,$5) value',[actor,target,'common',operation,JSON.stringify(payload)])).rows[0].value;
 const payload={translations:[{language:'ru',title:'My answer',content:'Personal text'}],tags:['test'],expected:null};
 const own=await change(a,a,'save',payload);
 expect(own.owner_id).toBe(a);expect(own.source_bind_id).toBe('common');
 await expect(change(a,b,'save',payload)).rejects.toThrow('Нет права');
 await expect(change(a,a,'save',payload)).rejects.toThrow('уже изменена');
 const managed=await change(admin,a,'save',{...payload,expected:own.updated_at,translations:[{language:'ru',title:'Reviewed',content:'Correct text'}]});
 expect(managed.id).toBe(own.id);
 await pg.exec(`set role authenticated;set request.jwt.claim.sub='${b}';`);
 expect((await pg.query('select id from supportos_binds')).rows).toEqual([{id:'common'}]);
 expect((await pg.query("update supportos_binds set slug='bad' where id='common' returning id")).rows).toEqual([]);
 await expect(change(b,b,'save',payload)).rejects.toThrow('permission denied');
 await pg.exec('reset role');
 await change(a,a,'reset',{expected:managed.updated_at});
 expect((await pg.query('select id from supportos_binds')).rows).toEqual([{id:'common'}]);
 expect((await pg.query('select count(*)::int n from supportos_access_audit')).rows[0].n).toBe(3);
 await pg.query("delete from supportos_role_permissions where role_id='admin' and permission_id='binds.manage'");
 await expect(change(admin,b,'save',payload)).rejects.toThrow('Нет права');
 }finally{await pg.close();}
},30000);
