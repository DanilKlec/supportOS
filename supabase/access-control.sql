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
