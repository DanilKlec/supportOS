-- Auth remains responsible for password hashing and deleting identities. The
-- server must claim an exact, fresh TOTP permit before crossing that API boundary.
alter table public.supportos_telegram_critical_requests drop constraint supportos_telegram_critical_requests_action_check;
alter table public.supportos_telegram_critical_requests add constraint supportos_telegram_critical_requests_action_check
 check(action in ('sessions.revoke_others','telegram.unlink','telegram.change','user.update','role.save','role.delete','user.create','user.password','user.delete'));
alter table public.supportos_telegram_critical_requests add column account_snapshot jsonb;

-- Retain shared content and its revisions when the author's account is removed.
alter table public.supportos_ai_guidance drop constraint supportos_ai_guidance_updated_by_fkey;
alter table public.supportos_ai_guidance add constraint supportos_ai_guidance_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;
alter table public.supportos_shared_content drop constraint supportos_shared_content_updated_by_fkey;
alter table public.supportos_shared_content add constraint supportos_shared_content_updated_by_fkey foreign key(updated_by) references public.supportos_users(id) on delete set null;
alter table public.supportos_content_revisions drop constraint supportos_content_revisions_updated_by_fkey;
alter table public.supportos_content_revisions add constraint supportos_content_revisions_updated_by_fkey foreign key(updated_by) references public.supportos_users(id) on delete set null;
alter table public.supportos_ai_feedback_reviews alter column actor_id drop not null;
alter table public.supportos_ai_feedback_reviews drop constraint supportos_ai_feedback_reviews_actor_id_fkey;
alter table public.supportos_ai_feedback_reviews add constraint supportos_ai_feedback_reviews_actor_id_fkey foreign key(actor_id) references auth.users(id) on delete set null;

create or replace function supportos_private.critical_target(actor uuid,operation text,payload jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select case when operation='sessions.revoke_others' then actor::text
 when operation='user.create' then lower(trim(payload->>'email'))
 when operation in ('user.update','user.password','user.delete','role.save','role.delete') then payload->>'id' end;
$$;
create or replace function supportos_private.critical_allowed(actor uuid,sid uuid,operation text,target text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; state jsonb;
begin
 state:=public.supportos_mfa_session_state(actor,sid);
 if state->>'status' is distinct from 'approved' or state->>'mfaEnabled' is distinct from 'true' then return false; end if;
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

-- A narrow private bridge into managed Auth tables; never callable by clients.
create function supportos_private.revoke_account_sessions(actor uuid,sid uuid,subject uuid,request_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.supportos_telegram_critical_requests;
begin
 if auth.uid() is not null then raise exception using errcode='42501',message='Server only'; end if;
 select * into c from public.supportos_telegram_critical_requests where id=request_id;
 if not found or c.actor_id<>actor or c.session_id<>sid or c.target<>subject::text or c.status<>'consumed'
  or c.action not in ('user.password','user.delete') or c.expires_at<=now()
  or not coalesce(supportos_private.critical_allowed(actor,sid,c.action,c.target),false)
 then raise exception using errcode='42501',message='Нет права завершать сессии сотрудника'; end if;
 delete from auth.sessions where user_id=subject;
end $$;
revoke all on function supportos_private.revoke_account_sessions(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function supportos_private.revoke_account_sessions(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.supportos_critical_execute(actor uuid,sid uuid,operation text,payload jsonb,request_id uuid,permit_digest text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests; result jsonb; subject public.supportos_users;
begin
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
 if operation in ('user.password','user.delete') then
  select * into subject from public.supportos_users where id::text=c.target for update;
  if (payload->>'version')::integer is distinct from subject.version then raise exception using errcode='40001',message='Данные изменились. Обновите список'; end if;
  if operation='user.password' and coalesce(payload->>'password_digest','') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid'); end if;
  update public.supportos_telegram_critical_requests set account_snapshot=jsonb_build_object('email',subject.email,'status',subject.status,'version',subject.version) where id=c.id;
 end if;
 update public.supportos_telegram_critical_requests set status='consumed',consumed_at=now() where id=c.id;
 if operation in ('user.update','role.save','role.delete') then
  result:=public.supportos_rbac_change(actor,operation,payload);
  update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
  return result;
 elsif operation in ('user.password','user.delete') then
  perform supportos_private.revoke_account_sessions(actor,sid,subject.id,c.id);
  update public.supportos_users set version=version+1,updated_at=now() where id=subject.id;
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
  values(actor,(select email from public.supportos_users where id=actor),operation||'.requested',c.target,
   jsonb_build_object('email',subject.email),jsonb_build_object('phase','auth_pending'),'critical-request:'||c.id);
 end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.supportos_account_action_completed(actor uuid,sid uuid,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests;
begin
 select * into c from public.supportos_telegram_critical_requests where id=request_id and actor_id=actor and session_id=sid for update;
 if not found or c.status<>'consumed' or c.action not in ('user.password','user.delete') then return jsonb_build_object('error','invalid'); end if;
 if c.action='user.delete' and exists(select 1 from public.supportos_users where id::text=c.target) then return jsonb_build_object('error','not_completed'); end if;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
 values(actor,(select email from public.supportos_users where id=actor),c.action,c.target,c.account_snapshot,
  jsonb_build_object('completed',true,'sessions_revoked',true),'critical-complete:'||c.id);
 update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.supportos_account_action_completed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.supportos_account_action_completed(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
