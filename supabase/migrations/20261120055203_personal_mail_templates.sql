alter table public.supportos_mail_templates
  alter column mailbox_id drop not null,
  add column owner_id uuid references public.supportos_users(id) on delete cascade,
  add constraint supportos_mail_templates_owner_check
    check ((mailbox_id is null) <> (owner_id is null));

create unique index supportos_mail_templates_owner_title_idx
  on public.supportos_mail_templates (owner_id, lower(title))
  where owner_id is not null;
