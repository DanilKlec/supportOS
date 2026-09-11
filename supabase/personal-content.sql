-- Personal bonus documents never change a team's published catalog.
create table if not exists public.supportos_personal_content (
 owner_id uuid not null references public.supportos_users(id) on delete cascade,
 id text not null check(id in ('bonuses','bonus-tools')),
 data jsonb not null check(jsonb_typeof(data)='array'),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(owner_id,id)
);
alter table public.supportos_personal_content enable row level security;
revoke all on public.supportos_personal_content from anon,authenticated;
grant all on public.supportos_personal_content to service_role;
create or replace function public.supportos_save_personal_content(actor uuid,dataset text,expected integer,payload jsonb,operation text default 'save')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; previous public.supportos_personal_content; saved public.supportos_personal_content;
begin
 perform pg_advisory_xact_lock(71532841);
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' or not ((ctx->'permissions') ? 'bonuses.read') then raise exception using errcode='42501',message='Нет доступа к бонусам'; end if;
 if dataset not in ('bonuses','bonus-tools') or operation not in ('save','reset') then raise exception using errcode='22023',message='Некорректный справочник'; end if;
 select * into previous from public.supportos_personal_content where owner_id=actor and id=dataset for update;
 if coalesce(previous.version,0) is distinct from expected then raise exception using errcode='40001',message='Личная версия изменилась в другом окне. Обновите страницу.'; end if;
 if operation='reset' then
  delete from public.supportos_personal_content where owner_id=actor and id=dataset;
  return null;
 end if;
 if payload is null or jsonb_typeof(payload)<>'array' or length(payload::text)>3000000 then raise exception using errcode='22023',message='Некорректные данные'; end if;
 insert into public.supportos_personal_content(owner_id,id,data) values(actor,dataset,payload)
 on conflict(owner_id,id) do update set data=excluded.data,version=public.supportos_personal_content.version+1,updated_at=clock_timestamp() returning * into saved;
 return to_jsonb(saved);
end; $$;
revoke all on function public.supportos_save_personal_content(uuid,text,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.supportos_save_personal_content(uuid,text,integer,jsonb,text) to service_role;
