-- Negative Assistant feedback becomes a minimal QC review item. Customer text
-- is never persisted: answer_ref is a one-way SHA-256 reference computed by API.
create table if not exists public.supportos_ai_feedback_reviews (
 id text primary key,
 project_id text not null default '',
 source_ids jsonb not null default '[]'::jsonb,
 comment text not null,
 answer_ref text not null,
 actor_id uuid not null references auth.users(id) on delete restrict,
 status text not null default 'open' check (status in ('open','resolved')),
 created_at timestamptz not null default now()
);

create index if not exists supportos_ai_feedback_reviews_open_idx
 on public.supportos_ai_feedback_reviews (status, created_at desc);

alter table public.supportos_ai_feedback_reviews enable row level security;
revoke all on public.supportos_ai_feedback_reviews from public, anon, authenticated;
grant all on public.supportos_ai_feedback_reviews to service_role;
