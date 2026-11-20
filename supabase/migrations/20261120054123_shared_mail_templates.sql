create table public.supportos_mail_templates (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.supportos_mailboxes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120 and title = btrim(title) and title !~ E'[\\r\\n]'),
  subject text not null default '' check (char_length(subject) <= 500 and subject !~ E'[\\r\\n]'),
  body text not null check (char_length(body) <= 200000 and body ~ '[^[:space:]]'),
  revision integer not null default 1 check (revision > 0)
);

create unique index supportos_mail_templates_mailbox_title_idx
  on public.supportos_mail_templates (mailbox_id, lower(title));

alter table public.supportos_mail_templates enable row level security;
revoke all on public.supportos_mail_templates from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_mail_templates to service_role;
