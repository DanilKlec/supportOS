alter table public.supportos_mailboxes
  add column icon jsonb,
  add constraint supportos_mailboxes_icon_shape check (
    icon is null or (jsonb_typeof(icon) = 'object' and octet_length(icon::text) <= 8000)
  );

create function public.supportos_connect_gmail_mailbox_with_icon(
  mail_address text, sealed_token text, actor uuid, mail_icon jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.supportos_mailboxes (provider, address, encrypted_token, connected_by, icon)
  values ('gmail', mail_address, sealed_token, actor, mail_icon)
  on conflict (provider, address) do update
    set encrypted_token = excluded.encrypted_token,
        connected_by = excluded.connected_by,
        icon = excluded.icon,
        updated_at = now()
  returning id;
$$;

revoke all on function public.supportos_connect_gmail_mailbox_with_icon(text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.supportos_connect_gmail_mailbox_with_icon(text, text, uuid, jsonb)
  to service_role;
