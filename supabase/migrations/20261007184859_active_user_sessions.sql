-- Auth has no public list-sessions API. Keep the narrow auth.sessions reader
-- outside the exposed schema, callable only with server-verified identity.
-- Do not grant table access or modify Supabase-managed auth objects.
-- Version matches the migration applied to the linked Supabase project.
create schema if not exists supportos_private;
grant usage on schema supportos_private to service_role;

create function supportos_private.list_own_sessions(subject uuid, sid uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if (auth.uid() is not null and auth.uid() <> subject) or not exists (
    select 1 from auth.sessions s
    where s.id = sid and s.user_id = subject
      and (s.not_after is null or s.not_after > now())
  ) then
    return jsonb_build_object('error', 'invalid_session');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    -- GoTrue stores this timestamp without a timezone, explicitly in UTC.
    'refreshed_at', s.refreshed_at at time zone 'UTC',
    'user_agent', nullif(left(s.user_agent, 512), ''),
    'is_current', s.id = sid
  ) order by (s.id = sid) desc,
    greatest(s.updated_at, s.refreshed_at at time zone 'UTC', s.created_at) desc nulls last,
    s.id), '[]'::jsonb) into result
  from auth.sessions s
  where s.user_id = subject and (s.not_after is null or s.not_after > now());

  return jsonb_build_object('sessions', result);
end;
$$;
revoke all on function supportos_private.list_own_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function supportos_private.list_own_sessions(uuid, uuid) to service_role;

create function public.supportos_list_own_sessions(subject uuid, sid uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select supportos_private.list_own_sessions(subject, sid);
$$;
revoke all on function public.supportos_list_own_sessions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.supportos_list_own_sessions(uuid, uuid) to service_role;

comment on function public.supportos_list_own_sessions(uuid, uuid) is
  'Server-only own-session metadata; subject and sid must come from verified Auth claims. No tokens, IPs or cross-user listing.';
