-- Complete SupportOS schema. Existing RBAC assignments and custom permissions are preserved.
-- Shared content schema with roles sourced only from server-owned Auth metadata.
create table if not exists public.supportos_categories (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supportos_folders (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  category_id text not null,
  parent_id text,
  name text not null,
  icon text,
  color text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supportos_binds (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  source_bind_id text,
  source_hash text,
  import_batch_id text,
  imported boolean not null default false,
  slug text not null,
  category_id text not null,
  folder_id text,
  icon text,
  color text,
  tags jsonb not null default '[]'::jsonb,
  translations jsonb not null default '[]'::jsonb,
  ai_generated boolean,
  ai_translated boolean,
  ai_summary text,
  favorite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supportos_categories_owner_idx on public.supportos_categories(owner_id);
create index if not exists supportos_folders_owner_idx on public.supportos_folders(owner_id);
create index if not exists supportos_binds_owner_idx on public.supportos_binds(owner_id);
create index if not exists supportos_binds_source_idx on public.supportos_binds(source_bind_id);
create index if not exists supportos_binds_import_idx on public.supportos_binds(import_batch_id, source_hash);


-- SECURITY DEFINER is narrowly required to read the current caller's auth.users
-- row without granting browser roles direct access to the Auth schema.
create or replace function public.supportos_access(permission text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid()
  and coalesce(u.raw_app_meta_data->>'disabled','false') <> 'true'
  and case permission
   when 'read' then lower(coalesce(u.raw_app_meta_data->>'supportos_role',u.raw_app_meta_data->>'role')) in ('support','user','shift','supervisor','qc','admin','creator')
   when 'write' then lower(coalesce(u.raw_app_meta_data->>'supportos_role',u.raw_app_meta_data->>'role')) in ('shift','supervisor','qc','admin','creator')
   else false end);
$$;
revoke all on function public.supportos_access(text) from public,anon;
grant execute on function public.supportos_access(text) to authenticated,service_role;

-- Retire legacy privilege sources if an older installation has them.
do $$ declare table_name text; p record; begin
 foreach table_name in array array['supportos_profiles','supportos_admin_emails'] loop
  if to_regclass('public.'||table_name) is not null then
   execute format('revoke all on public.%I from anon, authenticated',table_name);
  end if;
 end loop;
 foreach table_name in array array['supportos_categories','supportos_folders','supportos_binds'] loop
  execute format('alter table public.%I enable row level security',table_name);
  for p in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
   execute format('drop policy %I on public.%I',p.policyname,table_name);
  end loop;
  execute format('revoke all on public.%I from anon, authenticated',table_name);
  execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
  execute format('grant all on public.%I to service_role',table_name);
  execute format('create policy content_read on public.%I for select to authenticated using ((select public.supportos_access(''read'')) and (owner_id is null or owner_id=(select auth.uid())))',table_name);
  execute format('create policy content_insert on public.%I for insert to authenticated with check ((select public.supportos_access(''read'')) and ((owner_id is null and (select public.supportos_access(''write''))) or owner_id=(select auth.uid())))',table_name);
  execute format('create policy content_update on public.%I for update to authenticated using ((select public.supportos_access(''read'')) and ((owner_id is null and (select public.supportos_access(''write''))) or owner_id=(select auth.uid()))) with check ((select public.supportos_access(''read'')) and ((owner_id is null and (select public.supportos_access(''write''))) or owner_id=(select auth.uid())))',table_name);
  execute format('create policy content_delete on public.%I for delete to authenticated using ((select public.supportos_access(''read'')) and ((owner_id is null and (select public.supportos_access(''write''))) or owner_id=(select auth.uid())))',table_name);
 end loop;
end $$;

-- Apply after access-control.sql. Existing metadata is imported once, never used
-- as an authorization fallback after this migration. No account is promoted.
create table if not exists public.supportos_users (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null default '', display_name text not null default '',
 status text not null default 'pending' check(status in ('active','disabled','pending')),
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.supportos_roles (
 id text primary key check(id ~ '^[a-z][a-z0-9_]{1,39}$'),
 name text not null check(length(name) between 1 and 80), description text not null default '',
 is_system boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists supportos_roles_name_unique on public.supportos_roles(lower(name));
create table if not exists public.supportos_permissions (
 id text primary key, name text not null, description text not null default '',
 creator_only boolean not null default false
);
create table if not exists public.supportos_role_permissions (
 role_id text not null references public.supportos_roles(id) on delete cascade,
 permission_id text not null references public.supportos_permissions(id),
 primary key(role_id,permission_id)
);
create index if not exists supportos_role_permissions_permission_idx on public.supportos_role_permissions(permission_id);
create table if not exists public.supportos_user_roles (
 user_id uuid not null references public.supportos_users(id) on delete cascade,
 role_id text not null references public.supportos_roles(id),
 assigned_by uuid references public.supportos_users(id) on delete set null,
 assigned_at timestamptz not null default now(), primary key(user_id,role_id)
);
create index if not exists supportos_user_roles_role_idx on public.supportos_user_roles(role_id);
create index if not exists supportos_user_roles_actor_idx on public.supportos_user_roles(assigned_by);
create table if not exists public.supportos_access_audit (
 id bigint generated always as identity primary key,
 actor_id uuid, actor_label text not null default '', action text not null, target_id text not null,
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index if not exists supportos_access_audit_time_idx on public.supportos_access_audit(created_at desc,id desc);

insert into public.supportos_permissions(id,name,description,creator_only) values
 ('work','Вход и личные настройки','Вход в рабочее пространство',false),
 ('binds.read','Просмотр биндов','Бинды, избранное и недавние записи',false),
 ('projects.read','Почты сайтов','Справочник сайтов и почт',false),
 ('bonuses.read','Просмотр бонусов','Депозитные бонусы и условия',false),
 ('tools','Рабочие инструменты','ИИ-помощник, переводчик, диагностика',false),
 ('monitor.read','Просмотр мониторинга','Статусы и журнал приёма чатов',false),
 ('monitor.write','Изменение графиков','Ручные назначения и импорт Excel',false),
 ('knowledge.write','Общие бинды','Редактирование общих биндов и импорт базы',false),
 ('bonuses.write','Редактирование бонусов','Изменение бонусной информации',false),
 ('ai.train','Правила ИИ','Общие инструкции и примеры ответов',false),
 ('users.manage','Управление пользователями','Создание аккаунтов, роли и отключение',false),
 ('roles.manage','Управление ролями','Создание ролей и настройка разрешений',false),
 ('technical','Технические настройки','Настройки API и интеграций',true)
on conflict(id) do nothing;

-- Only seed permissions for newly created roles: reruns preserve custom changes.
with new_roles as (
 insert into public.supportos_roles(id,name,is_system) values
 ('support','Support',true),('shift','Shift',true),('qc','QC',true),('admin','Admin',true),('creator','Creator',true)
 on conflict(id) do nothing returning id
)
insert into public.supportos_role_permissions(role_id,permission_id)
 select r.id,p.id from new_roles r cross join public.supportos_permissions p
 where r.id='creator' or (r.id='admin' and not p.creator_only)
 or (r.id='support' and p.id in ('work','binds.read','projects.read','bonuses.read'))
 or (r.id='shift' and p.id in ('work','binds.read','projects.read','bonuses.read','tools','monitor.read','monitor.write','knowledge.write','bonuses.write','ai.train'))
 or (r.id='qc' and p.id in ('work','binds.read','projects.read','bonuses.read','tools','monitor.read','knowledge.write','bonuses.write'));

-- The CTE limits role migration to profiles created by this run.
with imported as (
 insert into public.supportos_users(id,email,display_name,status)
 select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'name',''),120),
 case when raw_app_meta_data->>'disabled'='true' then 'disabled'
 when lower(coalesce(raw_app_meta_data->>'supportos_role',raw_app_meta_data->>'role')) in ('user','supervisor','support','shift','qc','admin','creator') then 'active' else 'pending' end
 from auth.users where coalesce(is_anonymous,false)=false
 on conflict(id) do nothing returning id
)
insert into public.supportos_user_roles(user_id,role_id)
 select i.id,r.id from imported i join auth.users u on u.id=i.id
 join public.supportos_roles r on r.id=case lower(coalesce(u.raw_app_meta_data->>'supportos_role',u.raw_app_meta_data->>'role'))
 when 'user' then 'support' when 'supervisor' then 'shift' else lower(coalesce(u.raw_app_meta_data->>'supportos_role',u.raw_app_meta_data->>'role')) end;

-- New accounts start without access, regardless of metadata supplied at signup.
create or replace function public.supportos_sync_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.is_anonymous,false) then return new; end if;
 insert into public.supportos_users(id,email) values(new.id,coalesce(new.email,''))
 on conflict(id) do update set email=excluded.email,updated_at=now();
 return new;
end $$;
revoke all on function public.supportos_sync_identity() from public,anon,authenticated;
drop trigger if exists supportos_identity_sync on auth.users;
create trigger supportos_identity_sync after insert or update of email on auth.users
 for each row execute function public.supportos_sync_identity();

do $$ declare t text; begin
 foreach t in array array['supportos_users','supportos_roles','supportos_permissions','supportos_user_roles','supportos_role_permissions','supportos_access_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.supportos_access_audit_id_seq to service_role;

create or replace function public.supportos_rbac_context(subject uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('status',u.status,'display_name',u.display_name,'email',u.email,'version',u.version,
 'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.id)
 from public.supportos_user_roles ur join public.supportos_roles r on r.id=ur.role_id where ur.user_id=u.id),'[]'::jsonb),
 'permissions',case when u.status='active' then coalesce((select jsonb_agg(x.permission_id order by x.permission_id) from
 (select distinct rp.permission_id from public.supportos_user_roles ur join public.supportos_role_permissions rp on rp.role_id=ur.role_id where ur.user_id=u.id) x),'[]'::jsonb) else '[]'::jsonb end)
 from public.supportos_users u where u.id=subject;
$$;
revoke all on function public.supportos_rbac_context(uuid) from public,anon,authenticated;
grant execute on function public.supportos_rbac_context(uuid) to service_role;

create or replace function public.supportos_rbac_list_users(search_text text,page_number integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with matching as (
  select u.* from public.supportos_users u where u.email ilike '%'||left(coalesce(search_text,''),120)||'%'
   or u.display_name ilike '%'||left(coalesce(search_text,''),120)||'%'
 ), page as (
  select * from matching order by email,id limit 50 offset greatest(0,page_number-1)*50
 ) select jsonb_build_object('total',(select count(*) from matching),'users',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('roles',coalesce((select jsonb_agg(role_id order by role_id) from public.supportos_user_roles where user_id=p.id),'[]'::jsonb)) order by p.email,p.id) from page p),'[]'::jsonb));
$$;
revoke all on function public.supportos_rbac_list_users(text,integer) from public,anon,authenticated;
grant execute on function public.supportos_rbac_list_users(text,integer) to service_role;

-- Existing content policies keep their function name; only the authority changes.
create or replace function public.supportos_access(permission text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.supportos_users u
 join public.supportos_user_roles ur on ur.user_id=u.id
 join public.supportos_role_permissions rp on rp.role_id=ur.role_id
 where u.id=auth.uid() and u.status='active'
 and rp.permission_id=case permission when 'read' then 'binds.read' when 'write' then 'knowledge.write' else permission end);
$$;
revoke all on function public.supportos_access(text) from public,anon;
grant execute on function public.supportos_access(text) to authenticated,service_role;

create or replace function public.supportos_rbac_change(actor uuid, operation text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; owner boolean; old_data jsonb; new_data jsonb; target uuid; role_key text; selected jsonb;
 target_status text; expected integer;
begin
 -- Serialize access changes and re-check actor after obtaining the lock.
 perform pg_advisory_xact_lock(71532841);
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' then raise exception using errcode='42501',message='Нет доступа'; end if;
 select exists(select 1 from public.supportos_user_roles where user_id=actor and role_id='creator') into owner;
 if operation='user.update' then
  if not (ctx->'permissions') ? 'users.manage' then raise exception using errcode='42501',message='Нет права управления пользователями'; end if;
  target:=(payload->>'id')::uuid; expected:=(payload->>'version')::integer;
  if target=actor then raise exception using errcode='42501',message='Свою роль и статус изменить нельзя'; end if;
  old_data:=public.supportos_rbac_context(target);
  if old_data is null then raise exception 'Пользователь не найден'; end if;
  if expected is null or (old_data->>'version')::integer<>expected then raise exception using errcode='40001',message='Данные изменились. Обновите список'; end if;
  if exists(select 1 from public.supportos_user_roles where user_id=target and role_id='creator') then raise exception using errcode='42501',message='Аккаунт Creator защищён'; end if;
  selected:=payload->'roles'; target_status:=payload->>'status';
  if jsonb_typeof(selected) is distinct from 'array' or target_status is null or target_status not in ('active','disabled','pending') then raise exception 'Некорректные роли или статус'; end if;
  if jsonb_array_length(selected)>30 or (target_status='active' and jsonb_array_length(selected)=0) then raise exception 'Активному аккаунту нужна роль'; end if;
  if exists(select 1 from jsonb_array_elements(selected) x where jsonb_typeof(x)<>'string') or
   exists(select 1 from jsonb_array_elements_text(selected) x where not exists(select 1 from public.supportos_roles r where r.id=x.value)) then raise exception 'Неизвестная роль'; end if;
  if not owner and (selected ? 'creator' or exists(select 1 from public.supportos_role_permissions rp
   where selected ? rp.role_id and not (ctx->'permissions') ? rp.permission_id)) then raise exception using errcode='42501',message='Нельзя выдать права выше собственных'; end if;
  if not owner and exists(select 1 from public.supportos_user_roles ur join public.supportos_role_permissions rp on rp.role_id=ur.role_id
    where ur.user_id=target and not (ctx->'permissions') ? rp.permission_id) then raise exception using errcode='42501',message='Нельзя изменять пользователя с более высокими правами'; end if;
  if jsonb_typeof(payload->'display_name') is distinct from 'string' or length(payload->>'display_name')>120 then raise exception 'Некорректное имя'; end if;
  update public.supportos_users set status=target_status,display_name=payload->>'display_name',version=version+1,updated_at=now() where id=target;
  delete from public.supportos_user_roles where user_id=target and not selected ? role_id;
  insert into public.supportos_user_roles(user_id,role_id,assigned_by) select target,value,actor from jsonb_array_elements_text(selected) on conflict do nothing;
  new_data:=public.supportos_rbac_context(target);
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data) values(actor,(select email from public.supportos_users where id=actor),operation,target::text,old_data,new_data);
  return new_data;
 elsif operation in ('role.save','role.delete') then
  if not (ctx->'permissions') ? 'roles.manage' then raise exception using errcode='42501',message='Нет права управления ролями'; end if;
  role_key:=payload->>'id';
  if role_key is null or role_key !~ '^[a-z][a-z0-9_]{1,39}$' or role_key='creator' then raise exception using errcode='42501',message='Некорректная или защищённая роль'; end if;
  if exists(select 1 from public.supportos_user_roles where user_id=actor and role_id=role_key) then raise exception using errcode='42501',message='Нельзя менять собственную роль'; end if;
  select to_jsonb(r)||jsonb_build_object('permissions',coalesce((select jsonb_agg(permission_id order by permission_id) from public.supportos_role_permissions where role_id=role_key),'[]'::jsonb)) into old_data from public.supportos_roles r where id=role_key;
  expected:=(payload->>'version')::integer;
  if (old_data is not null and (expected is null or expected<>(old_data->>'version')::integer)) or (old_data is null and coalesce(expected,0)<>0) then raise exception using errcode='40001',message='Роль изменена. Обновите список'; end if;
  if not owner and exists(select 1 from public.supportos_role_permissions where role_id=role_key and not (ctx->'permissions') ? permission_id) then raise exception using errcode='42501',message='Роль содержит более высокие права'; end if;
  if operation='role.delete' then
   if old_data is null or (old_data->>'is_system')::boolean or exists(select 1 from public.supportos_user_roles where role_id=role_key) then raise exception 'Удалить можно только неиспользуемую пользовательскую роль'; end if;
   delete from public.supportos_roles where id=role_key; new_data:=null;
  else
   selected:=payload->'permissions';
   if jsonb_typeof(selected) is distinct from 'array' or jsonb_array_length(selected)>50 then raise exception 'Некорректные разрешения'; end if;
   if exists(select 1 from jsonb_array_elements(selected) x where jsonb_typeof(x)<>'string') or exists(select 1 from jsonb_array_elements_text(selected) x where not exists(select 1 from public.supportos_permissions p where p.id=x.value)) then raise exception 'Неизвестное разрешение'; end if;
   if exists(select 1 from public.supportos_permissions where selected ? id and creator_only) then raise exception using errcode='42501',message='Технические права доступны только роли Creator'; end if;
   if not owner and exists(select 1 from jsonb_array_elements_text(selected) x where not (ctx->'permissions') ? x.value) then raise exception using errcode='42501',message='Нельзя выдать права выше собственных'; end if;
   if jsonb_typeof(payload->'name') is distinct from 'string' or length(trim(payload->>'name')) not between 1 and 80 or length(coalesce(payload->>'description',''))>500 then raise exception 'Некорректное название роли'; end if;
   insert into public.supportos_roles(id,name,description) values(role_key,trim(payload->>'name'),coalesce(payload->>'description',''))
   on conflict(id) do update set name=excluded.name,description=excluded.description,version=supportos_roles.version+1,updated_at=now();
   delete from public.supportos_role_permissions where role_id=role_key and not selected ? permission_id;
   insert into public.supportos_role_permissions(role_id,permission_id) select role_key,value from jsonb_array_elements_text(selected) on conflict do nothing;
   select to_jsonb(r)||jsonb_build_object('permissions',selected) into new_data from public.supportos_roles r where id=role_key;
  end if;
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data) values(actor,(select email from public.supportos_users where id=actor),operation,role_key,old_data,new_data);
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Неизвестная операция';
end $$;
revoke all on function public.supportos_rbac_change(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_rbac_change(uuid,text,jsonb) to service_role;

create table if not exists public.supportos_ai_guidance (
 id text primary key check(id='main'), content text not null default '' check(length(content)<=16000),
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
alter table public.supportos_ai_guidance enable row level security;
revoke all on public.supportos_ai_guidance from public,anon,authenticated;
grant all on public.supportos_ai_guidance to service_role;
insert into public.supportos_ai_guidance(id) values('main') on conflict do nothing;

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

-- Branch selection and explicitly addressed, read-only personal shares.
create table if not exists public.supportos_bind_shares (
 id uuid primary key default gen_random_uuid(),
 bind_id text not null references public.supportos_binds(id) on delete cascade,
 source_id text not null references public.supportos_binds(id) on delete cascade,
 owner_id uuid not null references public.supportos_users(id) on delete cascade,
 recipient_id uuid not null references public.supportos_users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(bind_id,recipient_id), check(owner_id<>recipient_id)
);
create index if not exists supportos_bind_shares_recipient on public.supportos_bind_shares(recipient_id);
create table if not exists public.supportos_bind_choices (
 user_id uuid not null references public.supportos_users(id) on delete cascade,
 source_id text not null references public.supportos_binds(id) on delete cascade,
 branch text not null, primary key(user_id,source_id)
);
create table if not exists public.supportos_bind_proposals (
 id uuid primary key default gen_random_uuid(),
 source_id text not null references public.supportos_binds(id) on delete cascade,
 author_id uuid not null references public.supportos_users(id) on delete cascade,
 base_version timestamptz not null,
 translations jsonb not null, tags jsonb not null,
 status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')),
 created_at timestamptz not null default now(), resolved_at timestamptz
);
create unique index if not exists supportos_bind_proposals_pending on public.supportos_bind_proposals(source_id,author_id) where status='pending';
create table if not exists public.supportos_bind_history (
 id bigint generated always as identity primary key,
 bind_id text not null, source_id text not null, owner_id uuid,
 snapshot jsonb not null, operation text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists supportos_bind_history_source on public.supportos_bind_history(source_id,created_at desc);
alter table public.supportos_bind_shares enable row level security;
alter table public.supportos_bind_choices enable row level security;
alter table public.supportos_bind_proposals enable row level security;
alter table public.supportos_bind_history enable row level security;
revoke all on public.supportos_bind_shares,public.supportos_bind_choices,public.supportos_bind_proposals,public.supportos_bind_history from anon,authenticated;
grant all on public.supportos_bind_shares,public.supportos_bind_choices,public.supportos_bind_proposals,public.supportos_bind_history to service_role;
grant usage,select on sequence public.supportos_bind_history_id_seq to service_role;

-- A private trigger captures all existing write paths, including browser RLS writes.
-- It is not an exposed RPC and cannot be called by API users.
create schema if not exists supportos_private;
revoke all on schema supportos_private from public,anon,authenticated;
create or replace function supportos_private.record_bind_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data public.supportos_binds;
begin
 if tg_op='DELETE' then row_data:=old; else row_data:=new; end if;
 if tg_op='UPDATE' and old.translations=new.translations and old.tags=new.tags then return new; end if;
 insert into public.supportos_bind_history(bind_id,source_id,owner_id,snapshot,operation)
 values(row_data.id,coalesce(row_data.source_bind_id,row_data.id),row_data.owner_id,to_jsonb(row_data),tg_op);
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function supportos_private.record_bind_history() from public,anon,authenticated;
drop trigger if exists supportos_bind_history_trigger on public.supportos_binds;
create trigger supportos_bind_history_trigger after insert or update or delete on public.supportos_binds
 for each row execute function supportos_private.record_bind_history();
insert into public.supportos_bind_history(bind_id,source_id,owner_id,snapshot,operation)
 select b.id,coalesce(b.source_bind_id,b.id),b.owner_id,to_jsonb(b),'BASELINE' from public.supportos_binds b
 where not exists(select 1 from public.supportos_bind_history h where h.bind_id=b.id);

create or replace function public.supportos_bind_branch_action(actor uuid, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; base public.supportos_binds; mine public.supportos_binds;
 recipient uuid; share_row public.supportos_bind_shares; proposal public.supportos_bind_proposals;
 source text:=payload->>'sourceId'; choice text:=payload->>'branch'; result jsonb;
begin
 perform pg_advisory_xact_lock(71532841);
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' or not ((ctx->'permissions') ? 'binds.read') then raise exception using errcode='42501',message='Нет доступа к биндам'; end if;
 if operation='list' then
  return jsonb_build_object(
   'choices',coalesce((select jsonb_object_agg(source_id,branch) from public.supportos_bind_choices where user_id=actor),'{}'),
   'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'sourceId',s.source_id,'sender',coalesce(nullif(u.display_name,''),u.email),'row',to_jsonb(b)))
     from public.supportos_bind_shares s join public.supportos_binds b on b.id=s.bind_id and b.owner_id=s.owner_id and b.source_bind_id=s.source_id
     join public.supportos_binds original on original.id=s.source_id and original.owner_id is null and not original.archived
     join public.supportos_users u on u.id=s.owner_id
     where s.recipient_id=actor and not b.archived and (public.supportos_rbac_context(s.owner_id)->>'status')='active'
      and ((public.supportos_rbac_context(s.owner_id)->'permissions') ? 'binds.read')),'[]'),
   'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'sourceId',s.source_id,'recipient',coalesce(nullif(u.display_name,''),u.email),'email',u.email)) from public.supportos_bind_shares s join public.supportos_users u on u.id=s.recipient_id where s.owner_id=actor),'[]')
  );
 end if;
 if operation='revoke' then
  select * into share_row from public.supportos_bind_shares where id=(payload->>'shareId')::uuid and owner_id=actor for update;
  if not found then raise exception using errcode='42501',message='Нет доступа к этой отправленной версии'; end if;
  delete from public.supportos_bind_choices where user_id=share_row.recipient_id and source_id=share_row.source_id and branch=share_row.id::text;
  delete from public.supportos_bind_shares where id=share_row.id;
  return jsonb_build_object('ok',true);
 end if;
 if operation in ('accept','reject','withdraw') then
  select * into proposal from public.supportos_bind_proposals where id=(payload->>'proposalId')::uuid for update;
  if not found or proposal.status<>'pending' then raise exception using errcode='40001',message='Предложение уже обработано'; end if;
  if operation='withdraw' then
   if proposal.author_id<>actor then raise exception using errcode='42501',message='Нельзя отозвать чужое предложение'; end if;
   update public.supportos_bind_proposals set status='withdrawn',resolved_at=clock_timestamp() where id=proposal.id;
   return jsonb_build_object('ok',true);
  end if;
  if not ((ctx->'permissions') ? 'knowledge.write') then raise exception using errcode='42501',message='Нет права публикации'; end if;
  if operation='accept' then
   select * into base from public.supportos_binds where id=proposal.source_id and owner_id is null and not archived for update;
   if not found or base.updated_at<>proposal.base_version then raise exception using errcode='40001',message='Основная версия изменилась. Сравните тексты и запросите новое предложение.'; end if;
   update public.supportos_binds set translations=proposal.translations,tags=proposal.tags,updated_at=clock_timestamp() where id=base.id;
  end if;
  update public.supportos_bind_proposals set status=case when operation='accept' then 'accepted' else 'rejected' end,resolved_at=clock_timestamp() where id=proposal.id;
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,after_data) values(actor,(select email from public.supportos_users where id=actor),'bind.proposal.'||operation,proposal.source_id,jsonb_build_object('proposalId',proposal.id));
  return jsonb_build_object('ok',true);
 end if;
 if operation='proposals' then
  return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('author',coalesce(nullif(u.display_name,''),u.email))) from public.supportos_bind_proposals p join public.supportos_users u on u.id=p.author_id where p.status='pending' and (p.author_id=actor or ((ctx->'permissions') ? 'knowledge.write')) and (source is null or p.source_id=source)),'[]');
 end if;
 select * into base from public.supportos_binds where id=source and owner_id is null and not archived for update;
 if not found then raise exception using errcode='22023',message='Основной бинд недоступен'; end if;
 if operation='history' then
  return coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (select * from public.supportos_bind_history where source_id=source and (owner_id is null or owner_id=actor) order by created_at desc limit 50) h),'[]');
 end if;
 select * into mine from public.supportos_binds where source_bind_id=source and owner_id=actor and not archived;
 if operation='choose' then
  if choice is null or (choice not in ('main','mine') and not exists(
   select 1 from public.supportos_bind_shares s join public.supportos_binds b on b.id=s.bind_id and b.owner_id=s.owner_id and not b.archived
   where s.id::text=choice and s.source_id=source and s.recipient_id=actor and (public.supportos_rbac_context(s.owner_id)->>'status')='active'
    and ((public.supportos_rbac_context(s.owner_id)->'permissions') ? 'binds.read')
  )) then raise exception using errcode='42501',message='Ветка недоступна'; end if;
  insert into public.supportos_bind_choices(user_id,source_id,branch) values(actor,source,choice) on conflict(user_id,source_id) do update set branch=excluded.branch;
  return jsonb_build_object('ok',true);
 end if;
 if mine.id is null then raise exception using errcode='22023',message='Сначала сохраните свою версию бинда'; end if;
 if operation='share' then
  select id into recipient from public.supportos_users where lower(email)=lower(trim(payload->>'email')) and status='active';
  if recipient is null or recipient=actor or not ((public.supportos_rbac_context(recipient)->'permissions') ? 'binds.read') then raise exception using errcode='22023',message='Укажите почту другого сотрудника с доступом к биндам'; end if;
  insert into public.supportos_bind_shares(bind_id,source_id,owner_id,recipient_id) values(mine.id,source,actor,recipient)
   on conflict(bind_id,recipient_id) do update set created_at=public.supportos_bind_shares.created_at returning * into share_row;
  return jsonb_build_object('id',share_row.id);
 end if;
 if operation='propose' then
  if exists(select 1 from public.supportos_bind_proposals where source_id=source and author_id=actor and status='pending') then raise exception using errcode='40001',message='Ваше предложение уже ожидает проверки'; end if;
  if base.updated_at is distinct from (payload->>'expected')::timestamptz then raise exception using errcode='40001',message='Основная версия изменилась. Обновите сравнение перед отправкой.'; end if;
  insert into public.supportos_bind_proposals(source_id,author_id,base_version,translations,tags) values(source,actor,base.updated_at,mine.translations,mine.tags) returning * into proposal;
  return to_jsonb(proposal);
 end if;
 raise exception using errcode='22023',message='Неизвестное действие';
end; $$;
revoke all on function public.supportos_bind_branch_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_bind_branch_action(uuid,text,jsonb) to service_role;
