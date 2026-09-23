-- Apply only alongside the 2FA-aware application. This changes access for the whole DB.
create schema if not exists supportos_private;
revoke all on schema supportos_private from public,anon;
grant usage on schema supportos_private to authenticated,service_role;

create table public.supportos_telegram_links (
 user_id uuid primary key references auth.users(id) on delete cascade,
 telegram_id bigint not null unique check(telegram_id>0),
 telegram_username text,
 verified_at timestamptz not null default now(),
 approved_by uuid,
 source text not null check(source in ('registration','admin'))
);
insert into public.supportos_telegram_links(user_id,telegram_id,telegram_username,verified_at,source)
 select id,telegram_id,telegram_username,verified_at,'registration'
 from public.supportos_telegram_registration where completed_at is not null;

create table public.supportos_telegram_login_challenges (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 telegram_id bigint not null,
 challenge_hash text not null unique check(challenge_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes',
 approved_at timestamptz,
 rejected_at timestamptz,
 user_agent text,
 ip_hash text
);
create index on public.supportos_telegram_login_challenges(user_id,session_id,created_at desc);
create index on public.supportos_telegram_login_challenges(user_id,created_at desc);
create unique index on public.supportos_telegram_login_challenges(user_id,session_id) where status in ('pending','approved');

create table public.supportos_telegram_link_requests (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 challenge_hash text not null unique check(challenge_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','verified','approved','rejected','expired')),
 telegram_id bigint,
 telegram_username text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '20 minutes',
 verified_at timestamptz,
 reviewed_at timestamptz,
 reviewed_by uuid
);
create index on public.supportos_telegram_link_requests(user_id,created_at desc);
create unique index on public.supportos_telegram_link_requests(user_id) where status in ('pending','verified');

alter table public.supportos_telegram_links enable row level security;
alter table public.supportos_telegram_login_challenges enable row level security;
alter table public.supportos_telegram_link_requests enable row level security;
revoke all on public.supportos_telegram_links,public.supportos_telegram_login_challenges,public.supportos_telegram_link_requests from public,anon,authenticated;
grant select,insert,update,delete on public.supportos_telegram_links,public.supportos_telegram_login_challenges,public.supportos_telegram_link_requests to service_role;

-- Narrow helpers are outside the exposed schema; session existence is authoritative.
create function supportos_private.session_live(subject uuid, sid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where id=sid and user_id=subject and (not_after is null or not_after>now()));
$$;
revoke all on function supportos_private.session_live(uuid,uuid) from public,anon,authenticated;
grant execute on function supportos_private.session_live(uuid,uuid) to service_role;

create function public.supportos_tg_login_state(subject uuid,sid uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_login_challenges; l public.supportos_telegram_links; r public.supportos_telegram_link_requests;
begin
 if not supportos_private.session_live(subject,sid) then return jsonb_build_object('status','invalid_session'); end if;
 -- Import registrations completed after this migration without changing the registration flow.
 insert into public.supportos_telegram_links(user_id,telegram_id,telegram_username,verified_at,source)
 select id,telegram_id,telegram_username,verified_at,'registration' from public.supportos_telegram_registration where id=subject and completed_at is not null on conflict do nothing;
 select * into l from public.supportos_telegram_links where user_id=subject;
 if not found then
  update public.supportos_telegram_link_requests set status='expired' where user_id=subject and status in ('pending','verified') and expires_at<=now();
  select * into r from public.supportos_telegram_link_requests where user_id=subject and status in ('pending','verified') order by created_at desc limit 1;
  return jsonb_build_object('status',case when r.status='verified' then 'link_review' else 'link_required' end,'linkId',r.id);
 end if;
 update public.supportos_telegram_login_challenges set status='expired' where user_id=subject and session_id=sid and status='pending' and expires_at<=now();
 select * into c from public.supportos_telegram_login_challenges where user_id=subject and session_id=sid order by created_at desc limit 1;
 if not found then return jsonb_build_object('status','required'); end if;
 if c.telegram_id<>l.telegram_id then return jsonb_build_object('status','required'); end if;
 return jsonb_build_object('status',c.status,'id',c.id,'expiresAt',c.expires_at,'resendAt',c.created_at+interval '1 minute');
end $$;

create function public.supportos_tg_login_begin(subject uuid,sid uuid,request_id uuid,digest text,agent text,ip_digest text,resend boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare state jsonb; tg bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended('tg-login:'||subject,0));
 state=public.supportos_tg_login_state(subject,sid);
 if state->>'status' in ('invalid_session','link_required','link_review','approved','rejected','expired') then return state; end if;
 if state->>'status'='pending' and not resend then return state; end if;
 if exists(select 1 from public.supportos_telegram_login_challenges where user_id=subject and created_at>now()-interval '1 minute') or
 (select count(*) from public.supportos_telegram_login_challenges where user_id=subject and created_at>now()-interval '1 hour')>=10 then return jsonb_build_object('error','rate_limit'); end if;
 select telegram_id into tg from public.supportos_telegram_links where user_id=subject;
 update public.supportos_telegram_login_challenges set status='expired' where user_id=subject and session_id=sid and status='pending';
 insert into public.supportos_telegram_login_challenges(id,user_id,session_id,telegram_id,challenge_hash,user_agent,ip_hash)
 values(request_id,subject,sid,tg,digest,left(agent,300),ip_digest);
 return public.supportos_tg_login_state(subject,sid)||jsonb_build_object('send',true,'telegramId',tg);
end $$;

create function public.supportos_tg_login_decide(digest text,tg bigint,decision text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.supportos_telegram_login_challenges;
begin
 select * into c from public.supportos_telegram_login_challenges where challenge_hash=digest for update;
 if not found or c.telegram_id<>tg or decision not in ('approved','rejected') then return jsonb_build_object('error','invalid'); end if;
 if c.status='expired' or (c.status='pending' and (c.expires_at<=now() or not supportos_private.session_live(c.user_id,c.session_id))) then
  update public.supportos_telegram_login_challenges set status='expired' where id=c.id;
  return jsonb_build_object('error','expired');
 end if;
 if c.status<>'pending' then return jsonb_build_object('error','processed'); end if;
 update public.supportos_telegram_login_challenges set status=decision,approved_at=case when decision='approved' then now() end,rejected_at=case when decision='rejected' then now() end where id=c.id;
 return jsonb_build_object('status',decision);
end $$;

create function public.supportos_tg_login_cancel(subject uuid,sid uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('tg-login:'||subject,0));
 update public.supportos_telegram_login_challenges set status='rejected',rejected_at=now() where user_id=subject and session_id=sid and status in ('pending','approved');
 update public.supportos_telegram_link_requests set status='rejected',reviewed_at=now() where user_id=subject and session_id=sid and status in ('pending','verified');
 return true;
end $$;

create function public.supportos_tg_link_begin(subject uuid,sid uuid,request_id uuid,digest text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare state jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('tg-login:'||subject,0));
 state=public.supportos_tg_login_state(subject,sid);
 if state->>'status'<>'link_required' then return state; end if;
 if exists(select 1 from public.supportos_telegram_link_requests where user_id=subject and created_at>now()-interval '1 minute') or
 (select count(*) from public.supportos_telegram_link_requests where user_id=subject and created_at>now()-interval '1 hour')>=5 then return jsonb_build_object('error','rate_limit'); end if;
 update public.supportos_telegram_link_requests set status='expired' where user_id=subject and status='pending';
 insert into public.supportos_telegram_link_requests(id,user_id,session_id,challenge_hash) values(request_id,subject,sid,digest);
 return jsonb_build_object('status','link_required','linkId',request_id,'send',true);
end $$;

create function public.supportos_tg_link_verify(digest text,tg bigint,username text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.supportos_telegram_link_requests;
begin
 select * into r from public.supportos_telegram_link_requests where challenge_hash=digest for update;
 if not found or tg<=0 then return jsonb_build_object('error','invalid'); end if;
 if r.status<>'pending' then return jsonb_build_object('error','processed'); end if;
 if r.expires_at<=now() or not supportos_private.session_live(r.user_id,r.session_id) then return jsonb_build_object('error','expired'); end if;
 if exists(select 1 from public.supportos_telegram_links where telegram_id=tg) then return jsonb_build_object('error','linked'); end if;
 update public.supportos_telegram_link_requests set telegram_id=tg,telegram_username=left(username,64),verified_at=now(),status='verified',expires_at=now()+interval '7 days' where id=r.id;
 return jsonb_build_object('status','verified');
end $$;

create function public.supportos_tg_link_review(actor uuid,actor_session uuid,request_id uuid,approve boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r public.supportos_telegram_link_requests;
begin
 if public.supportos_tg_login_state(actor,actor_session)->>'status'<>'approved' or not (public.supportos_rbac_context(actor)->'permissions' ? 'users.manage') then raise insufficient_privilege; end if;
 select * into r from public.supportos_telegram_link_requests where id=request_id for update;
 if not found or r.status<>'verified' or r.expires_at<=now() or r.user_id=actor then raise exception 'Invalid link request'; end if;
 if approve then
  insert into public.supportos_telegram_links(user_id,telegram_id,telegram_username,verified_at,approved_by,source) values(r.user_id,r.telegram_id,r.telegram_username,r.verified_at,actor,'admin');
 end if;
 update public.supportos_telegram_link_requests set status=case when approve then 'approved' else 'rejected' end,reviewed_by=actor,reviewed_at=now() where id=r.id;
 return true;
end $$;

-- RLS also enforces 2FA for direct PostgREST requests; app UI/API gates are insufficient.
create function supportos_private.telegram_session_approved() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.supportos_telegram_login_challenges c
 join auth.sessions s on s.id=c.session_id and s.user_id=c.user_id
 join public.supportos_telegram_links l on l.user_id=c.user_id and l.telegram_id=c.telegram_id
 where c.user_id=auth.uid() and c.session_id::text=auth.jwt()->>'session_id' and c.status='approved'
 and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function supportos_private.telegram_session_approved() from public,anon;
grant execute on function supportos_private.telegram_session_approved() to authenticated,service_role;
do $$ declare t record; begin
 for t in select distinct tablename from pg_policies where schemaname='public' and 'authenticated'=any(roles) loop
  execute format('create policy telegram_2fa_gate on public.%I as restrictive for all to authenticated using ((select supportos_private.telegram_session_approved())) with check ((select supportos_private.telegram_session_approved()))',t.tablename);
 end loop;
end $$;
revoke all on function public.supportos_tg_login_state(uuid,uuid), public.supportos_tg_login_begin(uuid,uuid,uuid,text,text,text,boolean),public.supportos_tg_login_decide(text,bigint,text),public.supportos_tg_login_cancel(uuid,uuid),public.supportos_tg_link_begin(uuid,uuid,uuid,text),public.supportos_tg_link_verify(text,bigint,text),public.supportos_tg_link_review(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.supportos_tg_login_state(uuid,uuid), public.supportos_tg_login_begin(uuid,uuid,uuid,text,text,text,boolean),public.supportos_tg_login_decide(text,bigint,text),public.supportos_tg_login_cancel(uuid,uuid),public.supportos_tg_link_begin(uuid,uuid,uuid,text),public.supportos_tg_link_verify(text,bigint,text),public.supportos_tg_link_review(uuid,uuid,uuid,boolean) to service_role;
