-- Server-only challenges. Telegram tokens and passwords are never persisted here.
create table if not exists public.supportos_telegram_registration (
 id uuid primary key,
 login text not null check (login ~ '^[a-z][a-z0-9_]{3,31}$'),
 browser_hash text not null unique check (browser_hash ~ '^[a-f0-9]{64}$'),
 start_hash text not null unique check (start_hash ~ '^[a-f0-9]{64}$'),
 ip_hash text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '20 minutes',
 telegram_id bigint,
 telegram_username text,
 verified_at timestamptz,
 claimed_at timestamptz,
 completed_at timestamptz,
 check (verified_at is null or telegram_id is not null),
 check (claimed_at is null or verified_at is not null),
 check (completed_at is null or claimed_at is not null)
);
create index if not exists supportos_tg_rate_idx on public.supportos_telegram_registration(ip_hash,created_at);
create index if not exists supportos_tg_expiry_idx on public.supportos_telegram_registration(expires_at) where claimed_at is null;
create unique index if not exists supportos_tg_login_claim on public.supportos_telegram_registration(login) where claimed_at is not null;
create unique index if not exists supportos_tg_identity_claim on public.supportos_telegram_registration(telegram_id) where claimed_at is not null;
alter table public.supportos_telegram_registration enable row level security;
revoke all on public.supportos_telegram_registration from public,anon,authenticated;
grant select,insert,update,delete on public.supportos_telegram_registration to service_role;

create or replace function public.supportos_tg_begin(request_id uuid, login_name text, browser_digest text, start_digest text, ip_digest text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('tg-rate:' || ip_digest,0));
 delete from public.supportos_telegram_registration where expires_at < now() - interval '1 day' and claimed_at is null;
 if (select count(*) from public.supportos_telegram_registration where ip_hash=ip_digest and created_at>now()-interval '1 hour')>=10 then
  return jsonb_build_object('error','rate_limit');
 end if;
 if exists(select 1 from public.supportos_telegram_registration where login=login_name and claimed_at is not null) then
  return jsonb_build_object('error','login_taken');
 end if;
 insert into public.supportos_telegram_registration(id,login,browser_hash,start_hash,ip_hash)
 values(request_id,login_name,browser_digest,start_digest,ip_digest);
 return jsonb_build_object('expiresAt',now()+interval '20 minutes');
end $$;

create or replace function public.supportos_tg_confirm(start_digest text, tg_id bigint, tg_username text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.supportos_telegram_registration;
begin
 select * into item from public.supportos_telegram_registration where start_hash=start_digest for update;
 if not found or item.expires_at<=now() or item.completed_at is not null or tg_id<=0 then return jsonb_build_object('error','expired'); end if;
 if item.telegram_id is not null and item.telegram_id<>tg_id then return jsonb_build_object('error','already_linked'); end if;
 if exists(select 1 from public.supportos_telegram_registration where telegram_id=tg_id and claimed_at is not null and id<>item.id) then return jsonb_build_object('error','already_registered'); end if;
 update public.supportos_telegram_registration set telegram_id=tg_id,telegram_username=left(tg_username,64),verified_at=coalesce(verified_at,now()) where id=item.id;
 return jsonb_build_object('ok',true,'login',item.login);
end $$;

create or replace function public.supportos_tg_claim(browser_digest text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.supportos_telegram_registration;
begin
 select * into item from public.supportos_telegram_registration where browser_hash=browser_digest for update;
 if not found or item.expires_at<=now() then return jsonb_build_object('error','expired'); end if;
 if item.verified_at is null then return jsonb_build_object('error','not_verified'); end if;
 begin
  update public.supportos_telegram_registration set claimed_at=coalesce(claimed_at,now()) where id=item.id;
 exception when unique_violation then return jsonb_build_object('error','already_registered'); end;
 return jsonb_build_object('id',item.id,'login',item.login,'telegram_id',item.telegram_id,'telegram_username',item.telegram_username,'completed',item.completed_at is not null);
end $$;

create or replace function public.supportos_tg_finish(request_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare item public.supportos_telegram_registration;
begin
 select * into item from public.supportos_telegram_registration where id=request_id and claimed_at is not null for update;
 if not found then return false; end if;
 -- Caller is the trusted server, after verifying/creating this exact Auth UUID.
 if not exists(select 1 from public.supportos_users where id=item.id) then return false; end if;
 if item.completed_at is null then
  update public.supportos_users set display_name=item.login where id=item.id and status='pending' and display_name='';
  update public.supportos_telegram_registration set completed_at=now() where id=item.id;
 end if;
 return true;
end $$;

revoke all on function public.supportos_tg_begin(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.supportos_tg_confirm(text,bigint,text) from public,anon,authenticated;
revoke all on function public.supportos_tg_claim(text) from public,anon,authenticated;
revoke all on function public.supportos_tg_finish(uuid) from public,anon,authenticated;
grant execute on function public.supportos_tg_begin(uuid,text,text,text,text) to service_role;
grant execute on function public.supportos_tg_confirm(text,bigint,text) to service_role;
grant execute on function public.supportos_tg_claim(text) to service_role;
grant execute on function public.supportos_tg_finish(uuid) to service_role;
