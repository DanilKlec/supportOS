-- Atomic monthly replacement for employees explicitly included in the upload.
-- Only the authenticated supervisor API may invoke this through service_role.
create or replace function public.monitor_import_schedule(work_month date, people jsonb, records jsonb, username text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare r record; added integer := 0; removed integer := 0;
begin
 if work_month is null or work_month <> date_trunc('month',work_month)::date
  or username is null or length(username)=0
  or jsonb_typeof(people) is distinct from 'array' or jsonb_typeof(records) is distinct from 'array'
 then raise exception 'Invalid schedule'; end if;
 if jsonb_array_length(people) not between 1 and 500 or jsonb_array_length(records)>46500
 then raise exception 'Invalid schedule size'; end if;
 if exists(select 1 from jsonb_array_elements(people) p where jsonb_typeof(p) <> 'string')
  or (select count(*) from jsonb_array_elements_text(people)) <> (select count(distinct value) from jsonb_array_elements_text(people))
 then raise exception 'Invalid people'; end if;
 -- Serializes imports with manual assignment changes, including empty months.
 lock table public.monitor_assignments in share row exclusive mode;
 if exists(select 1 from jsonb_array_elements_text(people) p where not exists(select 1 from monitor_agents a where a.id=p.value))
 then raise exception 'Unknown agent'; end if;
 if exists(select 1 from jsonb_to_recordset(records) as x(day date,agent_id text,shift text)
   where x.day is null or x.day<work_month or x.day>=(work_month+interval '1 month')::date
   or x.agent_id is null or not people ? x.agent_id or x.shift is null or x.shift not in ('day','evening','night'))
 then raise exception 'Invalid assignment'; end if;
 if (select count(*) from jsonb_to_recordset(records) as x(day date,agent_id text,shift text)) <>
    (select count(*) from (select distinct * from jsonb_to_recordset(records) as x(day date,agent_id text,shift text)) u)
 then raise exception 'Duplicate assignment'; end if;
 for r in select a.* from monitor_assignments a
  where a.day>=work_month and a.day<(work_month+interval '1 month')::date and people ? a.agent_id
  and not exists(select 1 from jsonb_to_recordset(records) as x(day date,agent_id text,shift text)
    where x.day=a.day and x.agent_id=a.agent_id and x.shift=a.shift)
 loop
  perform monitor_assign(r.day,r.agent_id,r.shift,false,username); removed:=removed+1;
 end loop;
 for r in select x.* from jsonb_to_recordset(records) as x(day date,agent_id text,shift text)
  where not exists(select 1 from monitor_assignments a where a.day=x.day and a.agent_id=x.agent_id and a.shift=x.shift)
 loop
  perform monitor_assign(r.day,r.agent_id,r.shift,true,username); added:=added+1;
 end loop;
 return jsonb_build_object('added',added,'removed',removed);
end $$;
revoke execute on function public.monitor_import_schedule(date,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.monitor_import_schedule(date,jsonb,jsonb,text) to service_role;
