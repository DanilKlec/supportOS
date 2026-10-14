-- Append-only security history. No Auth objects are created or altered.
-- Version matches the applied migration in the linked Supabase project.
-- UUIDs deliberately have no cascading FK: history survives session/user removal.
create table public.supportos_login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  session_id uuid,
  event_type text not null check (event_type in ('login_approved','login_rejected','password_changed','sessions_revoked')),
  created_at timestamptz not null default clock_timestamp(),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  browser text check (browser is null or browser in ('Edge','Opera','Firefox','Chrome','Safari')),
  os text check (os is null or os in ('Android','iOS','Windows','macOS','Linux')),
  telegram_result text check (telegram_result is null or telegram_result in ('approved','rejected','not_confirmed')),
  event_ref text not null check (length(event_ref) between 1 and 128),
  unique (event_ref,event_type)
);
create index supportos_login_events_user_cursor_idx on public.supportos_login_events(user_id,id desc);
alter table public.supportos_login_events enable row level security;
revoke all on public.supportos_login_events from public,anon,authenticated,service_role;
grant select,insert on public.supportos_login_events to service_role;
revoke all on sequence public.supportos_login_events_id_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.supportos_login_events_id_seq to service_role;

create function supportos_private.prevent_login_event_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'Security history is append-only' using errcode='42501';
end $$;
revoke all on function supportos_private.prevent_login_event_mutation() from public,anon,authenticated,service_role;
create trigger supportos_login_events_no_mutation before update or delete on public.supportos_login_events
for each row execute function supportos_private.prevent_login_event_mutation();
create trigger supportos_login_events_no_truncate before truncate on public.supportos_login_events
for each statement execute function supportos_private.prevent_login_event_mutation();

-- Parse into a fixed vocabulary; never copy raw UA into the journal.
create function supportos_private.security_device(agent text) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('browser',case
    when agent ~ 'Edg(/|A/|iOS/)' then 'Edge' when agent ~ 'OPR/' then 'Opera'
    when agent ~ '(Firefox|FxiOS)/' then 'Firefox' when agent ~ '(Chrome|CriOS)/' then 'Chrome'
    when agent ~ 'Safari/' then 'Safari' end,
    'os',case when agent ~ 'Android' then 'Android' when agent ~ '(iPhone|iPad|iPod)' then 'iOS'
    when agent ~ 'Windows' then 'Windows' when agent ~ '(Macintosh|Mac OS X)' then 'macOS'
    when agent ~ 'Linux' then 'Linux' end);
$$;
revoke all on function supportos_private.security_device(text) from public,anon,authenticated;
grant execute on function supportos_private.security_device(text) to service_role;

alter table public.supportos_telegram_login_challenges add column telegram_result text
check (telegram_result is null or telegram_result in ('approved','rejected','not_confirmed'));
alter table public.supportos_password_requests add column security_browser text;
alter table public.supportos_password_requests add column security_os text;

