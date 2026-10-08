-- Published QC glossary is the only team terminology source. Drafts and history
-- remain in supportos_ai_guidance until the existing QC publish action runs.
create table public.supportos_glossary_terms (
 id text primary key,
 source text not null check (length(trim(source)) between 1 and 160),
 target text not null check (length(trim(target)) between 1 and 8000),
 language text not null default '',
 project_id text not null default '',
 note text not null default '',
 priority integer not null default 0,
 enabled boolean not null default true,
 active boolean not null default true,
 origin text not null default 'qc',
 published_at timestamptz,
 updated_at timestamptz not null default now()
);

create index supportos_glossary_terms_active_scope_idx
 on public.supportos_glossary_terms (active, language, project_id, priority desc);

alter table public.supportos_glossary_terms enable row level security;
revoke all on public.supportos_glossary_terms from public, anon, authenticated;
grant all on public.supportos_glossary_terms to service_role;

-- Backfill only previously published QC snapshots. Existing normalized rows win.
insert into public.supportos_glossary_terms
 (id, source, target, language, project_id, note, priority, enabled, origin, published_at)
select entry->>'id', published->>'title', published->>'content',
 coalesce(published->>'language', ''), coalesce(published->>'project', ''),
 coalesce(published->>'category', ''),
 case when coalesce(published->>'priority', '') ~ '^[0-9]{1,3}$'
  then (published->>'priority')::integer else 0 end,
 coalesce((published->>'enabled')::boolean, true), 'qc',
 case when coalesce(entry->>'publishedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
  then (entry->>'publishedAt')::timestamptz else null end
from public.supportos_ai_guidance guidance
cross join lateral jsonb_array_elements(coalesce(guidance.document->'entries', '[]'::jsonb)) entry
cross join lateral (select entry->'published' as published) snapshot
where guidance.id = 'main' and entry->>'kind' = 'glossary'
 and entry->>'status' <> 'archived'
 and jsonb_typeof(published) = 'object'
 and nullif(trim(published->>'title'), '') is not null
 and nullif(trim(published->>'content'), '') is not null
on conflict (id) do nothing;

create function public.supportos_sync_published_glossary()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.document->'entries' is not distinct from old.document->'entries' then
  return new;
 end if;

 update public.supportos_glossary_terms term set active = false, updated_at = clock_timestamp()
 where term.origin = 'qc' and term.active
  and not exists (
   select 1 from jsonb_array_elements(coalesce(new.document->'entries', '[]'::jsonb)) entry
   where entry->>'id' = term.id and entry->>'kind' = 'glossary'
    and entry->>'status' <> 'archived'
    and jsonb_typeof(entry->'published') = 'object'
  );

 insert into public.supportos_glossary_terms
  (id, source, target, language, project_id, note, priority, enabled, active, origin, published_at, updated_at)
 select entry->>'id', published->>'title', published->>'content',
  coalesce(published->>'language', ''), coalesce(published->>'project', ''),
  coalesce(published->>'category', ''),
  case when coalesce(published->>'priority', '') ~ '^[0-9]{1,3}$'
   then (published->>'priority')::integer else 0 end,
  coalesce((published->>'enabled')::boolean, true), true, 'qc',
  case when coalesce(entry->>'publishedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
   then (entry->>'publishedAt')::timestamptz else null end,
  clock_timestamp()
 from jsonb_array_elements(coalesce(new.document->'entries', '[]'::jsonb)) entry
 cross join lateral (select entry->'published' as published) snapshot
 where entry->>'kind' = 'glossary' and entry->>'status' <> 'archived'
  and jsonb_typeof(published) = 'object'
  and nullif(trim(published->>'title'), '') is not null
  and nullif(trim(published->>'content'), '') is not null
 on conflict (id) do update set
  source = excluded.source, target = excluded.target, language = excluded.language,
  project_id = excluded.project_id, note = excluded.note, priority = excluded.priority,
  enabled = excluded.enabled, active = true, origin = 'qc',
  published_at = excluded.published_at, updated_at = excluded.updated_at
 where (public.supportos_glossary_terms.source, public.supportos_glossary_terms.target,
        public.supportos_glossary_terms.language, public.supportos_glossary_terms.project_id,
        public.supportos_glossary_terms.note, public.supportos_glossary_terms.priority,
        public.supportos_glossary_terms.enabled, public.supportos_glossary_terms.active,
        public.supportos_glossary_terms.published_at)
  is distinct from
       (excluded.source, excluded.target, excluded.language, excluded.project_id,
        excluded.note, excluded.priority, excluded.enabled, true, excluded.published_at);
 return new;
end;
$$;

revoke all on function public.supportos_sync_published_glossary() from public, anon, authenticated;

create trigger supportos_sync_published_glossary
 after update of document on public.supportos_ai_guidance
 for each row execute function public.supportos_sync_published_glossary();
