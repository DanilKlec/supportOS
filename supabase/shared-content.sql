-- Shared publications are only writable through the audited server RPC.
with added as (
 insert into public.supportos_permissions(id,name,description,creator_only)
 values('projects.write','Редактирование почт','Публикация общих почт проектов',false)
 on conflict(id) do nothing returning id
)
insert into public.supportos_role_permissions(role_id,permission_id)
 select r.id,a.id from public.supportos_roles r cross join added a where r.id in ('admin','creator') on conflict do nothing;

create table if not exists public.supportos_shared_content (
 id text primary key check(id in ('emails','bonuses','bonus-tools')),
 data jsonb not null check(jsonb_typeof(data)='array'),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references public.supportos_users(id)
);
alter table public.supportos_shared_content drop constraint if exists supportos_shared_content_id_check;
alter table public.supportos_shared_content add constraint supportos_shared_content_id_check check(id in ('emails','bonuses','bonus-tools'));
alter table public.supportos_shared_content enable row level security;
revoke all on public.supportos_shared_content from anon,authenticated;
grant all on public.supportos_shared_content to service_role;

create or replace function public.supportos_publish_content(actor uuid, dataset text, expected integer, payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; previous public.supportos_shared_content; saved public.supportos_shared_content;
begin
 perform pg_advisory_xact_lock(71532841);
 ctx:=public.supportos_rbac_context(actor);
 if dataset not in ('emails','bonuses','bonus-tools') then raise exception using errcode='22023',message='Неизвестный справочник'; end if;
 if ctx is null or ctx->>'status'<>'active' or not ((ctx->'permissions') ? (case when dataset='emails' then 'projects.write' else 'bonuses.write' end)) then
  raise exception using errcode='42501',message='Нет права публикации'; end if;
 if payload is null or jsonb_typeof(payload)<>'array' or length(payload::text)>3000000 then raise exception using errcode='22023',message='Некорректные данные'; end if;
 select * into previous from public.supportos_shared_content where id=dataset for update;
 if coalesce(previous.version,0) is distinct from expected then raise exception using errcode='40001',message='Данные уже изменены. Загрузите общую версию перед публикацией.'; end if;
 insert into public.supportos_shared_content(id,data,version,updated_by) values(dataset,payload,1,actor)
 on conflict(id) do update set data=excluded.data,version=public.supportos_shared_content.version+1,updated_at=clock_timestamp(),updated_by=actor returning * into saved;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data)
 values(actor,(select email from public.supportos_users where id=actor),'content.publish',dataset,jsonb_build_object('version',previous.version),jsonb_build_object('version',saved.version,'records',jsonb_array_length(payload)));
 return to_jsonb(saved);
end; $$;
revoke all on function public.supportos_publish_content(uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_publish_content(uuid,text,integer,jsonb) to service_role;

create or replace function public.supportos_import_common_binds(actor uuid, payload jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; item jsonb; previous public.supportos_binds; total integer:=0;
begin
 perform pg_advisory_xact_lock(71532841);
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' or not ((ctx->'permissions') ? 'knowledge.write') then raise exception using errcode='42501',message='Нет права публикации биндов'; end if;
 if payload is null or jsonb_typeof(payload)<>'array' or jsonb_array_length(payload)>1000 then raise exception using errcode='22023',message='Не более 1000 биндов за импорт'; end if;
 for item in select value from jsonb_array_elements(payload) loop
  select * into previous from public.supportos_binds where id=item->>'id' for update;
  if previous.owner_id is not null then raise exception using errcode='42501',message='Нельзя заменить личный бинд'; end if;
  if exists(select 1 from public.supportos_binds where owner_id is null and slug=item->>'slug' and id<>item->>'id') then raise exception using errcode='40001',message='Бинд с таким slug уже опубликован. Повторите предварительный просмотр.'; end if;
  if previous.updated_at is distinct from (item->>'expected')::timestamptz then raise exception using errcode='40001',message='Общая база изменилась. Повторите предварительный просмотр.'; end if;
  insert into public.supportos_binds(id,slug,category_id,translations,tags,updated_at)
  values(item->>'id',item->>'slug','supportos-shared',item->'translations',item->'tags',clock_timestamp())
  on conflict(id) do update set translations=excluded.translations,tags=excluded.tags,updated_at=excluded.updated_at;
  total:=total+1;
 end loop;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,after_data)
 values(actor,(select email from public.supportos_users where id=actor),'content.binds_import','common',jsonb_build_object('records',total));
 return total;
end; $$;
revoke all on function public.supportos_import_common_binds(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_import_common_binds(uuid,jsonb) to service_role;
