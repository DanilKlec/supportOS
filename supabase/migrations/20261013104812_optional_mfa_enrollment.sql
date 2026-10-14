-- MFA is opt-in from account settings. Once any verified factor exists, every
-- application session still needs a live verified TOTP factor and an AAL2 JWT.
create or replace function supportos_private.mfa_session_state(subject uuid,sid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare enabled boolean;
begin
 if (auth.uid() is not null and auth.uid()<>subject) or not supportos_private.session_live(subject,sid) then
  return jsonb_build_object('status','invalid_session');
 end if;
 enabled:=exists(select 1 from auth.mfa_factors where user_id=subject and status::text='verified');
 if not enabled then
  return jsonb_build_object('status','approved','mfaEnabled',false);
 end if;
 if exists(select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
  where s.id=sid and s.user_id=subject and s.aal::text='aal2' and f.factor_type::text='totp' and f.status::text='verified') then
  return jsonb_build_object('status','approved','mfaEnabled',true);
 end if;
 return jsonb_build_object('status','mfa_required','mfaEnabled',true);
end $$;

-- Existing RLS policies use this compatibility helper. Opting out never bypasses
-- session revocation or RBAC; enrolled accounts still require the exact AAL2 JWT.
create or replace function supportos_private.telegram_session_approved() returns boolean
language sql stable security definer set search_path='' as $$
 select state->>'status'='approved'
  and (state->>'mfaEnabled'='false' or coalesce(auth.jwt()->>'aal'='aal2',false))
 from (select supportos_private.mfa_session_state(auth.uid(),(auth.jwt()->>'session_id')::uuid) state) s;
$$;

-- Administrative changes keep their existing fresh TOTP requirement, including
-- invalidation of an outstanding permit if the verified factor is removed.
create or replace function supportos_private.critical_allowed(actor uuid,sid uuid,operation text,target text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; state jsonb;
begin
 state:=public.supportos_mfa_session_state(actor,sid);
 if state->>'status' is distinct from 'approved' or state->>'mfaEnabled' is distinct from 'true' then return false; end if;
 ctx:=public.supportos_rbac_context(actor);
 if ctx->>'status' is distinct from 'active' then return false; end if;
 if operation in ('sessions.revoke_others') then
  return target=actor::text and (ctx->'permissions') ? 'work';
 elsif operation='user.update' then
  return (ctx->'permissions') ? 'users.manage' and target<>actor::text
   and exists(select 1 from public.supportos_users where id::text=target)
   and not exists(select 1 from public.supportos_user_roles where user_id::text=target and role_id='creator');
 elsif operation='user.create' then return (ctx->'permissions') ? 'users.manage';
 elsif operation in ('role.save','role.delete') then
  return (ctx->'permissions') ? 'roles.manage' and target ~ '^[a-z][a-z0-9_]{1,39}$' and target<>'creator'
   and not exists(select 1 from public.supportos_user_roles where user_id=actor and role_id=target);
 end if;
 return false;
end $$;
notify pgrst,'reload schema';
