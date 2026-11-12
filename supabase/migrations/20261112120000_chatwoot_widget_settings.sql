create table if not exists public.supportos_chatwoot_widget_settings (
  inbox_id bigint primary key,
  widget_position text not null default 'right' check (widget_position in ('left', 'right')),
  widget_type text not null default 'standard' check (widget_type in ('standard', 'expanded_bubble')),
  widget_locale text not null default 'ru' check (widget_locale in ('ru', 'en', 'de', 'pt', 'el')),
  launcher_title text not null default '' check (char_length(launcher_title) <= 80),
  updated_at timestamptz not null default now()
);

alter table public.supportos_chatwoot_widget_settings enable row level security;
revoke all on public.supportos_chatwoot_widget_settings from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_widget_settings to service_role;

create table if not exists public.supportos_chatwoot_agent_limits (
  chatwoot_agent_id bigint primary key,
  max_active_chats integer not null default 4 check (max_active_chats between 1 and 50),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.supportos_chatwoot_agent_limits enable row level security;
revoke all on public.supportos_chatwoot_agent_limits from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_agent_limits to service_role;

alter table public.supportos_chatwoot_router_state
  add column if not exists last_run_at timestamptz;

create or replace function public.supportos_chatwoot_acquire_router_lease(p_min_interval_seconds integer default 4)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_run timestamptz;
begin
  perform pg_advisory_xact_lock(87120, 1);
  select last_run_at into previous_run
    from public.supportos_chatwoot_router_state where id = 'main' for update;
  if previous_run is not null and previous_run > now() - make_interval(secs => greatest(1, least(30, p_min_interval_seconds))) then
    return false;
  end if;
  update public.supportos_chatwoot_router_state set last_run_at = now(), updated_at = now() where id = 'main';
  return true;
end;
$$;
revoke all on function public.supportos_chatwoot_acquire_router_lease(integer) from public, anon, authenticated;
grant execute on function public.supportos_chatwoot_acquire_router_lease(integer) to service_role;

create or replace function public.supportos_chatwoot_claim_route_with_capacity(
  p_conversation_id bigint,
  p_agent_ids bigint[],
  p_active_counts jsonb,
  p_capacities jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  chosen_agent bigint;
  previous_agent bigint;
  route_state text;
  route_updated timestamptz;
begin
  if p_conversation_id is null or coalesce(array_length(p_agent_ids, 1), 0) = 0 then
    return null;
  end if;
  perform pg_advisory_xact_lock(87120, 1);
  select status, updated_at into route_state, route_updated
    from public.supportos_chatwoot_routing where conversation_id = p_conversation_id;
  if route_state = 'assigned' or (route_state = 'routing' and route_updated > now() - interval '60 seconds') then
    return null;
  end if;
  select last_agent_id into previous_agent from public.supportos_chatwoot_router_state where id = 'main' for update;
  select candidate into chosen_agent
    from unnest(p_agent_ids) as candidate
    where coalesce((p_active_counts ->> candidate::text)::integer, 0)
        + (select count(*)::integer
           from public.supportos_chatwoot_routing r
           where r.chatwoot_agent_id = candidate
             and ((r.status = 'routing' and r.updated_at > now() - interval '60 seconds')
               or (r.status = 'assigned' and r.updated_at > now() - interval '10 seconds'))) <
      coalesce((p_capacities ->> candidate::text)::integer, 0)
    order by (previous_agent is null or candidate > previous_agent) desc, candidate
    limit 1;
  if chosen_agent is null then return null; end if;
  insert into public.supportos_chatwoot_routing(conversation_id, chatwoot_agent_id, status, created_at, updated_at)
    values (p_conversation_id, chosen_agent, 'routing', now(), now())
    on conflict (conversation_id) do update
      set chatwoot_agent_id = excluded.chatwoot_agent_id, status = 'routing', updated_at = now();
  update public.supportos_chatwoot_router_state
    set last_agent_id = chosen_agent, updated_at = now() where id = 'main';
  return chosen_agent;
end;
$$;
revoke all on function public.supportos_chatwoot_claim_route_with_capacity(bigint, bigint[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.supportos_chatwoot_claim_route_with_capacity(bigint, bigint[], jsonb, jsonb) to service_role;
