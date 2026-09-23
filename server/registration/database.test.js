import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
it('enforces proof expiry, single Telegram ownership, atomic claims and service-only access',async()=>{
 const pg=new PGlite();try{
 await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 await pg.exec(await readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../../supabase/migrations/20260923081810_telegram_registration.sql',import.meta.url),'utf8');await pg.exec(sql);
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const rpc=async(name,params)=>(await pg.query(`select ${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) value`,params)).rows[0].value;
 const begin=(uid,login,b,s,ip='ip')=>rpc('supportos_tg_begin',[uid,login,b.repeat(64),s.repeat(64),ip]);
 expect(await begin(id,'operator','a','b')).toHaveProperty('expiresAt');
 expect(await rpc('supportos_tg_claim',['a'.repeat(64)])).toEqual({error:'not_verified'});
 expect(await rpc('supportos_tg_confirm',['b'.repeat(64),123,'username'])).toMatchObject({ok:true});
 expect(await rpc('supportos_tg_confirm',['b'.repeat(64),456,'other'])).toEqual({error:'already_linked'});
 expect(await rpc('supportos_tg_claim',['b'.repeat(64)])).toEqual({error:'expired'});
 expect(await rpc('supportos_tg_claim',['a'.repeat(64)])).toMatchObject({id,telegram_id:123,completed:false});
 expect(await rpc('supportos_tg_finish',[id])).toBe(false);
 await pg.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[id,'operator@telegram.supportos.invalid',JSON.stringify({telegram_registration:id})]);
 expect(await rpc('supportos_tg_finish',[id])).toBe(true);
 expect(await rpc('supportos_rbac_context',[id])).toMatchObject({status:'pending',roles:[],permissions:[],display_name:'operator'});
 expect(await rpc('supportos_tg_claim',['a'.repeat(64)])).toMatchObject({completed:true});
 expect(await begin(other,'operator','c','d')).toEqual({error:'login_taken'});
 await begin(other,'another','c','d');
 expect(await rpc('supportos_tg_confirm',['d'.repeat(64),123,'username'])).toEqual({error:'already_registered'});
 await pg.exec("update public.supportos_telegram_registration set expires_at=now()-interval '1 second' where login='another'");
 expect(await rpc('supportos_tg_confirm',['d'.repeat(64),456,'other'])).toEqual({error:'expired'});
 await pg.exec('set role anon');await expect(pg.query('select * from public.supportos_telegram_registration')).rejects.toThrow('permission denied');await expect(rpc('supportos_tg_claim',['a'.repeat(64)])).rejects.toThrow('permission denied');
 await pg.exec('reset role;set role authenticated');await expect(rpc('supportos_tg_confirm',['b'.repeat(64),123,'forged'])).rejects.toThrow('permission denied');
 await pg.exec('reset role');await pg.exec(sql);
 expect(await rpc('supportos_rbac_context',[id])).toMatchObject({status:'pending',permissions:[]});
 } finally {await pg.close();}
},30000);
