create table if not exists public.supportos_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supportos_admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

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

create or replace function public.supportos_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.supportos_profiles
    where id = auth.uid()
      and role = 'admin'
  ) or exists (
    select 1
    from public.supportos_admin_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

alter table public.supportos_profiles enable row level security;
alter table public.supportos_admin_emails enable row level security;
alter table public.supportos_categories enable row level security;
alter table public.supportos_folders enable row level security;
alter table public.supportos_binds enable row level security;

drop policy if exists "profiles read own" on public.supportos_profiles;
create policy "profiles read own"
on public.supportos_profiles
for select
using (id = auth.uid());

drop policy if exists "profiles insert own" on public.supportos_profiles;
create policy "profiles insert own"
on public.supportos_profiles
for insert
with check (id = auth.uid() and role = 'user');

drop policy if exists "profiles update admin only" on public.supportos_profiles;
create policy "profiles update admin only"
on public.supportos_profiles
for update
using (public.supportos_is_admin())
with check (public.supportos_is_admin());

drop policy if exists "admin emails admin only" on public.supportos_admin_emails;
create policy "admin emails admin only"
on public.supportos_admin_emails
for all
using (public.supportos_is_admin())
with check (public.supportos_is_admin());

drop policy if exists "categories read global or own" on public.supportos_categories;
create policy "categories read global or own"
on public.supportos_categories
for select
using (owner_id is null or owner_id = auth.uid());

drop policy if exists "categories write global admin own user" on public.supportos_categories;
create policy "categories write global admin own user"
on public.supportos_categories
for all
using ((owner_id is null and public.supportos_is_admin()) or owner_id = auth.uid())
with check ((owner_id is null and public.supportos_is_admin()) or owner_id = auth.uid());

drop policy if exists "folders read global or own" on public.supportos_folders;
create policy "folders read global or own"
on public.supportos_folders
for select
using (owner_id is null or owner_id = auth.uid());

drop policy if exists "folders write global admin own user" on public.supportos_folders;
create policy "folders write global admin own user"
on public.supportos_folders
for all
using ((owner_id is null and public.supportos_is_admin()) or owner_id = auth.uid())
with check ((owner_id is null and public.supportos_is_admin()) or owner_id = auth.uid());

drop policy if exists "binds read global or own" on public.supportos_binds;
create policy "binds read global or own"
on public.supportos_binds
for select
using (owner_id is null or owner_id = auth.uid());

drop policy if exists "binds write global admin own user" on public.supportos_binds;
create policy "binds write global admin own user"
on public.supportos_binds
for all
using ((owner_id is null and public.supportos_is_admin()) or owner_id = auth.uid())
with check ((owner_id is null and public.supportos_is_admin()) or owner_id = auth.uid());
