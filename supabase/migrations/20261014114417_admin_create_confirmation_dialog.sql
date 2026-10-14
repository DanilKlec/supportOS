-- Password changes and deletion use the administrator's live application
-- session and RBAC. They no longer require a separate TOTP challenge.
create or replace function supportos_private.critical_allowed(actor uuid,sid uuid,operation text,target text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; state jsonb;
begin
 state:=public.supportos_mfa_session_state(actor,sid);
 if state->>'status' is distinct from 'approved' then return false; end if;
 if operation not in ('user.password','user.delete','user.create') and state->>'mfaEnabled' is distinct from 'true' then return false; end if;
 ctx:=public.supportos_rbac_context(actor);
 if ctx->>'status' is distinct from 'active' then return false; end if;
 if operation='sessions.revoke_others' then return target=actor::text and (ctx->'permissions') ? 'work';
 elsif operation in ('user.update','user.password','user.delete') then
  return (ctx->'permissions') ? 'users.manage' and target<>actor::text
   and exists(select 1 from public.supportos_users where id::text=target)
   and not exists(select 1 from public.supportos_user_roles where user_id::text=target and role_id='creator')
   and (operation='user.update' or exists(select 1 from public.supportos_user_roles where user_id=actor and role_id='creator')
    or not exists(select 1 from public.supportos_user_roles ur join public.supportos_role_permissions rp on rp.role_id=ur.role_id
     where ur.user_id::text=target and not (ctx->'permissions') ? rp.permission_id));
 elsif operation='user.create' then return (ctx->'permissions') ? 'users.manage';
 elsif operation in ('role.save','role.delete') then
  return (ctx->'permissions') ? 'roles.manage' and target ~ '^[a-z][a-z0-9_]{1,39}$' and target<>'creator'
   and not exists(select 1 from public.supportos_user_roles where user_id=actor and role_id=target);
 end if;
 return false;
end $$;

create or replace function public.supportos_prepare_account_action(actor uuid,sid uuid,operation text,payload jsonb,request_id uuid,ip_digest text,agent text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target_id text; device jsonb; permit_digest text;
begin
 perform pg_advisory_xact_lock(71532841);
 if operation not in ('user.password','user.delete','user.create') or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>8192 then return jsonb_build_object('error','invalid'); end if;
 target_id:=supportos_private.critical_target(actor,operation,payload);
 if target_id is null or not coalesce(supportos_private.critical_allowed(actor,sid,operation,target_id),false) then return jsonb_build_object('error','forbidden'); end if;
 if operation='user.create' then
  if jsonb_typeof(payload->'roles') is distinct from 'array' or jsonb_array_length(payload->'roles') not between 1 and 30 then return jsonb_build_object('error','invalid'); end if;
  if exists(select 1 from jsonb_array_elements(payload->'roles') x where jsonb_typeof(x)<>'string')
   or exists(select 1 from jsonb_array_elements_text(payload->'roles') x where not exists(select 1 from public.supportos_roles r where r.id=x.value)) then return jsonb_build_object('error','invalid'); end if;
  if not exists(select 1 from public.supportos_user_roles where user_id=actor and role_id='creator')
   and (payload->'roles' ? 'creator' or exists(select 1 from public.supportos_role_permissions rp
    where payload->'roles' ? rp.role_id and not (public.supportos_rbac_context(actor)->'permissions') ? rp.permission_id))
  then return jsonb_build_object('error','forbidden'); end if;
 end if;
 device:=supportos_private.security_device(left(agent,512));
 permit_digest:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 insert into public.supportos_telegram_critical_requests(id,actor_id,session_id,action,target,payload_hash,challenge_hash,permit_hash,ip_hash,browser,os,status)
 values(request_id,actor,sid,operation,target_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),encode(sha256(convert_to(request_id::text,'UTF8')),'hex'),permit_digest,ip_digest,device->>'browser',device->>'os','approved');
 return public.supportos_critical_execute(actor,sid,operation,payload,request_id,permit_digest);
exception when serialization_failure then return jsonb_build_object('error','conflict');
end $$;
revoke all on function public.supportos_prepare_account_action(uuid,uuid,text,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.supportos_prepare_account_action(uuid,uuid,text,jsonb,uuid,text,text) to service_role;
notify pgrst,'reload schema';
