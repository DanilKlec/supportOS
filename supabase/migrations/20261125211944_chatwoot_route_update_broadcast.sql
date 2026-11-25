create function private.broadcast_supportos_chatwoot_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    '{"changed":true}'::jsonb,
    'chat_assignment_changed',
    'chatwoot:coaching:' || recipient.user_id::text,
    true
  )
  from public.supportos_chatwoot_presence recipient
  where recipient.chatwoot_agent_id in (old.operation_previous_agent_id, new.chatwoot_agent_id);
  return new;
exception when others then
  raise warning 'SupportOS assignment broadcast failed (%)', sqlstate;
  return new;
end;
$$;

revoke all on function private.broadcast_supportos_chatwoot_assignment() from public, anon, authenticated;

create trigger supportos_chatwoot_assignment_broadcast
  after update of status, chatwoot_agent_id on public.supportos_chatwoot_routing
  for each row
  when (old.status = 'routing' and new.status in ('assigned', 'failed')
    and old.operation_previous_agent_id is distinct from new.chatwoot_agent_id)
  execute function private.broadcast_supportos_chatwoot_assignment();
