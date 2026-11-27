create table public.supportos_staff_invitation_settings (
  singleton boolean primary key default true check (singleton),
  sender_id uuid references public.supportos_mailboxes(id) on delete set null,
  template jsonb not null default '{}'::jsonb check (jsonb_typeof(template) = 'object'),
  revision integer not null default 1 check (revision > 0)
);

insert into public.supportos_staff_invitation_settings default values;

create table public.supportos_staff_invitation_deliveries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.supportos_staff_invitation_settings enable row level security;
alter table public.supportos_staff_invitation_deliveries enable row level security;
revoke all on public.supportos_staff_invitation_settings, public.supportos_staff_invitation_deliveries from public, anon, authenticated;
grant select, update on public.supportos_staff_invitation_settings to service_role;
grant select, insert, update on public.supportos_staff_invitation_deliveries to service_role;

create function public.supportos_claim_staff_invitation(target uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with claimed as (
    insert into public.supportos_staff_invitation_deliveries (user_id)
    values (target)
    on conflict (user_id) do update set attempted_at = now()
    where public.supportos_staff_invitation_deliveries.attempted_at < now() - interval '1 minute'
    returning 1
  )
  select exists (select 1 from claimed)
$$;
revoke all on function public.supportos_claim_staff_invitation(uuid) from public, anon, authenticated;
grant execute on function public.supportos_claim_staff_invitation(uuid) to service_role;
