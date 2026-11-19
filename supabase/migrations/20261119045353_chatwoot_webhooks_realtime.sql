create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.supportos_chatwoot_webhook_config (
  id text primary key check (id = 'main'),
  signing_secret text not null check (char_length(signing_secret) between 16 and 512),
  updated_by uuid references public.supportos_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.supportos_chatwoot_webhook_config enable row level security;
revoke all on public.supportos_chatwoot_webhook_config from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_webhook_config to service_role;

create table if not exists public.supportos_chatwoot_webhook_events (
  delivery_id text primary key check (char_length(delivery_id) between 16 and 128),
  event_type text not null check (char_length(event_type) between 1 and 80),
  account_id bigint not null,
  inbox_id bigint,
  conversation_id bigint,
  received_at timestamptz not null default now()
);
alter table public.supportos_chatwoot_webhook_events enable row level security;
revoke all on public.supportos_chatwoot_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on public.supportos_chatwoot_webhook_events to service_role;
create index if not exists supportos_chatwoot_webhook_events_received_idx
  on public.supportos_chatwoot_webhook_events(received_at desc);

create or replace function private.supportos_can_receive_chatwoot_updates()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.supportos_users u
    join public.supportos_user_roles ur on ur.user_id = u.id
    join public.supportos_role_permissions rp on rp.role_id = ur.role_id
    where u.id = (select auth.uid())
      and u.status = 'active'
      and rp.permission_id in ('work', 'monitor.read')
  );
$$;
revoke all on function private.supportos_can_receive_chatwoot_updates() from public, anon, authenticated;
grant execute on function private.supportos_can_receive_chatwoot_updates() to authenticated;

drop policy if exists supportos_chatwoot_updates_read on realtime.messages;
create policy supportos_chatwoot_updates_read
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() = 'chatwoot:updates'
    and private.supportos_can_receive_chatwoot_updates()
  );

create or replace function private.broadcast_supportos_chatwoot_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    '{"changed":true}'::jsonb,
    'chatwoot_event',
    'chatwoot:updates',
    true
  );
  return new;
end;
$$;
revoke all on function private.broadcast_supportos_chatwoot_event() from public, anon, authenticated;

drop trigger if exists supportos_chatwoot_event_broadcast on public.supportos_chatwoot_webhook_events;
create trigger supportos_chatwoot_event_broadcast
  after insert on public.supportos_chatwoot_webhook_events
  for each row execute function private.broadcast_supportos_chatwoot_event();
