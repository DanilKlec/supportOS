-- Reuse the access journal. No new audit table, no managed auth DDL or backfill.
alter table public.supportos_access_audit add column event_ref text;
create unique index supportos_access_audit_event_ref_idx on public.supportos_access_audit(event_ref) where event_ref is not null;
create index supportos_access_audit_target_idx on public.supportos_access_audit(target_id,id desc);
alter table public.supportos_telegram_critical_requests add column audit_other_session_count bigint check(audit_other_session_count>=0);
alter table public.supportos_password_requests add column audit_session_count bigint check(audit_session_count>=0);

-- Counts only: neither Auth session rows nor credentials leave this private reader.
create function supportos_private.audit_session_count(subject uuid,except_sid uuid default null) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from auth.sessions where user_id=subject and (except_sid is null or id<>except_sid) and (not_after is null or not_after>now());
$$;
revoke all on function supportos_private.audit_session_count(uuid,uuid) from public,anon,authenticated;
grant execute on function supportos_private.audit_session_count(uuid,uuid) to service_role;

create function supportos_private.capture_security_audit_count() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='supportos_telegram_critical_requests' then
  if old.status='approved' and new.status='consumed' and new.action='sessions.revoke_others' then
   new.audit_other_session_count:=supportos_private.audit_session_count(new.actor_id,new.session_id);
   -- Persist intent before crossing the external Auth API boundary. This is
   -- NOT a success event; completion below verifies the actual DB state.
   insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
   values(new.actor_id,(select email from public.supportos_users where id=new.actor_id),'sessions.revoke_others.requested',new.actor_id::text,
    jsonb_build_object('other_sessions',new.audit_other_session_count,'current_session_id',new.session_id),
    jsonb_build_object('phase','auth_pending'),'critical-request:'||new.id);
  end if;
 elsif old.status='processing' and new.status='completed' then
  -- The existing deferred password guard deletes these sessions in this same transaction.
  new.audit_session_count:=supportos_private.audit_session_count(new.user_id);
 end if;
 return new;
end $$;
revoke all on function supportos_private.capture_security_audit_count() from public,anon,authenticated,service_role;
create trigger supportos_critical_audit_count before update of status on public.supportos_telegram_critical_requests
 for each row execute function supportos_private.capture_security_audit_count();
create trigger supportos_password_audit_count before update of status on public.supportos_password_requests
 for each row execute function supportos_private.capture_security_audit_count();

