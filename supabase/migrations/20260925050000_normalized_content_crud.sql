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

create or replace function public.supportos_upsert_content_project(
 project_key text,
 project_name text,
 project_slug text,
 project_sheet_id text default null,
 project_source_url text default null,
 project_source_hash text default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
 resolved_id text;
 normalized_slug text;
begin
 if nullif(trim(project_key), '') is null or nullif(trim(project_name), '') is null then
  raise exception using errcode = '22023', message = 'У проекта должны быть id и название';
 end if;

 normalized_slug := coalesce(
  nullif(trim(project_slug), ''),
  nullif(trim(both '-' from regexp_replace(lower(trim(project_name)), '[^a-z0-9]+', '-', 'g')), ''),
  'project-' || md5(lower(trim(project_name)))
 );

 select project.id into resolved_id
 from public.supportos_projects project
 where project.id = project_key or lower(project.slug) = lower(normalized_slug)
 order by (lower(project.slug) = lower(normalized_slug)) desc, (project.id = project_key) desc
 limit 1
 for update;

 if resolved_id is null then
  insert into public.supportos_projects (
   id, name, slug, sheet_id, source_url, source_hash, created_at, updated_at
  ) values (
   project_key, trim(project_name), normalized_slug,
   nullif(project_sheet_id, ''), nullif(project_source_url, ''), nullif(project_source_hash, ''),
   clock_timestamp(), clock_timestamp()
  )
  returning id into resolved_id;
 else
  update public.supportos_projects project set
   name = trim(project_name),
   slug = normalized_slug,
   sheet_id = coalesce(nullif(project_sheet_id, ''), project.sheet_id),
   source_url = coalesce(nullif(project_source_url, ''), project.source_url),
   source_hash = coalesce(nullif(project_source_hash, ''), project.source_hash),
   updated_at = clock_timestamp()
  where project.id = resolved_id;
 end if;

 return resolved_id;
end;
$$;

revoke all on function public.supportos_upsert_content_project(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.supportos_upsert_content_project(text, text, text, text, text, text) to service_role;

create or replace function public.supportos_publish_normalized_content(
 actor uuid,
 dataset text,
 expected integer,
 payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
 ctx jsonb;
 current_revision public.supportos_content_revisions;
 saved_revision public.supportos_content_revisions;
 current_version integer;
 project_item jsonb;
 email_item jsonb;
 bonus_item jsonb;
 translation_item jsonb;
 document_item jsonb;
 rule_item jsonb;
 table_item jsonb;
 row_item jsonb;
 resolved_project_id text;
 resolved_table_id bigint;
 resolved_row_id bigint;
 item_position bigint;
 nested_position bigint;
 value_key text;
 value_text text;
 source_url text;
 site text;
 revision_metadata jsonb := '{}'::jsonb;
begin
 perform pg_advisory_xact_lock(71532841);
 ctx := public.supportos_rbac_context(actor);

 if dataset not in ('emails', 'bonuses', 'bonus-tools') then
  raise exception using errcode = '22023', message = 'Неизвестный справочник';
 end if;
 if ctx is null or ctx->>'status' <> 'active'
  or not ((ctx->'permissions') ? (case when dataset = 'emails' then 'projects.write' else 'bonuses.write' end)) then
  raise exception using errcode = '42501', message = 'Нет права публикации';
 end if;
 if payload is null or jsonb_typeof(payload) <> 'array' or length(payload::text) > 3000000 then
  raise exception using errcode = '22023', message = 'Некорректные данные';
 end if;

 select * into current_revision
 from public.supportos_content_revisions revision
 where revision.id = dataset
 for update;

 current_version := coalesce(current_revision.version, 0);
 if current_version is distinct from expected then
  raise exception using errcode = '40001', message = 'Данные уже изменены. Загрузите общую версию перед публикацией.';
 end if;

 if dataset = 'emails' then
  delete from public.supportos_project_emails;

  for project_item, item_position in
   select value, ordinality from jsonb_array_elements(payload) with ordinality
  loop
   resolved_project_id := public.supportos_upsert_content_project(
    project_item->>'id', project_item->>'projectName', project_item->>'slug',
    null, null, project_item->>'sourceHash'
   );

   for email_item, nested_position in
    select value, ordinality
    from jsonb_array_elements(coalesce(project_item->'emails', '[]'::jsonb)) with ordinality
   loop
    insert into public.supportos_project_emails (
     id, project_id, type, email, note, sort_order, created_at, updated_at
    ) values (
     email_item->>'id', resolved_project_id, trim(email_item->>'type'), lower(trim(email_item->>'email')),
     nullif(email_item->>'note', ''), nested_position::integer - 1, clock_timestamp(), clock_timestamp()
    );
   end loop;
  end loop;

 elsif dataset = 'bonuses' then
  delete from public.supportos_welcome_bonuses;

  for project_item, item_position in
   select value, ordinality from jsonb_array_elements(payload) with ordinality
  loop
   resolved_project_id := public.supportos_upsert_content_project(
    project_item->>'id', project_item->>'name', project_item->>'slug',
    project_item->>'sheetId', project_item->>'sourceUrl', project_item->>'sourceHash'
   );

   for bonus_item, nested_position in
    select value, ordinality
    from jsonb_array_elements(coalesce(project_item->'bonuses', '[]'::jsonb)) with ordinality
   loop
    insert into public.supportos_welcome_bonuses (
     id, project_id, name, min_deposit_amount, min_deposit_currency, sort_order,
     valid_until, review_due, checked_at, responsible, created_at, updated_at
    ) values (
     bonus_item->>'id', resolved_project_id, trim(bonus_item->>'name'),
     nullif(bonus_item->>'minDepositAmount', '')::numeric,
     nullif(trim(bonus_item->>'minDepositCurrency'), ''),
     greatest(0, coalesce(nullif(bonus_item->>'order', '')::integer, nested_position::integer - 1)),
     nullif(bonus_item->>'validUntil', '')::date,
     nullif(bonus_item->>'reviewDue', '')::date,
     nullif(bonus_item->>'checkedAt', '')::timestamptz,
     nullif(trim(bonus_item->>'responsible'), ''),
     clock_timestamp(), clock_timestamp()
    );

    if jsonb_typeof(bonus_item->'translations') = 'array'
     and jsonb_array_length(bonus_item->'translations') > 0 then
     for translation_item in select value from jsonb_array_elements(bonus_item->'translations')
     loop
      insert into public.supportos_welcome_bonus_translations (
       welcome_bonus_id, language, content, created_at, updated_at
      ) values (
       bonus_item->>'id', lower(trim(translation_item->>'language')),
       coalesce(translation_item->>'content', ''), clock_timestamp(), clock_timestamp()
      )
      on conflict (welcome_bonus_id, language) do update set
       content = excluded.content,
       updated_at = excluded.updated_at;
     end loop;
    elsif nullif(bonus_item->>'content', '') is not null then
     insert into public.supportos_welcome_bonus_translations (
      welcome_bonus_id, language, content, created_at, updated_at
     ) values (
      bonus_item->>'id', 'ru', bonus_item->>'content', clock_timestamp(), clock_timestamp()
     );
    end if;
   end loop;
  end loop;

 else
  if jsonb_array_length(payload) <> 1 then
   raise exception using errcode = '22023', message = 'Некорректные данные bonus-tools';
  end if;
  document_item := payload->0;
  source_url := nullif(document_item->>'sourceUrl', '');
  revision_metadata := jsonb_build_object(
   'sourceUrl', coalesce(document_item->>'sourceUrl', ''),
   'loadedAt', coalesce(document_item->>'loadedAt', ''),
   'warnings', coalesce(document_item->'warnings', '[]'::jsonb)
  );

  delete from public.supportos_bonus_rules;
  delete from public.supportos_currency_tables;

  for table_item, item_position in
   select value, ordinality
   from jsonb_array_elements(coalesce(document_item->'currencyTables', '[]'::jsonb)) with ordinality
  loop
   insert into public.supportos_currency_tables (name, sort_order, created_at, updated_at)
   values (trim(table_item->>'name'), item_position::integer - 1, clock_timestamp(), clock_timestamp())
   returning id into resolved_table_id;

   for row_item, nested_position in
    select value, ordinality
    from jsonb_array_elements(coalesce(table_item->'rows', '[]'::jsonb)) with ordinality
   loop
    insert into public.supportos_currency_rows (
     currency_table_id, base, base_amount, sort_order, created_at, updated_at
    ) values (
     resolved_table_id, row_item->>'base', nullif(row_item->>'baseAmount', '')::numeric,
     nested_position::integer - 1, clock_timestamp(), clock_timestamp()
    ) returning id into resolved_row_id;

    for value_key, value_text in
     select key, value from jsonb_each_text(coalesce(row_item->'values', '{}'::jsonb))
    loop
     insert into public.supportos_currency_values (
      currency_row_id, currency_code, value_text, amount, created_at, updated_at
     ) values (
      resolved_row_id, upper(trim(value_key)), value_text,
      case
       when substring(replace(value_text, ' ', '') from '[0-9]+[.,]?[0-9]*') is null then null
       else replace(substring(replace(value_text, ' ', '') from '[0-9]+[.,]?[0-9]*'), ',', '.')::numeric
      end,
      clock_timestamp(), clock_timestamp()
     );
    end loop;
   end loop;
  end loop;

  for rule_item, item_position in
   select value, ordinality
   from jsonb_array_elements(coalesce(document_item->'rules', '[]'::jsonb)) with ordinality
  loop
   site := trim(rule_item->>'site');
   if nullif(site, '') is null then
    raise exception using errcode = '22023', message = 'У правила должно быть название проекта';
   end if;
   resolved_project_id := public.supportos_upsert_content_project(
    'bonus-rule-project-' || md5(lower(site)), site, null, null, source_url, null
   );
   insert into public.supportos_bonus_rules (
    id, project_id, group_name, welcome_wager, welcome_max_win, no_deposit,
    retention_wager, retention_max_win, events, map, note, sort_order, created_at, updated_at
   ) values (
    rule_item->>'id', resolved_project_id, coalesce(rule_item->>'group', ''),
    coalesce(rule_item->>'welcomeWager', ''), coalesce(rule_item->>'welcomeMaxWin', ''),
    coalesce(rule_item->>'noDeposit', ''), coalesce(rule_item->>'retentionWager', ''),
    coalesce(rule_item->>'retentionMaxWin', ''), coalesce(rule_item->>'events', ''),
    coalesce(rule_item->>'map', ''), coalesce(rule_item->>'note', ''),
    item_position::integer - 1, clock_timestamp(), clock_timestamp()
   );
  end loop;
 end if;

 insert into public.supportos_content_revisions (id, version, updated_at, updated_by, metadata)
 values (dataset, current_version + 1, clock_timestamp(), actor, revision_metadata)
 on conflict (id) do update set
  version = public.supportos_content_revisions.version + 1,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by,
  metadata = excluded.metadata
 returning * into saved_revision;

 insert into public.supportos_access_audit (
  actor_id, actor_label, action, target_id, before_data, after_data
 ) values (
  actor, (select email from public.supportos_users where id = actor),
  'content.publish', dataset,
  jsonb_build_object('version', current_version),
  jsonb_build_object('version', saved_revision.version, 'records', jsonb_array_length(payload), 'storage', 'normalized')
 );

 return jsonb_build_object(
  'id', dataset,
  'data', payload,
  'version', saved_revision.version,
  'updated_at', saved_revision.updated_at,
  'updated_by', saved_revision.updated_by
 );
end;
$$;

revoke all on function public.supportos_publish_normalized_content(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.supportos_publish_normalized_content(uuid, text, integer, jsonb) to service_role;
