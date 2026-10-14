-- Read-only ACL/RLS verification; reveals names/counts, never business rows or tokens.
-- Expected: violations=[], tables_without_rls=0. Counts depend on deployed schema.
with recursive business(oid) as (
 select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and starts_with(c.relname,'supportos_') and c.relkind in ('r','p','v','m','f')
 union
 select child.oid from business parent join pg_inherits i on i.inhparent=parent.oid
 join pg_class child on child.oid=i.inhrelid join pg_namespace n on n.oid=child.relnamespace
 where n.nspname='public'
), relations as (
 select c.oid,n.nspname,c.relname,c.relkind,c.relrowsecurity from business b
 join pg_class c on c.oid=b.oid join pg_namespace n on n.oid=c.relnamespace
 union
 select c.oid,n.nspname,c.relname,c.relkind,c.relrowsecurity from pg_class c
 join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and (
  (n.nspname='public' and starts_with(c.relname,'supportos_')) or exists (
   select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid
    and d.refclassid='pg_class'::regclass and d.refobjid in (select oid from business) and d.deptype in ('a','i')
  )
 )
), checked as (
 select r.*,role_name,
 case when r.relkind='S' then has_sequence_privilege(role_name,r.oid,'USAGE,SELECT,UPDATE') else
  has_table_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'||
   case when current_setting('server_version_num')::integer>=170000 then ',MAINTAIN' else '' end)
  or has_any_column_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')
 end browser_access
 from relations r cross join (values ('anon'),('authenticated')) roles(role_name)
)
select jsonb_build_object(
 'tables',(select count(*) from relations where relkind in ('r','p')),
 'views',(select count(*) from relations where relkind in ('v','m')),
 'sequences',(select count(*) from relations where relkind='S'),
 'tables_without_rls',(select count(*) from relations where relkind in ('r','p') and not relrowsecurity),
 'violations',coalesce((select jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'kind',relkind,'role',role_name)
  order by nspname,relname,role_name) from checked where browser_access),'[]'::jsonb)
) verification;
