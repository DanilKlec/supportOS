-- Run once in Supabase SQL editor. Server-only tables; no browser access.
create table if not exists public.monitor_agents (
 id text primary key, name text not null, status text not null default 'unknown',
 observed_at timestamptz, changed_at timestamptz
);
create table if not exists public.monitor_observations (
 id bigint generated always as identity primary key,
 agent_id text not null references public.monitor_agents(id),
 at timestamptz not null, status text not null check(status in ('on','off','offline','unknown')),
 source text not null check(source in ('poll','webhook')), changed boolean not null
);
create index if not exists monitor_observations_time on public.monitor_observations(at, id);
create index if not exists monitor_observations_agent on public.monitor_observations(agent_id, at desc);
create table if not exists public.monitor_assignments (
 day date not null, agent_id text not null references public.monitor_agents(id),
 shift text not null check(shift in ('day','evening','night')), actor text not null,
 updated_at timestamptz not null default now(), primary key(day, agent_id, shift)
);
create table if not exists public.monitor_assignment_audit (
 id bigint generated always as identity primary key, day date not null, agent_id text not null,
 shift text not null, operation text not null, actor text not null, at timestamptz not null default now()
);
create table if not exists public.monitor_control (
 id text primary key, until_at timestamptz, updated_at timestamptz, count integer not null default 0
);

alter table public.monitor_agents enable row level security;
alter table public.monitor_observations enable row level security;
alter table public.monitor_assignments enable row level security;
alter table public.monitor_assignment_audit enable row level security;
alter table public.monitor_control enable row level security;
revoke all on public.monitor_agents, public.monitor_observations, public.monitor_assignments, public.monitor_assignment_audit, public.monitor_control from public, anon, authenticated;

-- Serialize observations per agent; reject a slow poll that predates a webhook.
create or replace function public.monitor_ingest(rows jsonb, observed timestamptz, origin text)
returns void language plpgsql security invoker set search_path = public as $$
declare item jsonb; previous monitor_agents%rowtype; transition boolean;
begin
 if origin not in ('poll','webhook') then raise exception 'Invalid source'; end if;
 for item in select value from jsonb_array_elements(rows) order by value->>'id' loop
  if item->>'status' not in ('on','off','offline','unknown') then raise exception 'Invalid status'; end if;
  insert into monitor_agents(id,name) values(item->>'id',coalesce(item->>'name',item->>'id')) on conflict do nothing;
  select * into previous from monitor_agents where id=item->>'id' for update;
  if previous.observed_at is not null and previous.observed_at >= observed then continue; end if;
  transition := previous.observed_at is null or previous.status <> item->>'status';
  insert into monitor_observations(agent_id,at,status,source,changed) values(item->>'id',observed,item->>'status',origin,transition);
  update monitor_agents set name=coalesce(item->>'name',name), status=item->>'status', observed_at=observed,
    changed_at=case when transition then observed else changed_at end where id=item->>'id';
 end loop;
 if origin = 'webhook' then
  insert into monitor_control(id,updated_at) values('webhook',observed) on conflict(id) do update set updated_at=greatest(monitor_control.updated_at,excluded.updated_at);
 end if;
end $$;

create or replace function public.monitor_lock(lock_id text, seconds integer)
returns boolean language plpgsql security invoker set search_path = public as $$
declare acquired text;
begin
 insert into monitor_control(id,until_at) values(lock_id,now()+make_interval(secs=>seconds))
 on conflict(id) do update set until_at=excluded.until_at where monitor_control.until_at < now()
 returning id into acquired;
 return acquired is not null;
end $$;

