alter table public.supportos_chatwoot_router_state
  add column if not exists router_lease_token uuid,
  add column if not exists router_lease_until timestamptz,
  add column if not exists last_inbox_id bigint;

alter table public.supportos_chatwoot_routing
  alter column chatwoot_agent_id drop not null,
  add column if not exists operation_token uuid,
  add column if not exists operation_expires_at timestamptz,
  add column if not exists operation_previous_agent_id bigint;

create index if not exists supportos_chatwoot_routing_capacity_idx
  on public.supportos_chatwoot_routing(chatwoot_agent_id, updated_at)
  where status in ('routing', 'assigned');
create index if not exists supportos_chatwoot_routing_previous_agent_idx
  on public.supportos_chatwoot_routing(operation_previous_agent_id)
  where status = 'routing' and operation_previous_agent_id is not null;

create or replace function public.supportos_chatwoot_acquire_router_lease(
  p_lease_token uuid, p_min_interval_seconds integer, p_lease_seconds integer
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_lease_token is null then return false; end if;
  perform pg_advisory_xact_lock(87120, 1);
  update public.supportos_chatwoot_router_state
  set router_lease_token = p_lease_token,
      router_lease_until = clock_timestamp() + make_interval(secs => greatest(15, least(90, p_lease_seconds))),
      last_run_at = clock_timestamp()
  where id = 'main'
    and (router_lease_until is null or router_lease_until <= clock_timestamp())
    and (last_run_at is null or last_run_at <= clock_timestamp() - make_interval(secs => greatest(1, least(30, p_min_interval_seconds))));
  return found;
end;
$$;

create or replace function public.supportos_chatwoot_release_router_lease(p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.supportos_chatwoot_router_state
    set router_lease_token = null, router_lease_until = null
    where id = 'main' and router_lease_token = p_lease_token;
  return found;
end;
$$;

-- The same reservation path handles auto-routing and manual changes.
-- A manual operation bypasses capacity but still blocks other changes to this chat.
create or replace function public.supportos_chatwoot_reserve_conversation(
  p_operation_token uuid,
  p_conversation_id bigint,
  p_agent_ids bigint[],
  p_active_counts jsonb,
  p_lease_token uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  chosen bigint;
  previous_agent bigint;
  original_assignee bigint;
  snapshot_start timestamptz;
  current_time_at timestamptz;
begin
  if p_operation_token is null or p_conversation_id is null or p_conversation_id <= 0 then
    return jsonb_build_object('reserved', false);
  end if;
  perform pg_advisory_xact_lock(87120, 1);
  current_time_at := clock_timestamp();

  if exists (select 1 from public.supportos_chatwoot_routing
      where conversation_id = p_conversation_id and status = 'routing'
      and coalesce(operation_expires_at, updated_at + interval '60 seconds') > current_time_at) then
    return jsonb_build_object('reserved', false);
  end if;
  select case when status = 'assigned' then chatwoot_agent_id else operation_previous_agent_id end
    into original_assignee
    from public.supportos_chatwoot_routing where conversation_id = p_conversation_id;

  if p_lease_token is not null then
    select last_agent_id, last_run_at into previous_agent, snapshot_start
      from public.supportos_chatwoot_router_state
      where id = 'main' and router_lease_token = p_lease_token
        and router_lease_until > current_time_at + interval '10 seconds'
      for update;
    if not found then return jsonb_build_object('reserved', false); end if;

    select candidate.agent_id into chosen
      from unnest(p_agent_ids) as candidate(agent_id)
      join public.supportos_chatwoot_presence presence on presence.chatwoot_agent_id = candidate.agent_id
      join public.supportos_users member on member.id = presence.user_id and member.status = 'active'
      left join public.supportos_chatwoot_agent_limits limits on limits.chatwoot_agent_id = candidate.agent_id
      where presence.accepting and presence.heartbeat_at >= current_time_at - interval '90 seconds'
        and (p_active_counts ->> candidate.agent_id::text) ~ '^[0-9]{1,9}$'
        and (p_active_counts ->> candidate.agent_id::text)::integer
          + (select count(*) from public.supportos_chatwoot_routing r
             where r.conversation_id <> p_conversation_id
             and ((r.status = 'routing'
               and (r.chatwoot_agent_id = candidate.agent_id or r.operation_previous_agent_id = candidate.agent_id)
               and coalesce(r.operation_expires_at, r.updated_at + interval '60 seconds') > current_time_at)
               or (r.status = 'assigned' and r.chatwoot_agent_id = candidate.agent_id and r.updated_at >= snapshot_start)))
          < coalesce(limits.max_active_chats, 4)
      order by (previous_agent is null or candidate.agent_id > previous_agent) desc, candidate.agent_id
      limit 1;
    if chosen is null then return jsonb_build_object('reserved', false); end if;
    update public.supportos_chatwoot_router_state set last_agent_id = chosen where id = 'main';
  else
    chosen := p_agent_ids[1];
  end if;

  insert into public.supportos_chatwoot_routing (
    conversation_id, chatwoot_agent_id, status, updated_at, operation_token, operation_expires_at, operation_previous_agent_id
  ) values (
    p_conversation_id, chosen, 'routing', current_time_at, p_operation_token, current_time_at + interval '45 seconds', original_assignee
  )
  on conflict (conversation_id) do update set
    chatwoot_agent_id = excluded.chatwoot_agent_id,
    status = excluded.status,
    updated_at = excluded.updated_at,
    operation_token = excluded.operation_token,
    operation_expires_at = excluded.operation_expires_at,
    operation_previous_agent_id = excluded.operation_previous_agent_id;
  return jsonb_build_object('reserved', true, 'agentId', chosen, 'previousAgentId', original_assignee);
end;
$$;

create or replace function public.supportos_chatwoot_finish_conversation_operation(
  p_conversation_id bigint, p_operation_token uuid, p_assignee_id bigint
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(87120, 1);
  update public.supportos_chatwoot_routing
    set status = case when p_assignee_id is null then 'failed' else 'assigned' end,
        chatwoot_agent_id = p_assignee_id,
        updated_at = clock_timestamp(),
        operation_token = null,
        operation_expires_at = null,
        operation_previous_agent_id = null
    where conversation_id = p_conversation_id and operation_token = p_operation_token;
  return found;
end;
$$;

revoke all on function public.supportos_chatwoot_acquire_router_lease(uuid, integer, integer),
  public.supportos_chatwoot_release_router_lease(uuid),
  public.supportos_chatwoot_reserve_conversation(uuid, bigint, bigint[], jsonb, uuid),
  public.supportos_chatwoot_finish_conversation_operation(bigint, uuid, bigint) from public, anon, authenticated;
grant execute on function public.supportos_chatwoot_acquire_router_lease(uuid, integer, integer),
  public.supportos_chatwoot_release_router_lease(uuid),
  public.supportos_chatwoot_reserve_conversation(uuid, bigint, bigint[], jsonb, uuid),
  public.supportos_chatwoot_finish_conversation_operation(bigint, uuid, bigint) to service_role;

create table public.supportos_chatwoot_operations (
  id text primary key check (id = 'main'),
  settings jsonb not null default '{"agents":{},"inboxes":{}}'
    check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 262144),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.supportos_chatwoot_operations(id) values ('main');
alter table public.supportos_chatwoot_operations enable row level security;
revoke all on public.supportos_chatwoot_operations from public, anon, authenticated;
grant select, update on public.supportos_chatwoot_operations to service_role;
