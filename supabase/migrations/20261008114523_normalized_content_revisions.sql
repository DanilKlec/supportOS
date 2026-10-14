-- Atomic CRUD for normalized shared content. The legacy JSON store remains read-only.
create table if not exists public.supportos_content_revisions (
 id text primary key check (id in ('emails', 'bonuses', 'bonus-tools')),
 version integer not null check (version > 0),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.supportos_users(id),
 metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

alter table public.supportos_content_revisions
 add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.supportos_content_revisions enable row level security;
revoke all on public.supportos_content_revisions from public, anon, authenticated;
grant select, insert, update on public.supportos_content_revisions to service_role;

-- The transition document can still be read by the server fallback, but no
-- server path can publish into it after this migration.
revoke insert, update, delete, truncate, references, trigger
on public.supportos_shared_content from service_role;
grant select on public.supportos_shared_content to service_role;
revoke execute on function public.supportos_publish_content(uuid, text, integer, jsonb)
from service_role;

-- Preserve optimistic-concurrency versions when normalized rows came from the
-- transition backfill. This reads legacy metadata once; it never modifies it.
insert into public.supportos_content_revisions (id, version, updated_at, updated_by)
select
 dataset.id,
 greatest(coalesce(legacy.version, 1), 1),
 coalesce(greatest(legacy.updated_at, dataset.updated_at), legacy.updated_at, dataset.updated_at, now()),
 legacy.updated_by
from (
 select
  'emails'::text as id,
  (select max(updated_at) from public.supportos_project_emails) as updated_at,
  exists (select 1 from public.supportos_project_emails) as has_rows
 union all
 select
  'bonuses',
  greatest(
   (select max(updated_at) from public.supportos_welcome_bonuses),
   (select max(updated_at) from public.supportos_welcome_bonus_translations)
  ),
  exists (select 1 from public.supportos_welcome_bonuses)
 union all
 select
  'bonus-tools',
  greatest(
   (select max(updated_at) from public.supportos_bonus_rules),
   (select max(updated_at) from public.supportos_currency_tables),
   (select max(updated_at) from public.supportos_currency_rows),
   (select max(updated_at) from public.supportos_currency_values)
  ),
  exists (select 1 from public.supportos_bonus_rules)
   or exists (select 1 from public.supportos_currency_tables)
) dataset
left join public.supportos_shared_content legacy on legacy.id = dataset.id
where dataset.has_rows
on conflict (id) do nothing;
