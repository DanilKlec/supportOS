-- No browser/server runtime RPC caller. Only legacy authenticated RLS policies
-- reference this helper, on business tables already closed to browser roles.
-- Keep the helper body, policies, RBAC assignments and server API unchanged.
-- Abort on grant drift rather than silently breaking an actual RLS caller.
do $$
declare caller record;
begin
 for caller in
  select distinct p.polrelid from pg_depend d join pg_policy p on p.oid=d.objid
  where d.classid='pg_policy'::regclass and d.refclassid='pg_proc'::regclass
   and d.refobjid='public.supportos_access(text)'::regprocedure
 loop
  if exists(select 1 from (values('anon'),('authenticated')) roles(name)
   where has_table_privilege(roles.name,caller.polrelid,'SELECT,INSERT,UPDATE,DELETE')
    or has_any_column_privilege(roles.name,caller.polrelid,'SELECT,INSERT,UPDATE')) then
   raise exception 'supportos_access dependent table % has browser grants; review its RLS callers before revoking EXECUTE',caller.polrelid::regclass
    using errcode='42501';
  end if;
 end loop;
end $$;

revoke execute on function public.supportos_access(text) from public,anon,authenticated;
grant execute on function public.supportos_access(text) to service_role;
comment on function public.supportos_access(text) is
 'Legacy service-only compatibility helper using current database RBAC for auth.uid(), not JWT metadata. No direct browser RPC. Legacy RLS callers remain on server-only tables; browser EXECUTE is intentionally revoked.';