-- Preserve the old RPC signature/guards; distinguish a real Telegram decision
-- from cancellation/delivery failure, which must not claim Telegram rejected it.
create or replace function public.supportos_tg_login_decide(digest text,tg bigint,decision text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_login_challenges;
begin
  select * into c from public.supportos_telegram_login_challenges where challenge_hash=digest for update;
  if not found or c.telegram_id<>tg or decision not in ('approved','rejected') then return jsonb_build_object('error','invalid'); end if;
  if c.status='expired' or (c.status='pending' and (c.expires_at<=now() or not supportos_private.session_live(c.user_id,c.session_id))) then
    update public.supportos_telegram_login_challenges set status='expired' where id=c.id;
    return jsonb_build_object('error','expired');
  end if;
  if c.status<>'pending' then return jsonb_build_object('error','processed'); end if;
  update public.supportos_telegram_login_challenges set status=decision,telegram_result=decision,
    approved_at=case when decision='approved' then now() end,rejected_at=case when decision='rejected' then now() end where id=c.id;
  return jsonb_build_object('status',decision);
end $$;

create function supportos_private.record_login_decision() returns trigger
language plpgsql security invoker set search_path='' as $$
declare device jsonb;
begin
  if old.status='pending' and new.status in ('approved','rejected') then
    device:=supportos_private.security_device(new.user_agent);
    insert into public.supportos_login_events(user_id,session_id,event_type,ip_hash,browser,os,telegram_result,event_ref)
    values(new.user_id,new.session_id,case when new.status='approved' then 'login_approved' else 'login_rejected' end,
      case when new.ip_hash ~ '^[a-f0-9]{64}$' then new.ip_hash end,device->>'browser',device->>'os',
      coalesce(new.telegram_result,'not_confirmed'),'login:'||new.id)
    on conflict(event_ref,event_type) do nothing;
  end if;
  return null;
end $$;
revoke all on function supportos_private.record_login_decision() from public,anon,authenticated,service_role;
create trigger supportos_login_decision_history after update of status on public.supportos_telegram_login_challenges
for each row when (old.status is distinct from new.status) execute function supportos_private.record_login_decision();

-- An additive overload retains compatibility for existing 8-argument callers.
-- The raw agent is parsed here and not persisted on password requests.
create function public.supportos_password_begin(request_id uuid,subject uuid,sid uuid,identity_email text,
  identity_digest text,ip_digest text,browser_digest text,challenge_digest text,agent text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; device jsonb;
begin
  -- Unknown IPs share a rate-limit bucket; the placeholder is not journaled.
  result:=public.supportos_password_begin(request_id,subject,sid,identity_email,identity_digest,coalesce(ip_digest,repeat('0',64)),browser_digest,challenge_digest);
  if result ? 'error' then return result; end if;
  device:=supportos_private.security_device(left(agent,512));
  update public.supportos_password_requests set security_browser=device->>'browser',security_os=device->>'os' where id=request_id;
  return result;
end $$;
revoke all on function public.supportos_password_begin(uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.supportos_password_begin(uuid,uuid,uuid,text,text,text,text,text,text) to service_role;

-- Completion is made by the existing deferred password guard in the SAME
-- transaction as the Auth password change and deletion of the user's sessions.
-- If that transaction fails, both history events roll back too.
create function supportos_private.record_password_completion() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.status='processing' and new.status='completed' and new.user_id is not null then
    insert into public.supportos_login_events(user_id,session_id,event_type,created_at,ip_hash,browser,os,telegram_result,event_ref)
    select new.user_id,new.session_id,event,new.completed_at,
      case when new.ip_hash ~ '^[a-f0-9]{64}$' and new.ip_hash<>repeat('0',64) then new.ip_hash end,new.security_browser,new.security_os,'approved','password:'||new.id
    from unnest(array['password_changed','sessions_revoked']) as events(event)
    on conflict(event_ref,event_type) do nothing;
  end if;
  return null;
end $$;
revoke all on function supportos_private.record_password_completion() from public,anon,authenticated,service_role;
create trigger supportos_password_completion_history after update of status on public.supportos_password_requests
for each row when (old.status is distinct from new.status) execute function supportos_private.record_password_completion();

-- The server calls this only after Auth signOut succeeds, with a verified JWT
-- subject/session. Check actual absence/expiry too; never accept a browser claim.
create function public.supportos_record_session_revoked(subject uuid,sid uuid,ip_digest text,agent text)
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
  perform public.supportos_tg_login_cancel(subject,sid);
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.supportos_record_session_revoked(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.supportos_record_session_revoked(uuid,uuid,text,text) to service_role;

create function public.supportos_login_history(actor uuid,actor_session uuid,target uuid default null,before_id bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare subject uuid:=coalesce(target,actor); ctx jsonb; result jsonb; cursor text;
begin
  if (public.supportos_tg_login_state(actor,actor_session)->>'status') is distinct from 'approved' then
    return jsonb_build_object('error','invalid_session');
  end if;
  ctx:=public.supportos_rbac_context(actor);
  if (ctx->>'status') is distinct from 'active' or not (
    (subject=actor and coalesce(ctx->'permissions' ? 'work',false)) or coalesce(ctx->'permissions' ? 'users.manage',false)
  ) then return jsonb_build_object('error','forbidden'); end if;
  if before_id is not null and before_id<=0 then return jsonb_build_object('error','invalid_cursor'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'user_id',e.user_id,'session_id',e.session_id,
    'event_type',e.event_type,'created_at',e.created_at,'ip_hash',e.ip_hash,'browser',e.browser,'os',e.os,
    'telegram_result',e.telegram_result) order by e.id desc),'[]'::jsonb) into result
  from (select * from public.supportos_login_events where user_id=subject and (before_id is null or id<before_id) order by id desc limit 50) e;
  if jsonb_array_length(result)=50 and exists(select 1 from public.supportos_login_events
    where user_id=subject and id<(result->49->>'id')::bigint) then cursor:=result->49->>'id'; end if;
  return jsonb_build_object('events',result,'nextCursor',cursor);
end $$;
revoke all on function public.supportos_login_history(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.supportos_login_history(uuid,uuid,uuid,bigint) to service_role;

comment on table public.supportos_login_events is 'Append-only SupportOS security events from committed workflows; no raw IP/UA, passwords or tokens. Not an audit of out-of-band Supabase Dashboard actions.';
