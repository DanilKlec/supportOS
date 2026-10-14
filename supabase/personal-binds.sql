-- Personal versions keep their shared source. Managers act through an audited RPC.
with added as (
 insert into public.supportos_permissions(id,name,description,creator_only)
 values('binds.manage','Бинды сотрудников','Просмотр, изменение и сброс личных версий сотрудников',false)
 on conflict(id) do nothing returning id
)
insert into public.supportos_role_permissions(role_id,permission_id)
 select r.id,a.id from public.supportos_roles r cross join added a where r.id in ('admin','creator')
on conflict do nothing;

create unique index if not exists supportos_personal_source_unique
on public.supportos_binds(owner_id,source_bind_id) where owner_id is not null and source_bind_id is not null;

create or replace function public.supportos_personal_bind_change(actor uuid, target uuid, source_id text, operation text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; base public.supportos_binds; existing public.supportos_binds; saved public.supportos_binds; old_data jsonb; stamp timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(71532841);
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' or not ((ctx->'permissions') ? 'binds.read') then
  raise exception using errcode='42501',message='Нет доступа к биндам'; end if;
 if actor<>target and not ((ctx->'permissions') ? 'binds.manage') then
  raise exception using errcode='42501',message='Нет права изменять бинды сотрудников'; end if;
 if not exists(select 1 from public.supportos_users where id=target) then
  raise exception using errcode='22023',message='Пользователь не найден'; end if;
 select * into base from public.supportos_binds where id=source_id and owner_id is null and not archived;
 if not found then raise exception using errcode='22023',message='Общий бинд недоступен'; end if;
 select * into existing from public.supportos_binds where owner_id=target and source_bind_id=source_id for update;
 old_data:=case when found then to_jsonb(existing) else null end;
 if (existing.id is null and payload->>'expected' is not null)
 or (existing.id is not null and (payload->>'expected' is null or existing.updated_at<>(payload->>'expected')::timestamptz)) then
  raise exception using errcode='40001',message='Версия уже изменена. Обновите список перед сохранением'; end if;
 if operation='reset' then
  delete from public.supportos_binds where id=existing.id;
 elsif operation='save' then
  if jsonb_typeof(payload->'translations') is distinct from 'array'
   or jsonb_array_length(payload->'translations') not between 1 and 30
   or octet_length(payload::text)>500000 then
   raise exception using errcode='22023',message='Некорректные переводы'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'translations') t
    where jsonb_typeof(t->'title') is distinct from 'string' or length(trim(t->>'title')) not between 1 and 200
     or jsonb_typeof(t->'content') is distinct from 'string' or length(trim(t->>'content')) not between 1 and 30000
     or coalesce(t->>'language','') !~ '^[a-zA-Z-]{2,12}$')
   or (select count(*)<>count(distinct t->>'language') from jsonb_array_elements(payload->'translations') t) then
   raise exception using errcode='22023',message='Заполните название, текст и уникальный язык перевода'; end if;
  if jsonb_typeof(payload->'tags') is distinct from 'array' or jsonb_array_length(payload->'tags')>50
   or exists(select 1 from jsonb_array_elements(payload->'tags') t where jsonb_typeof(t)<>'string' or length(t::text)>202) then
   raise exception using errcode='22023',message='Некорректные теги'; end if;
  insert into public.supportos_binds(id,owner_id,source_bind_id,source_hash,slug,category_id,folder_id,tags,translations,created_at,updated_at)
  values(coalesce(existing.id,'personal-'||gen_random_uuid()::text),target,source_id,base.updated_at::text,
   coalesce(existing.slug,'personal-'||gen_random_uuid()::text),base.category_id,base.folder_id,payload->'tags',payload->'translations',coalesce(existing.created_at,stamp),stamp)
  on conflict(id) do update set translations=excluded.translations,tags=excluded.tags,source_hash=excluded.source_hash,updated_at=excluded.updated_at,archived=false
  returning * into saved;
 else raise exception using errcode='22023',message='Неизвестное действие'; end if;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data)
 values(actor,coalesce(ctx->>'email',''),'bind.'||operation,target::text,old_data,case when operation='save' then to_jsonb(saved) else jsonb_build_object('source_bind_id',source_id) end);
 return case when operation='save' then to_jsonb(saved) else jsonb_build_object('reset',true) end;
end $$;
revoke all on function public.supportos_personal_bind_change(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_personal_bind_change(uuid,uuid,text,text,jsonb) to service_role;