create or replace function public.monitor_login_limit(bucket text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare attempts integer;
begin
 delete from monitor_control where id like 'login:%' and until_at < now()-interval '1 day';
 insert into monitor_control(id,count,until_at) values(bucket,1,now()+interval '15 minutes')
 on conflict(id) do update set count=case when monitor_control.until_at < now() then 1 else monitor_control.count+1 end,
 until_at=case when monitor_control.until_at < now() then now()+interval '15 minutes' else monitor_control.until_at end
 returning count into attempts;
 return attempts <= 10;
end $$;

create or replace function public.monitor_assign(work_day date, agent text, shift_id text, enabled boolean, username text)
returns void language plpgsql security invoker set search_path = public as $$
begin
 if shift_id not in ('day','evening','night') then raise exception 'Invalid shift'; end if;
 if enabled then
  insert into monitor_assignments(day,agent_id,shift,actor) values(work_day,agent,shift_id,username) on conflict do nothing;
 else
  delete from monitor_assignments where day=work_day and agent_id=agent and shift=shift_id;
 end if;
 if found then insert into monitor_assignment_audit(day,agent_id,shift,operation,actor)
 values(work_day,agent,shift_id,case when enabled then 'assigned' else 'removed' end,username); end if;
end $$;

revoke execute on function public.monitor_ingest(jsonb,timestamptz,text), public.monitor_lock(text,integer), public.monitor_login_limit(text), public.monitor_assign(date,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.monitor_ingest(jsonb,timestamptz,text), public.monitor_lock(text,integer), public.monitor_login_limit(text), public.monitor_assign(date,text,text,boolean,text) to service_role;
grant all on public.monitor_agents, public.monitor_observations, public.monitor_assignments, public.monitor_assignment_audit, public.monitor_control to service_role;
grant usage, select on sequence public.monitor_observations_id_seq, public.monitor_assignment_audit_id_seq to service_role;

-- Aggregate on the server: a full day of 30-second samples must not travel to the browser.
create or replace function public.monitor_report(work_day date, cutoff timestamptz)
returns table(agent_id text, shift text, on_ms numeric, off_ms numeric, offline_ms numeric, unknown_ms numeric)
language sql stable security invoker set search_path = public as $$
 with windows as (
  select s.shift, (work_day::timestamp at time zone 'UTC')+s.begin_offset as begins,
   least(cutoff, (work_day::timestamp at time zone 'UTC')+s.end_offset) as ends
  from (values ('day',interval '6 hours',interval '13 hours 30 minutes'),
   ('evening',interval '13 hours',interval '20 hours'),('night',interval '20 hours',interval '30 hours')) as s(shift,begin_offset,end_offset)
 ), samples as (
  select o.*,least(o.at+interval '90 seconds',lead(o.at) over(partition by o.agent_id order by o.at,o.id)) as until_at
  from monitor_observations o
  where o.at >= (work_day::timestamp at time zone 'UTC')+interval '6 hours'-interval '90 seconds'
   and o.at <= least(cutoff,(work_day::timestamp at time zone 'UTC')+interval '30 hours')
 ), durations as (
  select a.id,w.shift,greatest(0,extract(epoch from w.ends-w.begins)*1000) as elapsed,
   coalesce(sum(greatest(0,extract(epoch from least(s.until_at,w.ends)-greatest(s.at,w.begins))*1000)) filter(where s.status='on'),0) as active,
   coalesce(sum(greatest(0,extract(epoch from least(s.until_at,w.ends)-greatest(s.at,w.begins))*1000)) filter(where s.status='off'),0) as inactive,
   coalesce(sum(greatest(0,extract(epoch from least(s.until_at,w.ends)-greatest(s.at,w.begins))*1000)) filter(where s.status='offline'),0) as disconnected
  from monitor_agents a cross join windows w
  left join samples s on s.agent_id=a.id and s.at < w.ends and s.until_at > w.begins
  group by a.id,w.shift,w.ends,w.begins
 ) select id,shift,active,inactive,disconnected,greatest(0,elapsed-active-inactive-disconnected) from durations;
$$;
revoke execute on function public.monitor_report(date,timestamptz) from public, anon, authenticated;
grant execute on function public.monitor_report(date,timestamptz) to service_role;


create index if not exists monitor_assignments_agent on public.monitor_assignments(agent_id);
create index if not exists monitor_assignment_audit_day on public.monitor_assignment_audit(day, at desc, id desc);

