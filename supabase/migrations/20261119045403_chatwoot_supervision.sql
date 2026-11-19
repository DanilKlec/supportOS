create table public.supportos_chatwoot_supervision (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id bigint not null check (account_id > 0),
  conversation_id bigint not null check (conversation_id > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, account_id, conversation_id)
);

alter table public.supportos_chatwoot_supervision enable row level security;
revoke all on public.supportos_chatwoot_supervision from public, anon, authenticated;
grant select, insert, delete on public.supportos_chatwoot_supervision to service_role;

create function public.supportos_chatwoot_set_supervision(
  p_user_id uuid, p_account_id bigint, p_conversation_id bigint, p_enabled boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'supportos:supervision:' || p_user_id::text || ':' || p_account_id::text, 0
  ));
  if p_enabled then
    if exists (select 1 from public.supportos_chatwoot_supervision
      where user_id = p_user_id and account_id = p_account_id and conversation_id = p_conversation_id)
    then return true; end if;
    if (select count(*) from public.supportos_chatwoot_supervision
      where user_id = p_user_id and account_id = p_account_id) >= 100
    then return false; end if;
    insert into public.supportos_chatwoot_supervision (user_id, account_id, conversation_id)
      values (p_user_id, p_account_id, p_conversation_id);
  else
    delete from public.supportos_chatwoot_supervision
      where user_id = p_user_id and account_id = p_account_id and conversation_id = p_conversation_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.supportos_chatwoot_set_supervision(uuid, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.supportos_chatwoot_set_supervision(uuid, bigint, bigint, boolean) to service_role;
