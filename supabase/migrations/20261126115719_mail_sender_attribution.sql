create table public.supportos_mail_senders (
  mailbox_id uuid not null references public.supportos_mailboxes(id) on delete cascade,
  gmail_message_id text not null check (char_length(gmail_message_id) between 1 and 1600 and gmail_message_id ~ '^[a-zA-Z0-9_-]+$'),
  sender_id uuid references public.supportos_users(id) on delete set null,
  sender_name text not null check (char_length(sender_name) between 1 and 320),
  primary key (mailbox_id, gmail_message_id)
);

create index supportos_mail_senders_sender_idx on public.supportos_mail_senders (sender_id);

alter table public.supportos_mail_senders enable row level security;
revoke all on public.supportos_mail_senders from public, anon, authenticated, service_role;
grant select, insert on public.supportos_mail_senders to service_role;
