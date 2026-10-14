-- A login can race the external Auth call. Revoke again after a successful
-- password update, before recording completion, so that those sessions close too.
create or replace function public.supportos_account_action_completed(actor uuid,sid uuid,request_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_critical_requests;
begin
 select * into c from public.supportos_telegram_critical_requests where id=request_id and actor_id=actor and session_id=sid for update;
 if not found or c.status<>'consumed' or c.action not in ('user.password','user.delete') then return jsonb_build_object('error','invalid'); end if;
 if c.action='user.delete' and exists(select 1 from public.supportos_users where id::text=c.target) then return jsonb_build_object('error','not_completed'); end if;
 if c.action='user.password' then perform supportos_private.revoke_account_sessions(actor,sid,c.target::uuid,c.id); end if;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data,event_ref)
 values(actor,(select email from public.supportos_users where id=actor),c.action,c.target,c.account_snapshot,
  jsonb_build_object('completed',true,'sessions_revoked',true),'critical-complete:'||c.id);
 update public.supportos_telegram_critical_requests set status='completed' where id=c.id;
 return jsonb_build_object('ok',true);
end $$;
notify pgrst,'reload schema';
