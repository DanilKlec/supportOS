-- Apply after the existing schema.sql. No customer messages are stored.
create table if not exists public.supportos_bind_feedback (
 bind_id text not null references public.supportos_binds(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('helpful','outdated')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(bind_id,user_id)
);
create index if not exists supportos_feedback_kind on public.supportos_bind_feedback(kind,updated_at desc);
create table if not exists public.supportos_knowledge_gaps (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 topic text not null check(length(topic) between 3 and 120 and topic !~ '[[:digit:]@/:.+_]' and topic !~* 'password|парол|token|токен|secret|секрет|credential|логин|login|http|www|email|e-mail|почт|телефон|phone|карт|card|account|аккаунт|счёт|счет|паспорт'),
 project_id text check(length(project_id)<=100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists supportos_gaps_recent on public.supportos_knowledge_gaps(created_at desc);
create index if not exists supportos_gaps_owner on public.supportos_knowledge_gaps(user_id,created_at desc);
alter table public.supportos_bind_feedback enable row level security;
alter table public.supportos_knowledge_gaps enable row level security;
revoke all on public.supportos_bind_feedback,public.supportos_knowledge_gaps from anon,authenticated;
grant select on public.supportos_bind_feedback,public.supportos_knowledge_gaps to authenticated;
grant all on public.supportos_bind_feedback,public.supportos_knowledge_gaps to service_role;
grant usage,select on sequence public.supportos_knowledge_gaps_id_seq to service_role;
drop policy if exists feedback_read on public.supportos_bind_feedback;
create policy feedback_read on public.supportos_bind_feedback for select to authenticated using(public.supportos_access('binds.read') and (user_id=(select auth.uid()) or public.supportos_access('knowledge.write')));
drop policy if exists gaps_read on public.supportos_knowledge_gaps;
create policy gaps_read on public.supportos_knowledge_gaps for select to authenticated using(public.supportos_access('knowledge.write'));

create or replace function public.supportos_knowledge_signal(actor uuid, operation text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; existing text; topic_value text;
begin
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' or not ((ctx->'permissions') ? 'binds.read') then raise exception using errcode='42501',message='Нет доступа'; end if;
 if operation='feedback' then
  if payload->>'kind' not in ('helpful','outdated') or payload->>'kind' is null then raise exception 'Invalid feedback'; end if;
  if not exists(select 1 from public.supportos_binds where id=payload->>'bindId' and owner_id is null and not archived) then raise exception 'Shared bind unavailable'; end if;
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(payload->>'bindId'));
  select kind into existing from public.supportos_bind_feedback where bind_id=payload->>'bindId' and user_id=actor;
  if existing=payload->>'kind' then delete from public.supportos_bind_feedback where bind_id=payload->>'bindId' and user_id=actor;
  else insert into public.supportos_bind_feedback(bind_id,user_id,kind) values(payload->>'bindId',actor,payload->>'kind') on conflict(bind_id,user_id) do update set kind=excluded.kind,updated_at=now(); end if;
  return jsonb_build_object('kind',case when existing=payload->>'kind' then null else payload->>'kind' end);
 elsif operation='gap' then
  topic_value:=payload->>'topic';
  if topic_value is null or topic_value !~ '^[[:alpha:] -]+$' or cardinality(string_to_array(topic_value,' '))>8 then raise exception 'Invalid topic'; end if;
  perform pg_advisory_xact_lock(hashtext(actor::text),71532842);
  if (select count(*) from public.supportos_knowledge_gaps where user_id=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many reports'; end if;
  insert into public.supportos_knowledge_gaps(user_id,topic,project_id) values(actor,topic_value,payload->>'projectId');
  return '{"saved":true}'::jsonb;
 end if;
 raise exception 'Invalid operation';
end $$;
revoke all on function public.supportos_knowledge_signal(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_knowledge_signal(uuid,text,jsonb) to service_role;
