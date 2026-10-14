create table if not exists public.supportos_ai_guidance (
 id text primary key check(id='main'), content text not null default '' check(length(content)<=16000),
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
alter table public.supportos_ai_guidance enable row level security;
revoke all on public.supportos_ai_guidance from public,anon,authenticated;
grant all on public.supportos_ai_guidance to service_role;
insert into public.supportos_ai_guidance(id) values('main') on conflict do nothing;