create function public.supportos_request_logout_audit(subject uuid,sid uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if subject is null or sid is null then return jsonb_build_object('error','invalid_session'); end if;
 if supportos_private.session_live(subject,sid) then
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
  values(subject,(select email from public.supportos_users where id=subject),'session.logout.requested',subject::text,
   jsonb_build_object('session_id',sid,'active',true),jsonb_build_object('phase','auth_pending'),'logout-request:'||sid)
  on conflict do nothing;
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.supportos_request_logout_audit(uuid,uuid) from public,anon,authenticated;
grant execute on function public.supportos_request_logout_audit(uuid,uuid) to service_role;

-- An allowlist, not a blacklist. Free-form names/descriptions and raw Auth objects
-- must not become a way to persist a pasted password, token or secret in RBAC audit.
create function supportos_private.access_snapshot(value jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb;
begin
 if value is null or value='null'::jsonb then return null; end if;
 select coalesce(jsonb_object_agg(key,item),'{}'::jsonb) into result from jsonb_each(value) e(key,item)
 where (key in ('version') and jsonb_typeof(item)='number')
 or (key='status' and item #>> '{}' in ('active','pending','disabled'))
 or (key='is_system' and jsonb_typeof(item)='boolean')
 or (key='id' and item #>> '{}' ~ '^[a-z][a-z0-9_]{1,39}$');
 if jsonb_typeof(value->'roles')='array' then
  result:=result||jsonb_build_object('roles',coalesce((select jsonb_agg(id order by id) from
   (select distinct coalesce(item->>'id',item #>> '{}') id from jsonb_array_elements(value->'roles') e(item)) r
   where id ~ '^[a-z][a-z0-9_]{1,39}$'),'[]'::jsonb));
 end if;
 if jsonb_typeof(value->'permissions')='array' then
  result:=result||jsonb_build_object('permissions',coalesce((select jsonb_agg(id order by id) from
   (select distinct item #>> '{}' id from jsonb_array_elements(value->'permissions') e(item)) p
   where id ~ '^[a-z][a-z0-9_.]{0,79}$'),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function supportos_private.access_snapshot(jsonb) from public,anon,authenticated;
grant execute on function supportos_private.access_snapshot(jsonb) to service_role;

create function supportos_private.safe_access_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare before_value jsonb:=new.before_data; after_value jsonb:=new.after_data; request_id uuid;
begin
 if new.action in ('user.update','role.save','role.delete') then
  new.before_data:=supportos_private.access_snapshot(before_value);
  new.after_data:=supportos_private.access_snapshot(after_value);
  if new.action='user.update' then
   new.after_data:=new.after_data||jsonb_build_object('display_name_changed',before_value->'display_name' is distinct from after_value->'display_name');
  elsif new.action='role.save' then
   new.after_data:=new.after_data||jsonb_build_object('name_changed',before_value->'name' is distinct from after_value->'name',
    'description_changed',before_value->'description' is distinct from after_value->'description');
  end if;
 elsif new.action in ('telegram.unlink','telegram.change') then
  select id into request_id from public.supportos_telegram_critical_requests
   where actor_id=new.actor_id and target=new.target_id and action=new.action and status='consumed' order by consumed_at desc limit 1;
  if request_id is null then raise exception 'Missing critical confirmation audit context'; end if;
  new.event_ref:='critical:'||request_id;
  new.before_data:=jsonb_build_object('linked',true);
  new.after_data:=jsonb_build_object('linked',false);
 end if;
 return new;
end $$;
revoke all on function supportos_private.safe_access_audit() from public,anon,authenticated,service_role;
create trigger supportos_safe_access_audit before insert on public.supportos_access_audit
 for each row execute function supportos_private.safe_access_audit();

-- Existing durable security completions are the source. INSERT ... ON CONFLICT
-- in their original RPCs fires this trigger once; failed/replayed permits do not.
create function supportos_private.audit_security_completion() returns trigger
language plpgsql security invoker set search_path='' as $$
declare operation text; before_value jsonb; after_value jsonb;
 c public.supportos_telegram_critical_requests; p public.supportos_password_requests;
begin
 if new.event_ref like 'password:%' and new.event_type in ('password_changed','sessions_revoked') then
  select * into p from public.supportos_password_requests where 'password:'||id=new.event_ref and user_id=new.user_id and status='completed';
  if not found then raise exception 'Missing password completion audit context'; end if;
  if new.event_type='password_changed' then
   operation:='password.'||p.mode;
   before_value:=jsonb_build_object('confirmation_status','processing');
   after_value:=jsonb_build_object('confirmation_status','completed');
  else
   operation:='sessions.revoke_all';
   before_value:=jsonb_build_object('active_sessions',p.audit_session_count);
   after_value:=jsonb_build_object('active_sessions',0);
  end if;
 elsif new.event_ref like 'critical:%' and new.event_type='sessions_revoked' then
  select * into c from public.supportos_telegram_critical_requests where 'critical:'||id=new.event_ref and actor_id=new.user_id and session_id=new.session_id and status='consumed' and action='sessions.revoke_others';
  if not found then raise exception 'Missing session completion audit context'; end if;
  operation:=c.action;
  before_value:=jsonb_build_object('other_sessions',c.audit_other_session_count,'current_session_id',c.session_id);
  after_value:=jsonb_build_object('other_sessions',supportos_private.audit_session_count(c.actor_id,c.session_id),
   'current_session_id',c.session_id,'current_session_preserved',supportos_private.session_live(c.actor_id,c.session_id));
 elsif new.event_type='sessions_revoked' and new.event_ref='logout:'||new.session_id then
  operation:='session.logout';
  -- A retry may arrive after logout: the old active state is not known here.
  before_value:=jsonb_build_object('session_id',new.session_id);
  after_value:=jsonb_build_object('session_id',new.session_id,'active',false);
 else return null;
 end if;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,created_at,event_ref)
 values(new.user_id,(select email from public.supportos_users where id=new.user_id),operation,new.user_id::text,
  before_value,after_value,new.created_at,'security-event:'||new.id);
 return null;
end $$;
revoke all on function supportos_private.audit_security_completion() from public,anon,authenticated,service_role;
create trigger supportos_security_completion_audit after insert on public.supportos_login_events
 for each row execute function supportos_private.audit_security_completion();

create function supportos_private.audit_telegram_link_review() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.status='verified' and new.status in ('approved','rejected') and new.reviewed_by is not null then
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,created_at,event_ref)
  values(new.reviewed_by,(select email from public.supportos_users where id=new.reviewed_by),
   case when new.status='approved' then 'telegram.link.approve' else 'telegram.link.reject' end,new.user_id::text,
   jsonb_build_object('request_status',old.status,'linked',case when new.status='approved' then false else exists(select 1 from public.supportos_telegram_links where user_id=new.user_id) end),
   jsonb_build_object('request_status',new.status,'linked',exists(select 1 from public.supportos_telegram_links where user_id=new.user_id)),
   new.reviewed_at,'telegram-review:'||new.id);
 end if;
 return null;
end $$;
revoke all on function supportos_private.audit_telegram_link_review() from public,anon,authenticated,service_role;
create trigger supportos_telegram_link_review_audit after update of status on public.supportos_telegram_link_requests
 for each row execute function supportos_private.audit_telegram_link_review();

-- The existing Auth identity-sync trigger inserts this public profile. Audit
-- creation in that SAME Auth transaction, even if subsequent role assignment
-- fails. App metadata is server-controlled; never trust raw_user_meta_data.
create function supportos_private.audit_account_creation() returns trigger
language plpgsql security definer set search_path='' as $$
declare marker text; registration text; c public.supportos_telegram_critical_requests; actor uuid; reference text;
begin
 select raw_app_meta_data->>'supportos_creation_request',raw_app_meta_data->>'telegram_registration'
  into marker,registration from auth.users where id=new.id;
 if marker is not null then
  select * into c from public.supportos_telegram_critical_requests
   where id::text=marker and action='user.create' and target=lower(trim(new.email)) and status='consumed' and expires_at>now() for update;
  if not found or not coalesce(supportos_private.critical_allowed(c.actor_id,c.session_id,c.action,c.target),false) then
   raise exception 'Missing account creation audit context' using errcode='42501';
  end if;
  actor:=c.actor_id; reference:='critical:'||c.id;
  update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
 elsif registration=new.id::text and exists(select 1 from public.supportos_telegram_registration where id=new.id and verified_at is not null and completed_at is null and expires_at>now()) then
  actor:=new.id; reference:='registration:'||new.id;
 else
  -- Auth Dashboard/third-party administration has no verified SupportOS actor.
  -- It remains in Supabase Auth audit logs; never invent an actor here.
  return null;
 end if;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
 values(actor,(select email from public.supportos_users where id=actor),'user.create',new.id::text,null,
  jsonb_build_object('id',new.id,'status',new.status,'version',new.version),reference);
 return null;
end $$;
revoke all on function supportos_private.audit_account_creation() from public,anon,authenticated,service_role;
create trigger supportos_account_creation_audit after insert on public.supportos_users
 for each row execute function supportos_private.audit_account_creation();

create function supportos_private.reject_access_audit_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Access audit is append-only' using errcode='42501'; end $$;
revoke all on function supportos_private.reject_access_audit_mutation() from public,anon,authenticated,service_role;
create trigger supportos_access_audit_immutable before update or delete on public.supportos_access_audit
 for each row execute function supportos_private.reject_access_audit_mutation();
create trigger supportos_access_audit_no_truncate before truncate on public.supportos_access_audit
 for each statement execute function supportos_private.reject_access_audit_mutation();
revoke all on public.supportos_access_audit from public,anon,authenticated,service_role;
grant select,insert on public.supportos_access_audit to service_role;
comment on table public.supportos_access_audit is 'Append-only SupportOS access/Admin/security audit. Safe snapshots only; no credentials. Read via authorized Accounts API.';
