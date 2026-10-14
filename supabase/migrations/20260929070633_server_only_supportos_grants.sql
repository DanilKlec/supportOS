-- SupportOS business content is accessed through authenticated server APIs.
-- The server validates the caller's RBAC permissions before using service_role.
-- Revoke direct Data API privileges from anon/authenticated on the explicitly
-- listed content tables. Preserve RLS and existing policies as defense in depth.
-- Do not add blanket policies. Account, RBAC, Telegram, and monitor tables are
-- outside this allowlist; inspection found no direct anon/authenticated grants.
-- Future business table migrations must explicitly revoke anon/authenticated.
--
-- Exception: authenticated EXECUTE on supportos_access(text) is retained only
-- because existing row-scoped RLS policies call it. Browser code must use /api;
-- the helper evaluates the caller's own app-metadata permissions.

do $$
declare
 table_name text;
 table_oid regclass;
begin
 foreach table_name in array array[
  'supportos_categories',
  'supportos_folders',
  'supportos_binds',
  'supportos_bind_history',
  'supportos_bind_shares',
  'supportos_bind_proposals',
  'supportos_bind_choices',
  'supportos_bind_feedback',
  'supportos_knowledge_gaps',
  'supportos_ai_guidance',
  'supportos_shared_content',
  'supportos_personal_content',
  'supportos_projects',
  'supportos_project_emails',
  'supportos_welcome_bonuses',
  'supportos_welcome_bonus_translations',
  'supportos_bonus_rules',
  'supportos_currency_tables',
  'supportos_currency_rows',
  'supportos_currency_values',
  'supportos_content_revisions',
  'supportos_legacy_bind_mapping_report',
  'supportos_bundled_legacy_migration_report'
 ] loop
  table_oid := to_regclass(format('public.%I', table_name));
  if table_oid is not null then
   if (select relkind from pg_class where oid = table_oid) in ('r', 'p') then
    execute format('alter table public.%I enable row level security', table_name);
   end if;
   execute format(
    'revoke all privileges on table public.%I from public, anon, authenticated',
    table_name
   );
  end if;
 end loop;

 foreach table_name in array array[
  'supportos_knowledge_gaps_id_seq',
  'supportos_currency_tables_id_seq',
  'supportos_currency_rows_id_seq'
 ] loop
  if to_regclass(format('public.%I', table_name)) is not null then
   execute format(
    'revoke all privileges on sequence public.%I from public, anon, authenticated',
    table_name
   );
  end if;
 end loop;
end;
$$;

comment on function public.supportos_access(text) is
 'Authenticated EXECUTE is retained for existing row-scoped RLS policies only. SupportOS browser data access uses authenticated /api routes with server-side RBAC; this helper evaluates the caller''s own app-metadata permissions.';
