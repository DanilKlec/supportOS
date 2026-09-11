import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('isolates shared branches, revokes access and protects publication and history',async()=>{
 const pg=new PGlite();const admin='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
 try {
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 for(const [id,role] of [[admin,'admin'],[a,'support'],[b,'support']])await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,`${id}@example.com`,JSON.stringify({role})]);
 await pg.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await pg.exec(`insert into supportos_binds(id,slug,category_id,translations) values('common','common','shared','[{"language":"ru","title":"Base","content":"Original"}]');`);

 const action=async(actor,operation,payload={})=>(await pg.query('select supportos_bind_branch_action($1,$2,$3) value',[actor,operation,JSON.stringify(payload)])).rows[0].value;
 const sourceId='common';
 await pg.query("select supportos_personal_bind_change($1,$1,'common','save',$2)",[a,JSON.stringify({translations:[{language:'ru',title:'Private',content:'My text'}],tags:[],expected:null})]);
 const share=await action(a,'share',{sourceId,email:`${b}@example.com`});
 expect((await action(b,'list')).incoming).toHaveLength(1);
 expect((await action(admin,'list')).incoming).toHaveLength(0);
 await expect(action(admin,'choose',{sourceId,branch:share.id})).rejects.toThrow('Ветка недоступна');
 await action(b,'choose',{sourceId,branch:share.id});
 expect((await action(b,'list')).choices.common).toBe(share.id);
 expect((await action(b,'history',{sourceId})).every(h=>h.owner_id===null)).toBe(true);
 expect((await action(a,'history',{sourceId})).some(h=>h.owner_id===a)).toBe(true);
 await expect(action(b,'revoke',{shareId:share.id})).rejects.toThrow('Нет доступа');
 await action(a,'revoke',{shareId:share.id});
 expect((await action(b,'list')).incoming).toHaveLength(0);
 expect((await action(b,'list')).choices.common).toBeUndefined();
 await expect(action(b,'choose',{sourceId,branch:share.id})).rejects.toThrow('Ветка недоступна');
 const expected=(await pg.query("select updated_at::text t from supportos_binds where id='common'")).rows[0].t;
 const proposal=await action(a,'propose',{sourceId,expected});
 expect(await action(b,'proposals')).toEqual([]);
 await expect(action(a,'accept',{proposalId:proposal.id})).rejects.toThrow('Нет права');
 await action(admin,'accept',{proposalId:proposal.id});
 expect((await pg.query("select translations from supportos_binds where id='common'")).rows[0].translations[0].content).toBe('My text');
 await expect(action(admin,'accept',{proposalId:proposal.id})).rejects.toThrow('уже обработано');
 const latest=(await pg.query("select updated_at::text t from supportos_binds where id='common'")).rows[0].t;
 const stale=await action(a,'propose',{sourceId,expected:latest});
 await pg.exec("update supportos_binds set updated_at=clock_timestamp() where id='common'");
 await expect(action(admin,'accept',{proposalId:stale.id})).rejects.toThrow('Основная версия изменилась');
 await action(a,'withdraw',{proposalId:stale.id});
 await pg.exec('set role authenticated');
 await expect(action(a,'list')).rejects.toThrow('permission denied');
 await expect(pg.query('select * from supportos_bind_history')).rejects.toThrow('permission denied');
 await expect(pg.query('select * from supportos_bind_shares')).rejects.toThrow('permission denied');
 }finally{await pg.close();}
},30000);
