create table public.supportos_chatwoot_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chatwoot_agent_id bigint not null unique,
  accepting boolean not null default false,
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.supportos_chatwoot_presence enable row level security;
revoke all on public.supportos_chatwoot_presence from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_presence to service_role;

create table public.supportos_chatwoot_routing (
  conversation_id bigint primary key,
  chatwoot_agent_id bigint not null,
  status text not null default 'routing' check (status in ('routing','assigned','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.supportos_chatwoot_routing enable row level security;
revoke all on public.supportos_chatwoot_routing from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_routing to service_role;

create table public.supportos_chatwoot_router_state (
  id text primary key check (id = 'main'),
  last_agent_id bigint,
  updated_at timestamptz not null default now()
);
alter table public.supportos_chatwoot_router_state enable row level security;
revoke all on public.supportos_chatwoot_router_state from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_router_state to service_role;
insert into public.supportos_chatwoot_router_state(id) values ('main') on conflict do nothing;

create or replace function public.supportos_chatwoot_claim_route(p_conversation_id bigint, p_agent_ids bigint[])
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
revoke all on function public.supportos_chatwoot_claim_route(bigint, bigint[]) from public, anon, authenticated;
grant execute on function public.supportos_chatwoot_claim_route(bigint, bigint[]) to service_role;
