-- Auth owns password hashing and validation. A deferred guard checks the one-use
-- server permit after Auth has updated app_metadata in the same transaction.
create table public.supportos_password_requests (
 id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
 session_id uuid, telegram_id bigint, mode text not null check(mode in ('change','recovery')),
 browser_hash text not null unique, challenge_hash text not null unique,
 ip_hash text not null, identity_hash text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','processing','completed')),
 permit_hash text, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes', completed_at timestamptz
);
create index on public.supportos_password_requests(ip_hash,created_at);
create index on public.supportos_password_requests(identity_hash,created_at);
create index on public.supportos_password_requests(user_id,created_at);
alter table public.supportos_password_requests enable row level security;
revoke all on public.supportos_password_requests from public,anon,authenticated;
grant select,insert,update,delete on public.supportos_password_requests to service_role;

create function public.supportos_password_begin(request_id uuid, subject uuid, sid uuid, identity_email text, identity_digest text, ip_digest text, browser_digest text, challenge_digest text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target uuid; tg bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('password-ip:'||ip_digest,0));
 perform pg_advisory_xact_lock(hashtextextended('password-identity:'||identity_digest,0));
 if (select count(*) from public.supportos_password_requests where ip_hash=ip_digest and created_at>now()-interval '1 hour')>=10
 or (select count(*) from public.supportos_password_requests where identity_hash=identity_digest and created_at>now()-interval '1 hour')>=5
 or exists(select 1 from public.supportos_password_requests where identity_hash=identity_digest and created_at>now()-interval '1 minute') then
  return jsonb_build_object('error','rate_limit');
 end if;
 if subject is not null then
  if (public.supportos_tg_login_state(subject,sid)->>'status') is distinct from 'approved' then raise exception 'Telegram login required'; end if;
  target:=subject;
 else
  select id into target from public.supportos_users where lower(email)=lower(identity_email) limit 1;
 end if;
 insert into public.supportos_telegram_links(user_id,telegram_id,telegram_username,verified_at,source)
 select id,telegram_id,telegram_username,verified_at,'registration' from public.supportos_telegram_registration where id=target and completed_at is not null on conflict do nothing;
 select telegram_id into tg from public.supportos_telegram_links where user_id=target;
 insert into public.supportos_password_requests(id,user_id,session_id,telegram_id,mode,browser_hash,challenge_hash,ip_hash,identity_hash)
 values(request_id,target,sid,tg,case when subject is null then 'recovery' else 'change' end,browser_digest,challenge_digest,ip_digest,identity_digest);
 return jsonb_build_object('status','pending','expiresAt',now()+interval '5 minutes');
end $$;

create function public.supportos_password_decide(challenge_digest text,tg bigint,approve boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.supportos_password_requests;
begin
 select * into r from public.supportos_password_requests where challenge_hash=challenge_digest for update;
 if not found or r.status<>'pending' or r.expires_at<=now() or r.telegram_id is distinct from tg
 or not exists(select 1 from public.supportos_telegram_links where user_id=r.user_id and telegram_id=tg) then return false; end if;
 update public.supportos_password_requests set status=case when approve then 'approved' else 'rejected' end where id=r.id;
 return true;
end $$;

create function public.supportos_password_claim(browser_digest text,permit_digest text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.supportos_password_requests;
begin
 select * into r from public.supportos_password_requests where browser_hash=browser_digest for update;
 if not found or r.status<>'approved' or r.expires_at<=now()
 or not exists(select 1 from public.supportos_telegram_links where user_id=r.user_id and telegram_id=r.telegram_id)
 or (r.mode='change' and (public.supportos_tg_login_state(r.user_id,r.session_id)->>'status') is distinct from 'approved') then return jsonb_build_object('error','invalid'); end if;
 update public.supportos_password_requests set status='processing',permit_hash=permit_digest where id=r.id;
 return jsonb_build_object('userId',r.user_id);
end $$;

create function supportos_private.guard_password_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare proof text; r public.supportos_password_requests;
begin
 -- auth.users is not exposed; only the trusted Auth service can write app metadata.
 select raw_app_meta_data->>'supportos_password_permit' into proof from auth.users where id=new.id;
 select * into r from public.supportos_password_requests
 where user_id=new.id and status='processing' and expires_at>now()
 and permit_hash=encode(sha256(convert_to(proof,'UTF8')),'hex') for update;
 if not found or not exists(select 1 from public.supportos_telegram_links where user_id=new.id and telegram_id=r.telegram_id) then
  raise exception 'Password change requires Telegram confirmation' using errcode='42501';
 end if;
 update public.supportos_password_requests set status='completed',completed_at=now(),permit_hash=null where id=r.id;
 update public.supportos_password_requests set status='rejected',permit_hash=null where user_id=new.id and id<>r.id and status in ('pending','approved','processing');
 update auth.users set raw_app_meta_data=raw_app_meta_data-'supportos_password_permit' where id=new.id;
 delete from auth.sessions where user_id=new.id;
 return null;
end $$;
revoke all on function supportos_private.guard_password_change() from public,anon,authenticated,service_role;
create constraint trigger supportos_password_telegram_guard after update of encrypted_password on auth.users
 deferrable initially deferred for each row when (old.encrypted_password is distinct from new.encrypted_password)
 execute function supportos_private.guard_password_change();

revoke all on function public.supportos_password_begin(uuid,uuid,uuid,text,text,text,text,text), public.supportos_password_decide(text,bigint,boolean), public.supportos_password_claim(text,text) from public,anon,authenticated;
grant execute on function public.supportos_password_begin(uuid,uuid,uuid,text,text,text,text,text), public.supportos_password_decide(text,bigint,boolean), public.supportos_password_claim(text,text) to service_role;
