-- A registration claim already checked expiry. Auth can finish after that
-- deadline; audit the actual committed creation, not an invented fresh login.
-- Keep the already applied audit migration and the registration flow intact.
create or replace function supportos_private.audit_account_creation() returns trigger
language plpgsql security definer set search_path='' as $$
declare marker text; registration text; c public.supportos_telegram_critical_requests; actor uuid; reference text;
begin
 select raw_app_meta_data->>'supportos_creation_request',raw_app_meta_data->>'telegram_registration'
  into marker,registration from auth.users where id=new.id;
 if marker is not null then
  select * into c from public.supportos_telegram_critical_requests
   where id::text=marker and action='user.create' and target=lower(trim(new.email)) and status='consumed' and expires_at>now() for update;
  if not found or not coalesce(supportos_private.critical_allowed(c.actor_id,c.session_id,c.action,c.target),false) then
   raise exception 'Missing account creation audit context' using errcode='42501';
  end if;
  actor:=c.actor_id; reference:='critical:'||c.id;
  update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
 elsif registration=new.id::text then
  if not exists(select 1 from public.supportos_telegram_registration where id=new.id and verified_at is not null and claimed_at is not null and completed_at is null) then
   raise exception 'Missing registration creation audit context' using errcode='42501';
  end if;
  actor:=new.id; reference:='registration:'||new.id;
 else
  -- No verified SupportOS actor for external Auth administration.
  return null;
 end if;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
 values(actor,(select email from public.supportos_users where id=actor),'user.create',new.id::text,null,
  jsonb_build_object('id',new.id,'status',new.status,'version',new.version),reference);
 return null;
end $$;
revoke all on function supportos_private.audit_account_creation() from public,anon,authenticated,service_role;
