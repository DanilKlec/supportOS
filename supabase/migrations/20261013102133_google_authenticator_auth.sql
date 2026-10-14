-- Deploy together with the Google Authenticator application. Existing accounts,
-- roles and audit history are retained. Legacy SQL names remain for compatibility
-- with already applied audit/RLS functions; they no longer prove Telegram access.
create function supportos_private.mfa_session_state(subject uuid,sid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (auth.uid() is not null and auth.uid()<>subject) or not supportos_private.session_live(subject,sid) then
  return jsonb_build_object('status','invalid_session');
 end if;
 if exists(select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
  where s.id=sid and s.user_id=subject and s.aal::text='aal2' and f.factor_type::text='totp' and f.status::text='verified') then
  return jsonb_build_object('status','approved');
 end if;
 return jsonb_build_object('status','mfa_required');
end $$;
revoke all on function supportos_private.mfa_session_state(uuid,uuid) from public,anon,authenticated;
grant execute on function supportos_private.mfa_session_state(uuid,uuid) to service_role;
create function public.supportos_mfa_session_state(subject uuid,sid uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select supportos_private.mfa_session_state(subject,sid); $$;
revoke all on function public.supportos_mfa_session_state(uuid,uuid) from public,anon,authenticated;
grant execute on function public.supportos_mfa_session_state(uuid,uuid) to service_role;
create or replace function public.supportos_tg_login_state(subject uuid,sid uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select supportos_private.mfa_session_state(subject,sid); $$;

-- Existing restrictive policies call this compatibility helper directly.
create or replace function supportos_private.telegram_session_approved() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal'='aal2',false)
  and coalesce(supportos_private.mfa_session_state(auth.uid(),(auth.jwt()->>'session_id')::uuid)->>'status'='approved',false);
$$;

-- Reuse the existing one-use, payload-bound permit storage and its audit triggers.
alter table public.supportos_telegram_critical_requests alter column telegram_id drop not null;
alter table public.supportos_telegram_critical_requests add column mfa_verified_at bigint;
create unique index supportos_critical_mfa_once on public.supportos_telegram_critical_requests(actor_id,session_id,mfa_verified_at) where mfa_verified_at is not null;
update public.supportos_telegram_critical_requests set status='expired' where status in ('pending','approved');
create or replace function supportos_private.critical_target(actor uuid,operation text,payload jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select case
 when operation in ('sessions.revoke_others') then actor::text
 when operation='user.create' then lower(trim(payload->>'email'))
 when operation in ('user.update','role.save','role.delete') then payload->>'id'
 end;
$$;
create or replace function supportos_private.critical_allowed(actor uuid,sid uuid,operation text,target text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb;
begin
 if (public.supportos_tg_login_state(actor,sid)->>'status') is distinct from 'approved' then return false; end if;
 ctx:=public.supportos_rbac_context(actor);
 if ctx->>'status' is distinct from 'active' then return false; end if;
 if operation in ('sessions.revoke_others') then
  return target=actor::text and (ctx->'permissions') ? 'work';
 elsif operation='user.update' then
  return (ctx->'permissions') ? 'users.manage' and target<>actor::text
   and exists(select 1 from public.supportos_users where id::text=target)
   and not exists(select 1 from public.supportos_user_roles where user_id::text=target and role_id='creator');
 elsif operation='user.create' then return (ctx->'permissions') ? 'users.manage';
 elsif operation in ('role.save','role.delete') then
  return (ctx->'permissions') ? 'roles.manage' and target ~ '^[a-z][a-z0-9_]{1,39}$' and target<>'creator'
   and not exists(select 1 from public.supportos_user_roles where user_id=actor and role_id=target);
 end if;
 return false;
end $$;
create or replace function public.supportos_mfa_critical_begin(actor uuid,sid uuid,operation text,payload jsonb,request_id uuid,
 verified_at bigint,permit_digest text,ip_digest text,agent text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target_id text; device jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('mfa-critical:'||actor,0));
 if verified_at is null or abs(extract(epoch from now())-verified_at)>60 then return jsonb_build_object('error','mfa_stale'); end if;
 if exists(select 1 from public.supportos_telegram_critical_requests where actor_id=actor and session_id=sid and mfa_verified_at=verified_at) then return jsonb_build_object('error','mfa_reused'); end if;
 target_id:=supportos_private.critical_target(actor,operation,payload);
 if target_id is null or not coalesce(supportos_private.critical_allowed(actor,sid,operation,target_id),false) then
  return jsonb_build_object('error','forbidden'); end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>8192 then return jsonb_build_object('error','invalid'); end if;
 if exists(select 1 from public.supportos_telegram_critical_requests where actor_id=actor and created_at>now()-interval '10 seconds')
 or (select count(*) from public.supportos_telegram_critical_requests where actor_id=actor and created_at>now()-interval '1 hour')>=10
 then return jsonb_build_object('error','rate_limit'); end if;

 device:=supportos_private.security_device(agent);
 update public.supportos_telegram_critical_requests set status='expired' where actor_id=actor and session_id=sid and status in ('pending','approved');
 insert into public.supportos_telegram_critical_requests(id,actor_id,session_id,action,target,payload_hash,challenge_hash,permit_hash,ip_hash,browser,os,status,mfa_verified_at)
 values(request_id,actor,sid,operation,target_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),encode(sha256(convert_to(request_id::text,'UTF8')),'hex'),permit_digest,ip_digest,device->>'browser',device->>'os','approved',verified_at);
 return jsonb_build_object('id',request_id,'status','approved','expiresAt',now()+interval '5 minutes','target',target_id);
end $$;
create or replace function public.supportos_critical_state(actor uuid,sid uuid,request_id uuid,cancel boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests;
begin
 select * into c from public.supportos_telegram_critical_requests where id=request_id and actor_id=actor and session_id=sid for update;
 if not found then return jsonb_build_object('error','invalid'); end if;
 if cancel and c.status in ('pending','approved') then
  update public.supportos_telegram_critical_requests set status='rejected',decided_at=now() where id=c.id; c.status:='rejected';
 elsif c.status in ('pending','approved') and (c.expires_at<=now()
  or not coalesce(supportos_private.critical_allowed(actor,sid,c.action,c.target),false)) then
  update public.supportos_telegram_critical_requests set status='expired' where id=c.id; c.status:='expired';
 end if;
 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at);
end $$;
create or replace function public.supportos_critical_execute(actor uuid,sid uuid,operation text,payload jsonb,request_id uuid,permit_digest text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests; result jsonb;
begin
 -- Same lock as RBAC: privileges are rechecked and consumption + mutation commit together.
 perform pg_advisory_xact_lock(71532841);
 select * into c from public.supportos_telegram_critical_requests where id=request_id for update;
 if not found or c.actor_id<>actor or c.session_id<>sid or c.action<>operation
  or c.target is distinct from supportos_private.critical_target(actor,operation,payload)
  or c.payload_hash<>encode(sha256(convert_to(payload::text,'UTF8')),'hex') or c.permit_hash is distinct from permit_digest
 then return jsonb_build_object('error','invalid'); end if;
 if c.status in ('consumed','completed') then return jsonb_build_object('error','processed'); end if;
 if c.status<>'approved' then return jsonb_build_object('error','not_approved'); end if;
 if c.expires_at<=now() or not coalesce(supportos_private.critical_allowed(actor,sid,operation,c.target),false)
 then update public.supportos_telegram_critical_requests set status='expired' where id=c.id; return jsonb_build_object('error','expired'); end if;
 update public.supportos_telegram_critical_requests set status='consumed',consumed_at=now() where id=c.id;
 if operation in ('user.update','role.save','role.delete') then
  result:=public.supportos_rbac_change(actor,operation,payload);
  update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
  return result;

 end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.supportos_critical_sessions_completed(actor uuid,sid uuid,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests;
begin
 select * into c from public.supportos_telegram_critical_requests where id=request_id and actor_id=actor and session_id=sid for update;
 if not found or c.action<>'sessions.revoke_others' or c.status<>'consumed'
 or not supportos_private.session_live(actor,sid) or supportos_private.other_sessions_exist(actor,sid)
 then return jsonb_build_object('error','not_completed'); end if;
 insert into public.supportos_login_events(user_id,session_id,event_type,event_ref,ip_hash,browser,os,telegram_result)
 values(actor,sid,'sessions_revoked','critical:'||c.id,c.ip_hash,c.browser,c.os,null) on conflict do nothing;
 update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.supportos_record_session_revoked(subject uuid,sid uuid,ip_digest text,agent text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare device jsonb;
begin
  if subject is null or sid is null or supportos_private.session_live(subject,sid) then
    return jsonb_build_object('error','not_revoked');
  end if;
  device:=supportos_private.security_device(left(agent,512));
  insert into public.supportos_login_events(user_id,session_id,event_type,ip_hash,browser,os,event_ref)
  values(subject,sid,'sessions_revoked',ip_digest,device->>'browser',device->>'os','logout:'||sid)
  on conflict(event_ref,event_type) do nothing;

  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.supportos_mfa_critical_begin(uuid,uuid,text,jsonb,uuid,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.supportos_mfa_critical_begin(uuid,uuid,text,jsonb,uuid,bigint,text,text,text) to service_role;
revoke all on function public.supportos_critical_begin(uuid,uuid,text,jsonb,uuid,text,text,text,text),public.supportos_critical_decide(text,bigint,text) from service_role;

-- Disable retired bot RPCs. Keep the state adapter used by existing RLS helpers.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'supportos_tg_%' and p.proname<>'supportos_tg_login_state' or p.proname like 'supportos_password_%')
 loop execute format('revoke execute on function %s from public,anon,authenticated,service_role',f.signature); end loop;
end $$;

-- Remove our old bot guard; Supabase Auth now owns password authorization,
-- including its own MFA check. Only the application-owned trigger is removed.
drop trigger if exists supportos_password_telegram_guard on auth.users;
create function supportos_private.record_auth_password_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare reference text := 'auth-password:'||gen_random_uuid();
begin
 insert into public.supportos_login_events(user_id,event_type,event_ref) values(new.id,'password_changed',reference);
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
 values(new.id,(select email from public.supportos_users where id=new.id),'password.change',new.id::text,
  jsonb_build_object('source','supabase_auth'),jsonb_build_object('changed',true),reference);
 return null;
end $$;
revoke all on function supportos_private.record_auth_password_change() from public,anon,authenticated,service_role;
create trigger supportos_auth_password_history after update of encrypted_password on auth.users
 for each row when(old.encrypted_password is distinct from new.encrypted_password) execute function supportos_private.record_auth_password_change();

create function public.supportos_record_mfa_login(subject uuid,sid uuid,ip_digest text,agent text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare device jsonb;
begin
 if public.supportos_mfa_session_state(subject,sid)->>'status' is distinct from 'approved' then return jsonb_build_object('error','invalid_session'); end if;
 device:=supportos_private.security_device(left(agent,512));
 insert into public.supportos_login_events(user_id,session_id,event_type,event_ref,ip_hash,browser,os)
 values(subject,sid,'login_approved','mfa-login:'||sid,ip_digest,device->>'browser',device->>'os') on conflict do nothing;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.supportos_record_mfa_login(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.supportos_record_mfa_login(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
