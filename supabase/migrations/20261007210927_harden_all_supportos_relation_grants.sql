-- React -> authenticated /api -> server RBAC -> Supabase. No browser table exceptions.
-- Extend the former fixed allowlist to every existing public.supportos_* relation,
-- its public partitions/inheritance children and owned sequences (regardless of name).
-- Keep server ACLs, existing policies, function bodies and all business data unchanged.
-- New table migrations must still explicitly REVOKE: default privileges cannot
-- be scoped to a name prefix, so this migration does not change unrelated defaults.
do $$
declare
 business_relations oid[];
 relation record;
 columns_sql text;
 table_privileges text := 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
begin
 if current_setting('server_version_num')::integer>=170000 then
  table_privileges := table_privileges||',MAINTAIN';
 end if;
 with recursive business(oid) as (
  select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and starts_with(c.relname,'supportos_')
   and c.relkind in ('r','p','v','m','f')
  union
  select child.oid from business parent join pg_inherits i on i.inhparent=parent.oid
   join pg_class child on child.oid=i.inhrelid
   join pg_namespace n on n.oid=child.relnamespace where n.nspname='public'
 ) select coalesce(array_agg(oid),'{}'::oid[]) into business_relations from business;

 for relation in
  select c.oid,c.relkind,n.nspname,c.relname from pg_class c
   join pg_namespace n on n.oid=c.relnamespace
  where c.oid=any(business_relations) order by c.oid
 loop
  if relation.relkind in ('r','p') then
   execute format('alter table %I.%I enable row level security',relation.nspname,relation.relname);
  end if;
  execute format('revoke all privileges on table %I.%I from public,anon,authenticated',relation.nspname,relation.relname);
  -- Table REVOKE does not remove independent column-level grants.
  select string_agg(quote_ident(a.attname),',' order by a.attnum) into columns_sql
   from pg_attribute a where a.attrelid=relation.oid and a.attnum>0 and not a.attisdropped;
  if columns_sql is not null then
   execute format('revoke all privileges (%s) on table %I.%I from public,anon,authenticated',columns_sql,relation.nspname,relation.relname);
  end if;
  -- Fail closed on inherited grants/ownership instead of silently leaving access.
  if has_table_privilege('anon',relation.oid,table_privileges)
   or has_table_privilege('authenticated',relation.oid,table_privileges)
   or has_any_column_privilege('anon',relation.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   or has_any_column_privilege('authenticated',relation.oid,'SELECT,INSERT,UPDATE,REFERENCES') then
   raise exception 'Browser grants remain on %.%; review role inheritance/ownership',relation.nspname,relation.relname using errcode='42501';
  end if;
 end loop;

 for relation in
  select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='S' and (
   (n.nspname='public' and starts_with(c.relname,'supportos_')) or exists (
    select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid
     and d.refclassid='pg_class'::regclass and d.refobjid=any(business_relations)
     and d.deptype in ('a','i')
   )
  ) order by c.oid
 loop
  execute format('revoke all privileges on sequence %I.%I from public,anon,authenticated',relation.nspname,relation.relname);
  if has_sequence_privilege('anon',relation.oid,'USAGE,SELECT,UPDATE')
   or has_sequence_privilege('authenticated',relation.oid,'USAGE,SELECT,UPDATE') then
   raise exception 'Browser grants remain on sequence %.%; review role inheritance/ownership',relation.nspname,relation.relname using errcode='42501';
  end if;
 end loop;
end $$;
