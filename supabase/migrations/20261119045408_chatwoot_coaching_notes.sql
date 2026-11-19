create table public.supportos_chatwoot_coaching_notes (
  id uuid primary key,
  account_id bigint not null check (account_id > 0),
  conversation_id bigint not null check (conversation_id > 0),
  author_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index supportos_chatwoot_coaching_author_idx
  on public.supportos_chatwoot_coaching_notes (author_id, account_id, conversation_id, created_at desc, id desc);
create index supportos_chatwoot_coaching_recipient_idx
  on public.supportos_chatwoot_coaching_notes (recipient_id, account_id, conversation_id, created_at desc, id desc);

alter table public.supportos_chatwoot_coaching_notes enable row level security;
revoke all on public.supportos_chatwoot_coaching_notes from public, anon, authenticated;
grant select, insert on public.supportos_chatwoot_coaching_notes to service_role;

create function public.supportos_chatwoot_send_coaching_note(
  p_id uuid, p_account_id bigint, p_conversation_id bigint, p_author_id uuid, p_recipient_email text, p_content text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  recipient uuid;
  author_name text;
  saved public.supportos_chatwoot_coaching_notes;
begin
  select u.display_name into author_name
  from public.supportos_users u where u.id = p_author_id and u.status = 'active';
  if not found then return null; end if;

  select u.id into strict recipient
  from public.supportos_users u
  where lower(u.email) = lower(p_recipient_email) and u.status = 'active'
    and exists (
      select 1 from public.supportos_user_roles ur
      join public.supportos_role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = u.id and rp.permission_id = 'work'
    );

  insert into public.supportos_chatwoot_coaching_notes (
    id, account_id, conversation_id, author_id, recipient_id, author_name, content
  ) values (p_id, p_account_id, p_conversation_id, p_author_id, recipient, author_name, p_content)
  on conflict (id) do nothing
  returning * into saved;
  if not found then
    select n.* into saved
    from public.supportos_chatwoot_coaching_notes n
    where n.id = p_id and n.account_id = p_account_id and n.conversation_id = p_conversation_id
      and n.author_id = p_author_id and n.recipient_id = recipient and n.content = p_content;
  end if;
  if saved.id is null then return null; end if;
  return jsonb_build_object('id', saved.id, 'author_name', saved.author_name, 'content', saved.content, 'created_at', saved.created_at);
exception when no_data_found or too_many_rows then
  return null;
end;
$$;
revoke execute on function public.supportos_chatwoot_send_coaching_note(uuid, bigint, bigint, uuid, text, text) from public, anon, authenticated;
grant execute on function public.supportos_chatwoot_send_coaching_note(uuid, bigint, bigint, uuid, text, text) to service_role;

create policy supportos_chatwoot_coaching_read
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() = 'chatwoot:coaching:' || (select auth.uid())::text
    and private.supportos_can_receive_chatwoot_updates()
  );

create function private.broadcast_supportos_chatwoot_coaching_note()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{"changed":true}'::jsonb, 'coaching_note', 'chatwoot:coaching:' || new.recipient_id::text, true);
  if new.author_id <> new.recipient_id then
    perform realtime.send('{"changed":true}'::jsonb, 'coaching_note', 'chatwoot:coaching:' || new.author_id::text, true);
  end if;
  return new;
end;
$$;
revoke all on function private.broadcast_supportos_chatwoot_coaching_note() from public, anon, authenticated;
create trigger supportos_chatwoot_coaching_broadcast
  after insert on public.supportos_chatwoot_coaching_notes
  for each row execute function private.broadcast_supportos_chatwoot_coaching_note();
