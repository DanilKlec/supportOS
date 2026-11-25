alter table public.supportos_chatwoot_agent_limits
  drop constraint supportos_chatwoot_agent_limits_max_active_chats_check,
  add constraint supportos_chatwoot_agent_limits_max_active_chats_check
    check (max_active_chats between 1 and 250);
