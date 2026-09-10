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
