-- Backfill normalized reference tables from the published shared-content rows.
-- The legacy supportos_shared_content documents remain unchanged.
do $$
declare
 before_counts jsonb;
 source_counts jsonb;
 after_counts jsonb;
begin
 select jsonb_build_object(
  'projects', (select count(*) from public.supportos_projects),
  'project_emails', (select count(*) from public.supportos_project_emails),
  'welcome_bonuses', (select count(*) from public.supportos_welcome_bonuses),
  'welcome_bonus_translations', (select count(*) from public.supportos_welcome_bonus_translations),
  'bonus_rules', (select count(*) from public.supportos_bonus_rules),
  'currency_tables', (select count(*) from public.supportos_currency_tables),
  'currency_rows', (select count(*) from public.supportos_currency_rows),
  'currency_values', (select count(*) from public.supportos_currency_values)
 ) into before_counts;

 with
 email_documents as (
  select item
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) item
  where source.id = 'emails'
 ),
 email_addresses as (
  select address
  from email_documents document
  cross join lateral jsonb_array_elements(
   case
    when jsonb_typeof(document.item->'emails') = 'array' then document.item->'emails'
    else jsonb_build_array(
     jsonb_build_object('type', 'Support', 'email', document.item->>'supportEmail'),
     jsonb_build_object('type', 'KYC', 'email', document.item->>'kycEmail'),
     jsonb_build_object('type', 'VIP', 'email', document.item->>'vipEmail')
    )
   end
  ) address
  where nullif(trim(address->>'email'), '') is not null
 ),
 bonus_projects as (
  select project
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) project
  where source.id = 'bonuses'
 ),
 bonuses as (
  select bonus
  from bonus_projects project
  cross join lateral jsonb_array_elements(coalesce(project.project->'bonuses', '[]'::jsonb)) bonus
 ),
 translations as (
  select translation
  from bonuses bonus
  cross join lateral jsonb_array_elements(
   case
    when jsonb_typeof(bonus.bonus->'translations') = 'array' then bonus.bonus->'translations'
    else '[]'::jsonb
   end
  ) translation
  where length(trim(translation->>'language')) between 2 and 16
  union all
  select jsonb_build_object('language', 'ru', 'content', bonus.bonus->>'content')
  from bonuses bonus
  where nullif(bonus.bonus->>'content', '') is not null
   and not exists (
    select 1
    from jsonb_array_elements(
     case
      when jsonb_typeof(bonus.bonus->'translations') = 'array' then bonus.bonus->'translations'
      else '[]'::jsonb
     end
    ) translation
    where length(trim(translation->>'language')) between 2 and 16
   )
 ),
 bonus_tool_documents as (
  select document
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) document
  where source.id = 'bonus-tools'
 ),
 rules as (
  select rule
  from bonus_tool_documents document
  cross join lateral jsonb_array_elements(coalesce(document.document->'rules', '[]'::jsonb)) rule
 ),
 currency_tables as (
  select currency_table
  from bonus_tool_documents document
  cross join lateral jsonb_array_elements(coalesce(document.document->'currencyTables', '[]'::jsonb)) currency_table
 ),
 currency_rows as (
  select currency_row
  from currency_tables currency_table
  cross join lateral jsonb_array_elements(coalesce(currency_table.currency_table->'rows', '[]'::jsonb)) currency_row
 ),
 currency_values as (
  select value
  from currency_rows currency_row
  cross join lateral jsonb_each_text(coalesce(currency_row.currency_row->'values', '{}'::jsonb)) value
 )
 select jsonb_build_object(
  'email_projects', (select count(*) from email_documents),
  'project_emails', (select count(*) from email_addresses),
  'bonus_projects', (select count(*) from bonus_projects),
  'welcome_bonuses', (select count(*) from bonuses),
  'welcome_bonus_translations', (select count(*) from translations),
  'bonus_rules', (select count(*) from rules),
  'currency_tables', (select count(*) from currency_tables),
  'currency_rows', (select count(*) from currency_rows),
  'currency_values', (select count(*) from currency_values)
 ) into source_counts;

 with raw_candidates as (
  select
   item->>'id' as id,
   trim(item->>'projectName') as name,
   coalesce(
    nullif(trim(item->>'slug'), ''),
    nullif(trim(both '-' from regexp_replace(lower(trim(item->>'projectName')), '[^a-z0-9]+', '-', 'g')), ''),
    'project-' || md5(lower(trim(item->>'projectName')))
   ) as slug,
   item->>'sourceHash' as source_hash,
   coalesce(nullif(item->>'updatedAt', '')::timestamptz, source.updated_at) as updated_at,
   position
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) with ordinality records(item, position)
  where source.id = 'emails'
   and nullif(trim(item->>'id'), '') is not null
   and nullif(trim(item->>'projectName'), '') is not null
 ),
 candidates as (
  select distinct on (lower(slug)) *
  from raw_candidates
  order by lower(slug), position
 )
 insert into public.supportos_projects (id, name, slug, source_hash, created_at, updated_at)
 select id, name, slug, source_hash, updated_at, updated_at
 from candidates
 on conflict (lower(slug)) do update set
  name = excluded.name,
  source_hash = coalesce(excluded.source_hash, public.supportos_projects.source_hash),
  updated_at = excluded.updated_at;

 with raw_candidates as (
  select
   project->>'id' as id,
   trim(project->>'name') as name,
   coalesce(
    nullif(trim(project->>'slug'), ''),
    nullif(trim(both '-' from regexp_replace(lower(trim(project->>'name')), '[^a-z0-9]+', '-', 'g')), ''),
    'project-' || md5(lower(trim(project->>'name')))
   ) as slug,
   project->>'sheetId' as sheet_id,
   project->>'sourceUrl' as source_url,
   project->>'sourceHash' as source_hash,
   coalesce(nullif(project->>'updatedAt', '')::timestamptz, source.updated_at) as updated_at,
   position
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) with ordinality projects(project, position)
  where source.id = 'bonuses'
   and nullif(trim(project->>'id'), '') is not null
   and nullif(trim(project->>'name'), '') is not null
 ),
 candidates as (
  select distinct on (lower(slug)) *
  from raw_candidates
  order by lower(slug), position
 )
 insert into public.supportos_projects (id, name, slug, sheet_id, source_url, source_hash, created_at, updated_at)
 select id, name, slug, sheet_id, source_url, source_hash, updated_at, updated_at
 from candidates
 on conflict (lower(slug)) do update set
  name = excluded.name,
  sheet_id = coalesce(excluded.sheet_id, public.supportos_projects.sheet_id),
  source_url = coalesce(excluded.source_url, public.supportos_projects.source_url),
  source_hash = coalesce(excluded.source_hash, public.supportos_projects.source_hash),
  updated_at = excluded.updated_at;

 with raw_candidates as (
  select
   'bonus-rule-project-' || md5(lower(trim(rule->>'site'))) as id,
   trim(rule->>'site') as name,
   coalesce(
    nullif(trim(both '-' from regexp_replace(lower(trim(rule->>'site')), '[^a-z0-9]+', '-', 'g')), ''),
    'project-' || md5(lower(trim(rule->>'site')))
   ) as slug,
   document->>'sourceUrl' as source_url,
   source.updated_at,
   position
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) documents(document)
  cross join lateral jsonb_array_elements(coalesce(document->'rules', '[]'::jsonb)) with ordinality rules(rule, position)
  where source.id = 'bonus-tools'
   and nullif(trim(rule->>'site'), '') is not null
 ),
 candidates as (
  select distinct on (lower(slug)) *
  from raw_candidates
  order by lower(slug), position
 )
 insert into public.supportos_projects (id, name, slug, source_url, created_at, updated_at)
 select id, name, slug, source_url, updated_at, updated_at
 from candidates
 on conflict (lower(slug)) do update set
  source_url = coalesce(public.supportos_projects.source_url, excluded.source_url),
  updated_at = greatest(public.supportos_projects.updated_at, excluded.updated_at);

 with email_documents as (
  select item, source.updated_at as source_updated_at
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) item
  where source.id = 'emails'
 ),
 expanded as (
  select
   document.item,
   document.source_updated_at,
   address,
   position,
   coalesce(
    nullif(trim(document.item->>'slug'), ''),
    nullif(trim(both '-' from regexp_replace(lower(trim(document.item->>'projectName')), '[^a-z0-9]+', '-', 'g')), ''),
    'project-' || md5(lower(trim(document.item->>'projectName')))
   ) as project_slug
  from email_documents document
  cross join lateral jsonb_array_elements(
   case
    when jsonb_typeof(document.item->'emails') = 'array' then document.item->'emails'
    else jsonb_build_array(
     jsonb_build_object('type', 'Support', 'email', document.item->>'supportEmail'),
     jsonb_build_object('type', 'KYC', 'email', document.item->>'kycEmail'),
     jsonb_build_object('type', 'VIP', 'email', document.item->>'vipEmail')
    )
   end
  ) with ordinality addresses(address, position)
  where nullif(trim(address->>'email'), '') is not null
 ),
 candidates as (
  select distinct on (id)
   coalesce(
    nullif(expanded.address->>'id', ''),
    expanded.item->>'id' || ':' || expanded.position::text
   ) as id,
   project.id as project_id,
   trim(expanded.address->>'type') as type,
   lower(trim(expanded.address->>'email')) as email,
   nullif(expanded.address->>'note', '') as note,
   expanded.position::integer - 1 as sort_order,
   coalesce(nullif(expanded.item->>'updatedAt', '')::timestamptz, expanded.source_updated_at) as updated_at
  from expanded
  join public.supportos_projects project on lower(project.slug) = lower(expanded.project_slug)
  where nullif(trim(expanded.address->>'type'), '') is not null
  order by id, expanded.position
 )
 insert into public.supportos_project_emails (id, project_id, type, email, note, sort_order, created_at, updated_at)
 select id, project_id, type, email, note, sort_order, updated_at, updated_at
 from candidates
 on conflict (id) do update set
  project_id = excluded.project_id,
  type = excluded.type,
  email = excluded.email,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = excluded.updated_at;

 with expanded as (
  select
   project,
   bonus,
   bonus_position,
   source.updated_at as source_updated_at,
   coalesce(
    nullif(trim(project->>'slug'), ''),
    nullif(trim(both '-' from regexp_replace(lower(trim(project->>'name')), '[^a-z0-9]+', '-', 'g')), ''),
    'project-' || md5(lower(trim(project->>'name')))
   ) as project_slug
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) projects(project)
  cross join lateral jsonb_array_elements(coalesce(project->'bonuses', '[]'::jsonb)) with ordinality bonuses(bonus, bonus_position)
  where source.id = 'bonuses'
 ),
 candidates as (
  select distinct on (bonus->>'id')
   bonus->>'id' as id,
   normalized_project.id as project_id,
   trim(bonus->>'name') as name,
   nullif(bonus->>'minDepositAmount', '')::numeric as min_deposit_amount,
   nullif(trim(bonus->>'minDepositCurrency'), '') as min_deposit_currency,
   greatest(0, coalesce(nullif(bonus->>'order', '')::integer, bonus_position::integer - 1)) as sort_order,
   nullif(bonus->>'validUntil', '')::date as valid_until,
   nullif(bonus->>'reviewDue', '')::date as review_due,
   nullif(bonus->>'checkedAt', '')::timestamptz as checked_at,
   nullif(trim(bonus->>'responsible'), '') as responsible,
   coalesce(nullif(project->>'updatedAt', '')::timestamptz, source_updated_at) as updated_at
  from expanded
  join public.supportos_projects normalized_project on lower(normalized_project.slug) = lower(expanded.project_slug)
  where nullif(trim(bonus->>'id'), '') is not null
   and nullif(trim(bonus->>'name'), '') is not null
  order by bonus->>'id', bonus_position
 )
 insert into public.supportos_welcome_bonuses (
  id, project_id, name, min_deposit_amount, min_deposit_currency, sort_order,
  valid_until, review_due, checked_at, responsible, created_at, updated_at
 )
 select
  id, project_id, name, min_deposit_amount, min_deposit_currency, sort_order,
  valid_until, review_due, checked_at, responsible, updated_at, updated_at
 from candidates
 on conflict (id) do update set
  project_id = excluded.project_id,
  name = excluded.name,
  min_deposit_amount = excluded.min_deposit_amount,
  min_deposit_currency = excluded.min_deposit_currency,
  sort_order = excluded.sort_order,
  valid_until = excluded.valid_until,
  review_due = excluded.review_due,
  checked_at = excluded.checked_at,
  responsible = excluded.responsible,
  updated_at = excluded.updated_at;

 with bonuses as (
  select bonus, source.updated_at as source_updated_at
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) project
  cross join lateral jsonb_array_elements(coalesce(project->'bonuses', '[]'::jsonb)) bonus
  where source.id = 'bonuses'
 ),
 explicit_translations as (
  select
   bonus->>'id' as welcome_bonus_id,
   lower(trim(translation->>'language')) as language,
   translation->>'content' as content,
   coalesce(nullif(translation->>'updatedAt', '')::timestamptz, source_updated_at) as updated_at,
   position
  from bonuses
  cross join lateral jsonb_array_elements(
   case
    when jsonb_typeof(bonus->'translations') = 'array' then bonus->'translations'
    else '[]'::jsonb
   end
  ) with ordinality translations(translation, position)
  where length(trim(translation->>'language')) between 2 and 16
 ),
 fallback_translations as (
  select
   bonus->>'id' as welcome_bonus_id,
   'ru' as language,
   bonus->>'content' as content,
   source_updated_at as updated_at,
   1::bigint as position
  from bonuses
  where nullif(bonus->>'content', '') is not null
   and not exists (
    select 1
    from jsonb_array_elements(
     case
      when jsonb_typeof(bonus->'translations') = 'array' then bonus->'translations'
      else '[]'::jsonb
     end
    ) translation
    where length(trim(translation->>'language')) between 2 and 16
   )
 ),
 candidates as (
  select distinct on (welcome_bonus_id, language)
   welcome_bonus_id, language, content, updated_at
  from (
   select * from explicit_translations
   union all
   select * from fallback_translations
  ) combined
  where exists (
   select 1 from public.supportos_welcome_bonuses bonus where bonus.id = combined.welcome_bonus_id
  )
  order by welcome_bonus_id, language, position
 )
 insert into public.supportos_welcome_bonus_translations (
  welcome_bonus_id, language, content, created_at, updated_at
 )
 select welcome_bonus_id, language, content, updated_at, updated_at
 from candidates
 on conflict (welcome_bonus_id, language) do update set
  content = excluded.content,
  updated_at = excluded.updated_at;

 with candidates as (
  select distinct on (lower(trim(currency_table->>'name')))
   trim(currency_table->>'name') as name,
   position::integer - 1 as sort_order,
   source.updated_at
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) documents(document)
  cross join lateral jsonb_array_elements(coalesce(document->'currencyTables', '[]'::jsonb)) with ordinality tables(currency_table, position)
  where source.id = 'bonus-tools'
   and nullif(trim(currency_table->>'name'), '') is not null
  order by lower(trim(currency_table->>'name')), position
 )
 insert into public.supportos_currency_tables (name, sort_order, created_at, updated_at)
 select name, sort_order, updated_at, updated_at
 from candidates
 on conflict (lower(name)) do update set
  sort_order = excluded.sort_order,
  updated_at = excluded.updated_at;

 with candidates as (
  select
   normalized_table.id as currency_table_id,
   currency_row->>'base' as base,
   nullif(currency_row->>'baseAmount', '')::numeric as base_amount,
   row_position::integer - 1 as sort_order,
   source.updated_at
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) documents(document)
  cross join lateral jsonb_array_elements(coalesce(document->'currencyTables', '[]'::jsonb)) tables(currency_table)
  cross join lateral jsonb_array_elements(coalesce(currency_table->'rows', '[]'::jsonb)) with ordinality rows(currency_row, row_position)
  join public.supportos_currency_tables normalized_table on lower(normalized_table.name) = lower(trim(currency_table->>'name'))
  where source.id = 'bonus-tools'
   and nullif(trim(currency_row->>'base'), '') is not null
 )
 insert into public.supportos_currency_rows (
  currency_table_id, base, base_amount, sort_order, created_at, updated_at
 )
 select currency_table_id, base, base_amount, sort_order, updated_at, updated_at
 from candidates candidate
 where not exists (
  select 1
  from public.supportos_currency_rows existing
  where existing.currency_table_id = candidate.currency_table_id
   and existing.sort_order = candidate.sort_order
 );

 with source_values as (
  select
   normalized_table.id as currency_table_id,
   row_position::integer - 1 as row_position,
   upper(trim(value.key)) as currency_code,
   trim(value.value) as value_text,
   source.updated_at
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) documents(document)
  cross join lateral jsonb_array_elements(coalesce(document->'currencyTables', '[]'::jsonb)) tables(currency_table)
  cross join lateral jsonb_array_elements(coalesce(currency_table->'rows', '[]'::jsonb)) with ordinality rows(currency_row, row_position)
  cross join lateral jsonb_each_text(coalesce(currency_row->'values', '{}'::jsonb)) value
  join public.supportos_currency_tables normalized_table on lower(normalized_table.name) = lower(trim(currency_table->>'name'))
  where source.id = 'bonus-tools'
   and length(trim(value.key)) between 3 and 16
   and nullif(trim(value.value), '') is not null
 ),
 candidates as (
  select distinct on (normalized_row.id, source_value.currency_code)
   normalized_row.id as currency_row_id,
   source_value.currency_code,
   source_value.value_text,
   nullif(replace(substring(source_value.value_text from '[0-9]+[.,]?[0-9]*'), ',', '.'), '')::numeric as amount,
   source_value.updated_at
  from source_values source_value
  cross join lateral (
   select row.id
   from public.supportos_currency_rows row
   where row.currency_table_id = source_value.currency_table_id
    and row.sort_order = source_value.row_position
   order by row.id
   limit 1
  ) normalized_row
  order by normalized_row.id, source_value.currency_code
 )
 insert into public.supportos_currency_values (
  currency_row_id, currency_code, value_text, amount, created_at, updated_at
 )
 select currency_row_id, currency_code, value_text, amount, updated_at, updated_at
 from candidates
 on conflict (currency_row_id, currency_code) do update set
  value_text = excluded.value_text,
  amount = excluded.amount,
  updated_at = excluded.updated_at;

 with rules as (
  select rule, position, source.updated_at
  from public.supportos_shared_content source
  cross join lateral jsonb_array_elements(source.data) documents(document)
  cross join lateral jsonb_array_elements(coalesce(document->'rules', '[]'::jsonb)) with ordinality rules(rule, position)
  where source.id = 'bonus-tools'
 ),
 candidates as (
  select distinct on (rule->>'id')
   rule->>'id' as id,
   normalized_project.id as project_id,
   coalesce(rule->>'group', '') as group_name,
   coalesce(rule->>'welcomeWager', '') as welcome_wager,
   coalesce(rule->>'welcomeMaxWin', '') as welcome_max_win,
   coalesce(rule->>'noDeposit', '') as no_deposit,
   coalesce(rule->>'retentionWager', '') as retention_wager,
   coalesce(rule->>'retentionMaxWin', '') as retention_max_win,
   coalesce(rule->>'events', '') as events,
   coalesce(rule->>'map', '') as map,
   coalesce(rule->>'note', '') as note,
   position::integer - 1 as sort_order,
   rules.updated_at
  from rules
  cross join lateral (
   select project.id
   from public.supportos_projects project
   where lower(trim(project.name)) = lower(trim(rule->>'site'))
    or lower(project.slug) = coalesce(
     nullif(trim(both '-' from regexp_replace(lower(trim(rule->>'site')), '[^a-z0-9]+', '-', 'g')), ''),
     'project-' || md5(lower(trim(rule->>'site')))
    )
   order by case when lower(trim(project.name)) = lower(trim(rule->>'site')) then 0 else 1 end, project.id
   limit 1
  ) normalized_project
  where nullif(trim(rule->>'id'), '') is not null
  order by rule->>'id', position
 )
 insert into public.supportos_bonus_rules (
  id, project_id, group_name, welcome_wager, welcome_max_win, no_deposit,
  retention_wager, retention_max_win, events, map, note, sort_order,
  created_at, updated_at
 )
 select
  id, project_id, group_name, welcome_wager, welcome_max_win, no_deposit,
  retention_wager, retention_max_win, events, map, note, sort_order,
  updated_at, updated_at
 from candidates
 on conflict (id) do update set
  project_id = excluded.project_id,
  group_name = excluded.group_name,
  welcome_wager = excluded.welcome_wager,
  welcome_max_win = excluded.welcome_max_win,
  no_deposit = excluded.no_deposit,
  retention_wager = excluded.retention_wager,
  retention_max_win = excluded.retention_max_win,
  events = excluded.events,
  map = excluded.map,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = excluded.updated_at;

 select jsonb_build_object(
  'projects', (select count(*) from public.supportos_projects),
  'project_emails', (select count(*) from public.supportos_project_emails),
  'welcome_bonuses', (select count(*) from public.supportos_welcome_bonuses),
  'welcome_bonus_translations', (select count(*) from public.supportos_welcome_bonus_translations),
  'bonus_rules', (select count(*) from public.supportos_bonus_rules),
  'currency_tables', (select count(*) from public.supportos_currency_tables),
  'currency_rows', (select count(*) from public.supportos_currency_rows),
  'currency_values', (select count(*) from public.supportos_currency_values)
 ) into after_counts;

 raise notice 'supportos normalized backfill counts: before=%, source=%, after=%',
  before_counts, source_counts, after_counts;
end $$;
