create table public.supportos_mailboxes (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'gmail'),
  address text not null check (address = lower(address) and length(address) between 3 and 254),
  encrypted_token text not null,
  connected_by uuid references public.supportos_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (provider, address)
);

create table public.supportos_mailbox_members (
  mailbox_id uuid not null references public.supportos_mailboxes(id) on delete cascade,
  user_id uuid not null references public.supportos_users(id) on delete cascade,
  granted_by uuid references public.supportos_users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (mailbox_id, user_id)
);

create index supportos_mailbox_members_user_idx on public.supportos_mailbox_members (user_id, mailbox_id);
create index supportos_mailbox_members_granted_by_idx on public.supportos_mailbox_members (granted_by);
create index supportos_mailboxes_connected_by_idx on public.supportos_mailboxes (connected_by);

alter table public.supportos_mailboxes enable row level security;
alter table public.supportos_mailbox_members enable row level security;
revoke all on public.supportos_mailboxes, public.supportos_mailbox_members from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_mailboxes, public.supportos_mailbox_members to service_role;

create function public.supportos_connect_gmail_mailbox(mail_address text, sealed_token text, actor uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.supportos_mailboxes (provider, address, encrypted_token, connected_by)
  values ('gmail', mail_address, sealed_token, actor)
  on conflict (provider, address) do update
    set encrypted_token = excluded.encrypted_token,
        connected_by = excluded.connected_by,
        updated_at = now()
  returning id;
$$;

revoke all on function public.supportos_connect_gmail_mailbox(text, text, uuid) from public, anon, authenticated;
grant execute on function public.supportos_connect_gmail_mailbox(text, text, uuid) to service_role;
