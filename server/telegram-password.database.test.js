import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
it('requires atomic Telegram permission for Auth password changes, denies bypass/replay and revokes sessions',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema supportos_private;create table auth.users(id uuid primary key,email text,encrypted_password text,raw_app_meta_data jsonb default '{}',is_anonymous boolean default false);create table auth.sessions(id uuid primary key,user_id uuid);create table public.supportos_users(id uuid,email text);create table public.supportos_telegram_registration(id uuid,telegram_id bigint,telegram_username text,verified_at timestamptz,completed_at timestamptz);create table public.supportos_telegram_links(user_id uuid primary key,telegram_id bigint,telegram_username text,verified_at timestamptz,source text);create function public.supportos_tg_login_state(uuid,uuid) returns jsonb language sql as $$select '{\"status\":\"approved\"}'::jsonb$$;");
  await pg.exec(await readFile(new URL('../supabase/migrations/20260923194400_telegram_password_confirmation.sql',import.meta.url),'utf8'));
  const user=randomUUID(),sid=randomUUID();
  await pg.query("insert into auth.users(id,email,encrypted_password) values($1,'user@example.test','original')",[user]);
  await pg.query('insert into auth.sessions values($1,$2)',[sid,user]);
  await pg.query('insert into public.supportos_telegram_links(user_id,telegram_id) values($1,123)',[user]);
  const rpc=async(name,args)=>(await pg.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  await expect(pg.query("update auth.users set encrypted_password='bypass' where id=$1",[user])).rejects.toThrow('Telegram confirmation');
  await pg.query('insert into public.supportos_users(id,email) select id,email from auth.users');
  const begin=(browser,challenge,email='user@example.test')=>rpc('supportos_password_begin',[randomUUID(),null,null,email,email,'ip',browser,challenge]);
  expect(await begin('browser','challenge')).toMatchObject({status:'pending'});
  expect(await begin('browser2','challenge2')).toEqual({error:'rate_limit'});
  expect(await rpc('supportos_password_claim',['browser','permit'])).toEqual({error:'invalid'});
  expect(await rpc('supportos_password_decide',['challenge',999,true])).toBe(false);
  expect(await rpc('supportos_password_decide',['challenge',123,true])).toBe(true);
  expect(await rpc('supportos_password_decide',['challenge',123,true])).toBe(false);
  const proof='server-only-random-secret';
  expect(await rpc('supportos_password_claim',['browser',createHash('sha256').update(proof).digest('hex')])).toEqual({userId:user});
  expect(await rpc('supportos_password_claim',['browser','another'])).toEqual({error:'invalid'});
  // An approved/claimed request does not open a time window for arbitrary Auth calls.
  await expect(pg.query("update auth.users set encrypted_password='bypass' where id=$1",[user])).rejects.toThrow('Telegram confirmation');
  await pg.exec('begin');
  await pg.query("update auth.users set encrypted_password='newhash' where id=$1",[user]);
  // Mirrors GoTrue: password first, app metadata second, then COMMIT.
  await pg.query("update auth.users set raw_app_meta_data=jsonb_build_object('supportos_password_permit',$2::text,'provider','email') where id=$1",[user,proof]);
  await pg.exec('commit');
  expect((await pg.query('select encrypted_password,raw_app_meta_data from auth.users where id=$1',[user])).rows[0]).toEqual({encrypted_password:'newhash',raw_app_meta_data:{provider:'email'}});
  expect((await pg.query('select * from auth.sessions')).rows).toHaveLength(0);
  expect((await pg.query('select status,permit_hash from public.supportos_password_requests')).rows[0]).toEqual({status:'completed',permit_hash:null});
  await expect(pg.query("update auth.users set encrypted_password='replay',raw_app_meta_data=jsonb_build_object('supportos_password_permit',$2::text) where id=$1",[user,proof])).rejects.toThrow('Telegram confirmation');
  expect(await begin('missing','missing','missing@example.test')).toMatchObject({status:'pending'});
  expect(await rpc('supportos_password_decide',['missing',123,true])).toBe(false);
  await pg.exec("update public.supportos_password_requests set created_at=now()-interval '2 minutes'");
  await begin('expired','expired');
  await pg.exec("update public.supportos_password_requests set expires_at=now()-interval '1 second' where browser_hash='expired'");
  expect(await rpc('supportos_password_decide',['expired',123,true])).toBe(false);
  await pg.exec('set role authenticated');
  await expect(pg.query('select * from public.supportos_password_requests')).rejects.toThrow('permission denied');
  await expect(rpc('supportos_password_claim',['browser','permit'])).rejects.toThrow('permission denied');
 } finally { await pg.close(); }
},30000);


