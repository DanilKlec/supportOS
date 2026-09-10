import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
const ids={admin:'11111111-1111-4111-8111-111111111111',support:'22222222-2222-4222-8222-222222222222',owner:'33333333-3333-4333-8333-333333333333'};
it('migrates existing roles once, enforces transactional RBAC and logs changes',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const [name,id] of Object.entries(ids))await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${name}@example.com`,JSON.stringify({role:name==='owner'?'creator':name})]);
 const sql=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');await pg.exec(sql);
 const context=async(id)=>(await pg.query('select supportos_rbac_context($1) as value',[id])).rows[0].value;
 const change=async(actor,operation,payload)=>(await pg.query('select supportos_rbac_change($1,$2,$3) as value',[actor,operation,JSON.stringify(payload)])).rows[0].value;
 expect((await context(ids.admin)).roles.map(r=>r.id)).toEqual(['admin']);
 expect((await context(ids.support)).permissions).not.toContain('monitor.read');
 const update={id:ids.support,display_name:'Employee',status:'active',roles:['shift','qc'],version:1};
 await change(ids.admin,'user.update',update);
 expect((await context(ids.support)).roles.map(r=>r.id)).toEqual(['qc','shift']);
 expect((await context(ids.support)).permissions).toContain('ai.train');
 expect((await pg.query('select count(*)::int n from supportos_access_audit')).rows[0].n).toBe(1);
 await expect(change(ids.admin,'user.update',update)).rejects.toThrow('Данные изменились');
 await expect(change(ids.admin,'user.update',{...update,version:2,roles:['creator']})).rejects.toThrow('выше собственных');
 await expect(change(ids.admin,'user.update',{...update,id:ids.admin,roles:['creator']})).rejects.toThrow('Свою роль');
 await expect(change(ids.admin,'role.save',{id:'custom',name:'Custom',permissions:['technical'],version:0})).rejects.toThrow('Технические права');
 await change(ids.admin,'role.save',{id:'reviewer',name:'Reviewer',permissions:['work','binds.read'],version:0});
 await change(ids.admin,'user.update',{...update,version:2,roles:['reviewer']});
 await expect(change(ids.admin,'role.delete',{id:'reviewer',version:1})).rejects.toThrow('неиспользуемую');
 await change(ids.admin,'role.save',{id:'reviewer',name:'Reviewer',permissions:['work','monitor.read'],version:1});
 expect((await context(ids.support)).permissions).toEqual(['monitor.read','work']);
 await pg.exec(sql); // Must not restore defaults or add old metadata roles.
 expect((await context(ids.support)).roles.map(r=>r.id)).toEqual(['reviewer']);
 expect((await context(ids.support)).permissions).toEqual(['monitor.read','work']);
 await change(ids.admin,'user.update',{...update,version:3,roles:['reviewer'],status:'disabled'});
 expect((await context(ids.support)).permissions).toEqual([]);
 await pg.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify({role:'creator'}),ids.support]);
 expect((await context(ids.support)).permissions).toEqual([]);
 await pg.exec(`set role authenticated;set request.jwt.claim.sub='${ids.support}';`);
 expect((await pg.query("select supportos_access('monitor.read') allowed")).rows[0].allowed).toBe(false);
 await expect(pg.query('select supportos_rbac_context($1)',[ids.admin])).rejects.toThrow('permission denied');
 await expect(pg.query("insert into supportos_user_roles(user_id,role_id) values($1,'creator')",[ids.support])).rejects.toThrow('permission denied');
 await expect(change(ids.admin,'user.update',{...update,version:4})).rejects.toThrow('permission denied');
 await pg.exec('reset role');
 const newId='44444444-4444-4444-8444-444444444444';await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[newId,'new@example.com',JSON.stringify({role:'creator'})]);
 expect(await context(newId)).toMatchObject({status:'pending',roles:[],permissions:[]});
 }finally{await pg.close();}
},30000);
