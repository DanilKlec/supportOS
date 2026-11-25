alter table public.supportos_chatwoot_presence
  add column offline_since timestamptz,
  add column handoff_since timestamptz,
  add column handoff_checked_at timestamptz;

-- Old sessions are not evidence of a newly disconnected SupportOS agent.
update public.supportos_chatwoot_presence
set accepting = false, offline_since = now(), updated_at = now()
where heartbeat_at <= now() - interval '90 seconds';

alter table public.supportos_chatwoot_router_state
  add column schedule_key text not null
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

create index supportos_chatwoot_presence_expiry_idx
  on public.supportos_chatwoot_presence (heartbeat_at) where offline_since is null;

-- Check the old heartbeat before refreshing it, including when a browser
-- reconnects before the next recovery job.
create function public.supportos_chatwoot_record_presence(
  p_user_id uuid, p_agent_id bigint, p_accepting boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_presence public.supportos_chatwoot_presence;
  observed_at timestamptz;
  disconnected boolean;
  same_agent boolean;
  pending_since timestamptz;
begin
  if p_agent_id is not null then
    insert into public.supportos_chatwoot_presence (user_id, chatwoot_agent_id, heartbeat_at)
    values (p_user_id, p_agent_id, clock_timestamp())
    on conflict (user_id) do nothing;
  end if;

  select * into current_presence
    from public.supportos_chatwoot_presence where user_id = p_user_id for update;
  if not found then return null; end if;

  observed_at := clock_timestamp();
  same_agent := p_agent_id is null or p_agent_id = current_presence.chatwoot_agent_id;
  disconnected := current_presence.offline_since is not null
    or current_presence.heartbeat_at <= observed_at - interval '90 seconds';
  if same_agent then
    pending_since := current_presence.handoff_since;
    if disconnected and current_presence.offline_since is null then
      pending_since := coalesce(pending_since, observed_at);
    end if;
  end if;

  update public.supportos_chatwoot_presence
  set chatwoot_agent_id = coalesce(p_agent_id, current_presence.chatwoot_agent_id),
      heartbeat_at = observed_at,
      accepting = pending_since is null and coalesce(p_accepting,
        same_agent and not disconnected and current_presence.accepting),
      offline_since = null,
      handoff_since = pending_since,
      handoff_checked_at = case when pending_since = current_presence.handoff_since then current_presence.handoff_checked_at end,
      updated_at = case when p_accepting is not null or disconnected or not same_agent then observed_at else current_presence.updated_at end
  where user_id = p_user_id
  returning * into current_presence;
  return to_jsonb(current_presence);
end;
$$;

-- All workers take the router lease before scanning. Rotate the pending agents
-- so a transient failure for one of them cannot stall the others.
create function public.supportos_chatwoot_expire_presence(p_lease_token uuid)
returns table(user_id uuid, chatwoot_agent_id bigint, handoff_since timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare checked_at timestamptz := clock_timestamp();
begin
  if not exists (
    select 1 from public.supportos_chatwoot_router_state
    where id = 'main' and router_lease_token = p_lease_token and router_lease_until > checked_at
  ) then return; end if;

  update public.supportos_chatwoot_presence p
  set accepting = false, offline_since = checked_at, updated_at = checked_at,
      handoff_since = coalesce(p.handoff_since, checked_at)
  where p.offline_since is null and p.heartbeat_at <= checked_at - interval '90 seconds';

  return query
    with pending as (
      select p.user_id from public.supportos_chatwoot_presence p
      where p.handoff_since is not null
      order by p.handoff_checked_at nulls first, p.handoff_since, p.user_id
      limit 6
    )
    update public.supportos_chatwoot_presence p
    set handoff_checked_at = checked_at
    from pending where p.user_id = pending.user_id
    returning p.user_id, p.chatwoot_agent_id, p.handoff_since;
end;
$$;

create function public.supportos_chatwoot_reserve_handoff(
  p_lease_token uuid, p_user_id uuid, p_agent_id bigint, p_handoff_since timestamptz,
  p_conversation_id bigint, p_operation_token uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(87120, 1);
  if not exists (
    select 1 from public.supportos_chatwoot_router_state
    where id = 'main' and router_lease_token = p_lease_token
      and router_lease_until > clock_timestamp() + interval '10 seconds'
  ) or not exists (
    select 1 from public.supportos_chatwoot_presence
    where user_id = p_user_id and chatwoot_agent_id = p_agent_id
      and handoff_since = p_handoff_since and not accepting
  ) then return jsonb_build_object('reserved', false); end if;

  return public.supportos_chatwoot_reserve_conversation(
    p_operation_token, p_conversation_id, array[null::bigint], '{}'::jsonb, null
  );
end;
$$;

create function public.supportos_chatwoot_complete_handoff(
  p_lease_token uuid, p_user_id uuid, p_agent_id bigint, p_handoff_since timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.supportos_chatwoot_presence
  set handoff_since = null, handoff_checked_at = null
  where user_id = p_user_id and chatwoot_agent_id = p_agent_id and handoff_since = p_handoff_since
    and exists (
      select 1 from public.supportos_chatwoot_router_state
      where id = 'main' and router_lease_token = p_lease_token and router_lease_until > clock_timestamp()
    );
  return found;
end;
$$;

revoke all on function public.supportos_chatwoot_record_presence(uuid, bigint, boolean),
  public.supportos_chatwoot_expire_presence(uuid),
  public.supportos_chatwoot_reserve_handoff(uuid, uuid, bigint, timestamptz, bigint, uuid),
  public.supportos_chatwoot_complete_handoff(uuid, uuid, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.supportos_chatwoot_record_presence(uuid, bigint, boolean),
  public.supportos_chatwoot_expire_presence(uuid),
  public.supportos_chatwoot_reserve_handoff(uuid, uuid, bigint, timestamptz, bigint, uuid),
  public.supportos_chatwoot_complete_handoff(uuid, uuid, bigint, timestamptz)
  to service_role;
