create table public.supportos_chatwoot_personal_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_key text not null check (length(account_key) = 64),
  sealed_token text not null check (length(sealed_token) between 38 and 720),
  primary key (user_id, account_key)
);

alter table public.supportos_chatwoot_personal_profiles enable row level security;
revoke all on public.supportos_chatwoot_personal_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_personal_profiles to service_role;
