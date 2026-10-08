-- Extension of the existing Telegram challenge architecture: same linked identity,
-- bot/webhook and login proof. Login/password challenge functions stay unchanged.
create table public.supportos_telegram_critical_requests (
 id uuid primary key,
 actor_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 action text not null check(action in ('sessions.revoke_others','telegram.unlink','telegram.change','user.update','role.save','role.delete','user.create')),
 target text not null check(length(target) between 1 and 320),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 telegram_id bigint not null check(telegram_id>0),
 challenge_hash text not null unique check(challenge_hash ~ '^[a-f0-9]{64}$'),
 permit_hash text not null unique check(permit_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','expired','consumed','completed')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes',
 decided_at timestamptz,
 consumed_at timestamptz,
 ip_hash text check(ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
 browser text,
 os text
);
create index supportos_critical_actor_created on public.supportos_telegram_critical_requests(actor_id,created_at desc);
create unique index supportos_critical_one_pending on public.supportos_telegram_critical_requests(actor_id,session_id)
 where status in ('pending','approved');
alter table public.supportos_telegram_critical_requests enable row level security;
revoke all on public.supportos_telegram_critical_requests from public,anon,authenticated;
grant select,insert,update on public.supportos_telegram_critical_requests to service_role;

create function supportos_private.critical_target(actor uuid,operation text,payload jsonb) returns text
language sql immutable security invoker set search_path='' as $$
 select case
 when operation in ('sessions.revoke_others','telegram.unlink','telegram.change') then actor::text
 when operation='user.create' then lower(trim(payload->>'email'))
 when operation in ('user.update','role.save','role.delete') then payload->>'id'
 end;
$$;
create function supportos_private.critical_allowed(actor uuid,sid uuid,operation text,target text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb;
begin
 if (public.supportos_tg_login_state(actor,sid)->>'status') is distinct from 'approved' then return false; end if;
 ctx:=public.supportos_rbac_context(actor);
 if ctx->>'status' is distinct from 'active' then return false; end if;
 if operation in ('sessions.revoke_others','telegram.unlink','telegram.change') then
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
revoke all on function supportos_private.critical_target(uuid,text,jsonb), supportos_private.critical_allowed(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function supportos_private.critical_target(uuid,text,jsonb), supportos_private.critical_allowed(uuid,uuid,text,text) to service_role;

create function public.supportos_critical_begin(actor uuid,sid uuid,operation text,payload jsonb,request_id uuid,
 callback_digest text,permit_digest text,ip_digest text,agent text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare target_id text; linked bigint; device jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('tg-critical:'||actor,0));
 target_id:=supportos_private.critical_target(actor,operation,payload);
 if target_id is null or not coalesce(supportos_private.critical_allowed(actor,sid,operation,target_id),false) then
  return jsonb_build_object('error','forbidden'); end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>8192 then return jsonb_build_object('error','invalid'); end if;
 if exists(select 1 from public.supportos_telegram_critical_requests where actor_id=actor and created_at>now()-interval '10 seconds')
 or (select count(*) from public.supportos_telegram_critical_requests where actor_id=actor and created_at>now()-interval '1 hour')>=10
 then return jsonb_build_object('error','rate_limit'); end if;
 select telegram_id into linked from public.supportos_telegram_links where user_id=actor;
 device:=supportos_private.security_device(agent);
 update public.supportos_telegram_critical_requests set status='expired' where actor_id=actor and session_id=sid and status in ('pending','approved');
 insert into public.supportos_telegram_critical_requests(id,actor_id,session_id,action,target,payload_hash,telegram_id,challenge_hash,permit_hash,ip_hash,browser,os)
 values(request_id,actor,sid,operation,target_id,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),linked,callback_digest,permit_digest,ip_digest,device->>'browser',device->>'os');
 return jsonb_build_object('id',request_id,'status','pending','expiresAt',now()+interval '5 minutes','telegramId',linked,'target',target_id);
end $$;

create function public.supportos_critical_state(actor uuid,sid uuid,request_id uuid,cancel boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests;
begin
 select * into c from public.supportos_telegram_critical_requests where id=request_id and actor_id=actor and session_id=sid for update;
 if not found then return jsonb_build_object('error','invalid'); end if;
 if cancel and c.status in ('pending','approved') then
  update public.supportos_telegram_critical_requests set status='rejected',decided_at=now() where id=c.id; c.status:='rejected';
 elsif c.status in ('pending','approved') and (c.expires_at<=now()
  or not coalesce(supportos_private.critical_allowed(actor,sid,c.action,c.target),false)
  or not exists(select 1 from public.supportos_telegram_links where user_id=actor and telegram_id=c.telegram_id)) then
  update public.supportos_telegram_critical_requests set status='expired' where id=c.id; c.status:='expired';
 end if;
 return jsonb_build_object('id',c.id,'status',c.status,'expiresAt',c.expires_at);
end $$;

create function public.supportos_critical_decide(digest text,tg bigint,decision text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests; state jsonb;
begin
 select * into c from public.supportos_telegram_critical_requests where challenge_hash=digest for update;
 if not found or c.telegram_id<>tg or decision not in ('approved','rejected') then return jsonb_build_object('error','invalid'); end if;
 state:=public.supportos_critical_state(c.actor_id,c.session_id,c.id);
 if state->>'status'='expired' then return jsonb_build_object('error','expired'); end if;
 if state->>'status'<>'pending' then return jsonb_build_object('error','processed'); end if;
 update public.supportos_telegram_critical_requests set status=decision,decided_at=now() where id=c.id;
 return jsonb_build_object('status',decision);
end $$;

-- Remember an explicit unlink, without erasing the legacy registration archive.
alter table public.supportos_telegram_registration add column telegram_unlinked_at timestamptz;
create function supportos_private.prevent_legacy_relink() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.source='registration' and exists(select 1 from public.supportos_telegram_registration where id=new.user_id and telegram_unlinked_at is not null) then return null; end if;
 return new;
end $$;
revoke all on function supportos_private.prevent_legacy_relink() from public,anon,authenticated;
create trigger supportos_no_legacy_relink before insert on public.supportos_telegram_links
 for each row execute function supportos_private.prevent_legacy_relink();

create function public.supportos_critical_execute(actor uuid,sid uuid,operation text,payload jsonb,request_id uuid,permit_digest text) returns jsonb
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
 or not exists(select 1 from public.supportos_telegram_links where user_id=actor and telegram_id=c.telegram_id)
 then update public.supportos_telegram_critical_requests set status='expired' where id=c.id; return jsonb_build_object('error','expired'); end if;
 update public.supportos_telegram_critical_requests set status='consumed',consumed_at=now() where id=c.id;
 if operation in ('user.update','role.save','role.delete') then
  result:=public.supportos_rbac_change(actor,operation,payload);
  update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
  return result;
 elsif operation in ('telegram.unlink','telegram.change') then
  perform pg_advisory_xact_lock(hashtextextended('tg-login:'||actor,0));
  update public.supportos_telegram_registration set telegram_unlinked_at=now() where id=actor;
  delete from public.supportos_telegram_links where user_id=actor and telegram_id=c.telegram_id;
  update public.supportos_telegram_login_challenges set status='rejected',rejected_at=now() where user_id=actor and status in ('pending','approved');
  update public.supportos_telegram_link_requests set status='rejected',reviewed_at=now() where user_id=actor and status in ('pending','verified');
  update public.supportos_telegram_critical_requests set status='expired' where actor_id=actor and status in ('pending','approved');
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id)
   values(actor,(select email from public.supportos_users where id=actor),operation,actor::text);
  update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
 end if;
 -- External Auth API operations use a consumed permit: failures cannot replay it.
 return jsonb_build_object('ok',true);
end $$;

-- Narrow private reader, no new direct service/browser grants on auth.sessions.
create function supportos_private.other_sessions_exist(subject uuid,sid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where user_id=subject and id<>sid and (not_after is null or not_after>now()));
$$;
revoke all on function supportos_private.other_sessions_exist(uuid,uuid) from public,anon,authenticated;
grant execute on function supportos_private.other_sessions_exist(uuid,uuid) to service_role;
create function public.supportos_critical_sessions_completed(actor uuid,sid uuid,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests;
begin
 select * into c from public.supportos_telegram_critical_requests where id=request_id and actor_id=actor and session_id=sid for update;
 if not found or c.action<>'sessions.revoke_others' or c.status<>'consumed'
 or not supportos_private.session_live(actor,sid) or supportos_private.other_sessions_exist(actor,sid)
 then return jsonb_build_object('error','not_completed'); end if;
 insert into public.supportos_login_events(user_id,session_id,event_type,event_ref,ip_hash,browser,os,telegram_result)
 values(actor,sid,'sessions_revoked','critical:'||c.id,c.ip_hash,c.browser,c.os,'approved') on conflict do nothing;
 update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.supportos_critical_begin(uuid,uuid,text,jsonb,uuid,text,text,text,text),
 public.supportos_critical_state(uuid,uuid,uuid,boolean),public.supportos_critical_decide(text,bigint,text),
 public.supportos_critical_execute(uuid,uuid,text,jsonb,uuid,text),public.supportos_critical_sessions_completed(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.supportos_critical_begin(uuid,uuid,text,jsonb,uuid,text,text,text,text),
 public.supportos_critical_state(uuid,uuid,uuid,boolean),public.supportos_critical_decide(text,bigint,text),
 public.supportos_critical_execute(uuid,uuid,text,jsonb,uuid,text),public.supportos_critical_sessions_completed(uuid,uuid,uuid) to service_role;
comment on table public.supportos_telegram_critical_requests is 'Critical confirmations using the existing SupportOS Telegram bot/webhook. Payload and callback/browser credentials are stored only as hashes.';
