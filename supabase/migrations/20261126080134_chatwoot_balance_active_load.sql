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
      cross join lateral (
        select case when (p_active_counts ->> candidate.agent_id::text) ~ '^[0-9]{1,9}$'
                    then (p_active_counts ->> candidate.agent_id::text)::integer end + count(*) as active_count
        from public.supportos_chatwoot_routing r
        where r.conversation_id <> p_conversation_id
          and ((r.status = 'routing'
            and (r.chatwoot_agent_id = candidate.agent_id or r.operation_previous_agent_id = candidate.agent_id)
            and coalesce(r.operation_expires_at, r.updated_at + interval '60 seconds') > current_time_at)
            or (r.status = 'assigned' and r.chatwoot_agent_id = candidate.agent_id and r.updated_at >= snapshot_start))
      ) workload
      where presence.accepting and presence.heartbeat_at >= current_time_at - interval '90 seconds'
        and workload.active_count < coalesce(limits.max_active_chats, 4)
      order by workload.active_count, (previous_agent is null or candidate.agent_id > previous_agent) desc, candidate.agent_id
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
