import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('exposes only safe own-session metadata through the service-only RPC', async () => {
 const pg = new PGlite();
 const user = '11111111-1111-4111-8111-111111111111';
 const otherUser = '22222222-2222-4222-8222-222222222222';
 const current = '33333333-3333-4333-8333-333333333333';
 const another = '44444444-4444-4444-8444-444444444444';
 const foreign = '55555555-5555-4555-8555-555555555555';
 const expired = '66666666-6666-4666-8666-666666666666';
 const removed = '77777777-7777-4777-8777-777777777777';
 try {
  await pg.exec(`
   create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create schema supportos_private;
   grant usage on schema auth to anon, authenticated, service_role;
   grant usage on schema supportos_private to authenticated, service_role;
   create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
   $$;
   create table auth.sessions (
    id uuid primary key, user_id uuid not null, created_at timestamptz,
    updated_at timestamptz, refreshed_at timestamp, user_agent text,
    not_after timestamptz, ip inet, refresh_token_hmac_key text,
    refresh_token_counter bigint
   );
  `);
  await pg.exec(await readFile(new URL('../../supabase/migrations/20261007184859_active_user_sessions.sql', import.meta.url), 'utf8'));
  await pg.query(`insert into auth.sessions(id,user_id,created_at,updated_at,refreshed_at,user_agent,ip,refresh_token_hmac_key,refresh_token_counter)
   values ($1,$2,'2026-10-01T09:00:00Z','2026-10-02T10:00:00Z','2026-10-02 10:00:00','Synthetic browser','192.0.2.1','synthetic-secret',1),
   ($3,$2,null,null,null,null,null,null,null),($4,$5,null,null,null,'Foreign browser',null,null,null),
   ($6,$2,null,null,null,'Expired browser',null,null,null)`, [current,user,another,foreign,otherUser,expired]);
  await pg.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [expired]);
  await pg.exec("set timezone='Europe/Bucharest'; set role service_role");
  const rpc = async (subject=user,sid=current) => (await pg.query('select public.supportos_list_own_sessions($1,$2) value', [subject,sid])).rows[0].value;
  const result = await rpc();
  expect(result.sessions.map(s => s.id)).toEqual([current,another]);
  expect(result.sessions[0]).toMatchObject({id:current,is_current:true,user_agent:'Synthetic browser'});
  expect(new Date(result.sessions[0].refreshed_at).toISOString()).toBe('2026-10-02T10:00:00.000Z');
  expect(result.sessions[1]).toEqual({id:another,created_at:null,updated_at:null,refreshed_at:null,user_agent:null,is_current:false});
  expect(Object.keys(result.sessions[0]).sort()).toEqual(['created_at','id','is_current','refreshed_at','updated_at','user_agent']);
  expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|192\.0\.2\.1|refresh_token|user_id|Foreign browser|Expired browser/);
  expect(await rpc(user,foreign)).toEqual({error:'invalid_session'});
  expect(await rpc(otherUser,current)).toEqual({error:'invalid_session'});
  expect(await rpc(user,expired)).toEqual({error:'invalid_session'});
  expect(await rpc(user,removed)).toEqual({error:'invalid_session'});
  expect(await rpc(user,null)).toEqual({error:'invalid_session'});
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [otherUser]);
  expect(await rpc()).toEqual({error:'invalid_session'});
  await pg.exec("select set_config('request.jwt.claim.sub','',false)");
  await expect(pg.query('select id from auth.sessions')).rejects.toThrow('permission denied');
  await pg.exec('reset role');
  for (const role of ['anon','authenticated']) {
   await pg.exec(`set role ${role}`);
   await expect(rpc()).rejects.toThrow('permission denied');
   await expect(pg.query('select supportos_private.list_own_sessions($1,$2)', [user,current])).rejects.toThrow('permission denied');
   await expect(pg.query('select id from auth.sessions')).rejects.toThrow('permission denied');
   await pg.exec('reset role');
  }
  // A deletion by Auth (revocation) is authoritative on the next request.
  await pg.query('delete from auth.sessions where id=$1', [current]);
  await pg.exec('set role service_role');
  expect(await rpc()).toEqual({error:'invalid_session'});
 } finally {
  await pg.close();
 }
}, 30000);
