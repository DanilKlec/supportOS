-- Reconcile normalized publications without unqualified DELETEs.
-- Keep the Supabase safe-update guard, RBAC, optimistic versions and audit.
-- Applying this migration changes the RPC only; it publishes no team data.

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
 published_translations jsonb;
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
  if exists (
   select email.value->>'id'
   from jsonb_array_elements(payload) project
   cross join lateral jsonb_array_elements(coalesce(project.value->'emails', '[]'::jsonb)) email
   group by email.value->>'id' having count(*) > 1
  ) then
   raise exception using errcode = '23505', message = 'Повторяющиеся идентификаторы адресов';
  end if;

  delete from public.supportos_project_emails existing
  where not exists (
   select 1 from jsonb_array_elements(payload) project
   cross join lateral jsonb_array_elements(coalesce(project.value->'emails', '[]'::jsonb)) email
   where email.value->>'id' = existing.id
  );

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
    )
    on conflict (id) do update set
     project_id = excluded.project_id, type = excluded.type, email = excluded.email,
     note = excluded.note, sort_order = excluded.sort_order, updated_at = excluded.updated_at;
   end loop;
  end loop;

 elsif dataset = 'bonuses' then
  if exists (
   select bonus.value->>'id'
   from jsonb_array_elements(payload) project
   cross join lateral jsonb_array_elements(coalesce(project.value->'bonuses', '[]'::jsonb)) bonus
   group by bonus.value->>'id' having count(*) > 1
  ) then
   raise exception using errcode = '23505', message = 'Повторяющиеся идентификаторы бонусов';
  end if;

  delete from public.supportos_welcome_bonuses existing
  where not exists (
   select 1 from jsonb_array_elements(payload) project
   cross join lateral jsonb_array_elements(coalesce(project.value->'bonuses', '[]'::jsonb)) bonus
   where bonus.value->>'id' = existing.id
  );

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
    )
    on conflict (id) do update set
     project_id = excluded.project_id, name = excluded.name,
     min_deposit_amount = excluded.min_deposit_amount, min_deposit_currency = excluded.min_deposit_currency,
     sort_order = excluded.sort_order, valid_until = excluded.valid_until, review_due = excluded.review_due,
     checked_at = excluded.checked_at, responsible = excluded.responsible, updated_at = excluded.updated_at;

    if jsonb_typeof(bonus_item->'translations') = 'array'
     and jsonb_array_length(bonus_item->'translations') > 0 then
     published_translations := bonus_item->'translations';
    elsif nullif(bonus_item->>'content', '') is not null then
     published_translations := jsonb_build_array(jsonb_build_object('language', 'ru', 'content', bonus_item->>'content'));
    else
     published_translations := '[]'::jsonb;
    end if;

    delete from public.supportos_welcome_bonus_translations existing
    where existing.welcome_bonus_id = bonus_item->>'id'
     and not exists (
      select 1 from jsonb_array_elements(published_translations) translation
      where lower(trim(translation.value->>'language')) = existing.language
     );

    for translation_item in select value from jsonb_array_elements(published_translations)
    loop
     insert into public.supportos_welcome_bonus_translations (
      welcome_bonus_id, language, content, created_at, updated_at
     ) values (
      bonus_item->>'id', lower(trim(translation_item->>'language')),
      coalesce(translation_item->>'content', ''), clock_timestamp(), clock_timestamp()
     )
     on conflict (welcome_bonus_id, language) do update set
      content = excluded.content, updated_at = excluded.updated_at;
    end loop;
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

  if exists (
   select rule.value->>'id' from jsonb_array_elements(coalesce(document_item->'rules', '[]'::jsonb)) rule
   group by rule.value->>'id' having count(*) > 1
  ) or exists (
   select lower(trim(currency.value->>'name')) from jsonb_array_elements(coalesce(document_item->'currencyTables', '[]'::jsonb)) currency
   group by lower(trim(currency.value->>'name')) having count(*) > 1
  ) then
   raise exception using errcode = '23505', message = 'Повторяющиеся идентификаторы правил или названия валютных таблиц';
  end if;

  delete from public.supportos_bonus_rules existing
  where not exists (
   select 1 from jsonb_array_elements(coalesce(document_item->'rules', '[]'::jsonb)) rule
   where rule.value->>'id' = existing.id
  );
  delete from public.supportos_currency_tables existing
  where not exists (
   select 1 from jsonb_array_elements(coalesce(document_item->'currencyTables', '[]'::jsonb)) currency
   where lower(trim(currency.value->>'name')) = lower(existing.name)
  );

  for table_item, item_position in
   select value, ordinality
   from jsonb_array_elements(coalesce(document_item->'currencyTables', '[]'::jsonb)) with ordinality
  loop
   insert into public.supportos_currency_tables (name, sort_order, created_at, updated_at)
   values (trim(table_item->>'name'), item_position::integer - 1, clock_timestamp(), clock_timestamp())
   on conflict (lower(name)) do update set
    name = excluded.name, sort_order = excluded.sort_order, updated_at = excluded.updated_at
   returning id into resolved_table_id;

   -- Rows have no client identity: replace only this named table's rows.
   delete from public.supportos_currency_rows where currency_table_id = resolved_table_id;

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
   )
   on conflict (id) do update set
    project_id = excluded.project_id, group_name = excluded.group_name,
    welcome_wager = excluded.welcome_wager, welcome_max_win = excluded.welcome_max_win,
    no_deposit = excluded.no_deposit, retention_wager = excluded.retention_wager,
    retention_max_win = excluded.retention_max_win, events = excluded.events,
    map = excluded.map, note = excluded.note, sort_order = excluded.sort_order, updated_at = excluded.updated_at;
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

-- Make the newly installed RPCs discoverable by the Data API.
notify pgrst, 'reload schema';
