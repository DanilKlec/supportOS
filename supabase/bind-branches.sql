-- Branch selection and explicitly addressed, read-only personal shares.
create table if not exists public.supportos_bind_shares (
 id uuid primary key default gen_random_uuid(),
 bind_id text not null references public.supportos_binds(id) on delete cascade,
 source_id text not null references public.supportos_binds(id) on delete cascade,
 owner_id uuid not null references public.supportos_users(id) on delete cascade,
 recipient_id uuid not null references public.supportos_users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(bind_id,recipient_id), check(owner_id<>recipient_id)
);
create index if not exists supportos_bind_shares_recipient on public.supportos_bind_shares(recipient_id);
create table if not exists public.supportos_bind_choices (
 user_id uuid not null references public.supportos_users(id) on delete cascade,
 source_id text not null references public.supportos_binds(id) on delete cascade,
 branch text not null, primary key(user_id,source_id)
);
create table if not exists public.supportos_bind_proposals (
 id uuid primary key default gen_random_uuid(),
 source_id text not null references public.supportos_binds(id) on delete cascade,
 author_id uuid not null references public.supportos_users(id) on delete cascade,
 base_version timestamptz not null,
 translations jsonb not null, tags jsonb not null,
 status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')),
 created_at timestamptz not null default now(), resolved_at timestamptz
);
create unique index if not exists supportos_bind_proposals_pending on public.supportos_bind_proposals(source_id,author_id) where status='pending';
create table if not exists public.supportos_bind_history (
 id bigint generated always as identity primary key,
 bind_id text not null, source_id text not null, owner_id uuid,
 snapshot jsonb not null, operation text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists supportos_bind_history_source on public.supportos_bind_history(source_id,created_at desc);
alter table public.supportos_bind_shares enable row level security;
alter table public.supportos_bind_choices enable row level security;
alter table public.supportos_bind_proposals enable row level security;
alter table public.supportos_bind_history enable row level security;
revoke all on public.supportos_bind_shares,public.supportos_bind_choices,public.supportos_bind_proposals,public.supportos_bind_history from anon,authenticated;
grant all on public.supportos_bind_shares,public.supportos_bind_choices,public.supportos_bind_proposals,public.supportos_bind_history to service_role;
grant usage,select on sequence public.supportos_bind_history_id_seq to service_role;

-- A private trigger captures all existing write paths, including browser RLS writes.
-- It is not an exposed RPC and cannot be called by API users.
create schema if not exists supportos_private;
revoke all on schema supportos_private from public,anon,authenticated;
create or replace function supportos_private.record_bind_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_data public.supportos_binds;
begin
 if tg_op='DELETE' then row_data:=old; else row_data:=new; end if;
 if tg_op='UPDATE' and old.translations=new.translations and old.tags=new.tags then return new; end if;
 insert into public.supportos_bind_history(bind_id,source_id,owner_id,snapshot,operation)
 values(row_data.id,coalesce(row_data.source_bind_id,row_data.id),row_data.owner_id,to_jsonb(row_data),tg_op);
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function supportos_private.record_bind_history() from public,anon,authenticated;
drop trigger if exists supportos_bind_history_trigger on public.supportos_binds;
create trigger supportos_bind_history_trigger after insert or update or delete on public.supportos_binds
 for each row execute function supportos_private.record_bind_history();
insert into public.supportos_bind_history(bind_id,source_id,owner_id,snapshot,operation)
 select b.id,coalesce(b.source_bind_id,b.id),b.owner_id,to_jsonb(b),'BASELINE' from public.supportos_binds b
 where not exists(select 1 from public.supportos_bind_history h where h.bind_id=b.id);

create or replace function public.supportos_bind_branch_action(actor uuid, operation text, payload jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; base public.supportos_binds; mine public.supportos_binds;
 recipient uuid; share_row public.supportos_bind_shares; proposal public.supportos_bind_proposals;
 source text:=payload->>'sourceId'; choice text:=payload->>'branch'; result jsonb;
begin
 perform pg_advisory_xact_lock(71532841);
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' or not ((ctx->'permissions') ? 'binds.read') then raise exception using errcode='42501',message='Нет доступа к биндам'; end if;
 if operation='list' then
  return jsonb_build_object(
   'choices',coalesce((select jsonb_object_agg(source_id,branch) from public.supportos_bind_choices where user_id=actor),'{}'),
   'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'sourceId',s.source_id,'sender',coalesce(nullif(u.display_name,''),u.email),'row',to_jsonb(b)))
     from public.supportos_bind_shares s join public.supportos_binds b on b.id=s.bind_id and b.owner_id=s.owner_id and b.source_bind_id=s.source_id
     join public.supportos_binds original on original.id=s.source_id and original.owner_id is null and not original.archived
     join public.supportos_users u on u.id=s.owner_id
     where s.recipient_id=actor and not b.archived and (public.supportos_rbac_context(s.owner_id)->>'status')='active'
      and ((public.supportos_rbac_context(s.owner_id)->'permissions') ? 'binds.read')),'[]'),
   'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'sourceId',s.source_id,'recipient',coalesce(nullif(u.display_name,''),u.email),'email',u.email)) from public.supportos_bind_shares s join public.supportos_users u on u.id=s.recipient_id where s.owner_id=actor),'[]')
  );
 end if;
 if operation='revoke' then
  select * into share_row from public.supportos_bind_shares where id=(payload->>'shareId')::uuid and owner_id=actor for update;
  if not found then raise exception using errcode='42501',message='Нет доступа к этой отправленной версии'; end if;
  delete from public.supportos_bind_choices where user_id=share_row.recipient_id and source_id=share_row.source_id and branch=share_row.id::text;
  delete from public.supportos_bind_shares where id=share_row.id;
  return jsonb_build_object('ok',true);
 end if;
 if operation in ('accept','reject','withdraw') then
  select * into proposal from public.supportos_bind_proposals where id=(payload->>'proposalId')::uuid for update;
  if not found or proposal.status<>'pending' then raise exception using errcode='40001',message='Предложение уже обработано'; end if;
  if operation='withdraw' then
   if proposal.author_id<>actor then raise exception using errcode='42501',message='Нельзя отозвать чужое предложение'; end if;
   update public.supportos_bind_proposals set status='withdrawn',resolved_at=clock_timestamp() where id=proposal.id;
   return jsonb_build_object('ok',true);
  end if;
  if not ((ctx->'permissions') ? 'knowledge.write') then raise exception using errcode='42501',message='Нет права публикации'; end if;
  if operation='accept' then
   select * into base from public.supportos_binds where id=proposal.source_id and owner_id is null and not archived for update;
   if not found or base.updated_at<>proposal.base_version then raise exception using errcode='40001',message='Основная версия изменилась. Сравните тексты и запросите новое предложение.'; end if;
   update public.supportos_binds set translations=proposal.translations,tags=proposal.tags,updated_at=clock_timestamp() where id=base.id;
  end if;
  update public.supportos_bind_proposals set status=case when operation='accept' then 'accepted' else 'rejected' end,resolved_at=clock_timestamp() where id=proposal.id;
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,after_data) values(actor,(select email from public.supportos_users where id=actor),'bind.proposal.'||operation,proposal.source_id,jsonb_build_object('proposalId',proposal.id));
  return jsonb_build_object('ok',true);
 end if;
 if operation='proposals' then
  return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('author',coalesce(nullif(u.display_name,''),u.email))) from public.supportos_bind_proposals p join public.supportos_users u on u.id=p.author_id where p.status='pending' and (p.author_id=actor or ((ctx->'permissions') ? 'knowledge.write')) and (source is null or p.source_id=source)),'[]');
 end if;
 select * into base from public.supportos_binds where id=source and owner_id is null and not archived for update;
 if not found then raise exception using errcode='22023',message='Основной бинд недоступен'; end if;
 if operation='history' then
  return coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (select * from public.supportos_bind_history where source_id=source and (owner_id is null or owner_id=actor) order by created_at desc limit 50) h),'[]');
 end if;
 select * into mine from public.supportos_binds where source_bind_id=source and owner_id=actor and not archived;
 if operation='choose' then
  if choice is null or (choice not in ('main','mine') and not exists(
   select 1 from public.supportos_bind_shares s join public.supportos_binds b on b.id=s.bind_id and b.owner_id=s.owner_id and not b.archived
   where s.id::text=choice and s.source_id=source and s.recipient_id=actor and (public.supportos_rbac_context(s.owner_id)->>'status')='active'
    and ((public.supportos_rbac_context(s.owner_id)->'permissions') ? 'binds.read')
  )) then raise exception using errcode='42501',message='Ветка недоступна'; end if;
  insert into public.supportos_bind_choices(user_id,source_id,branch) values(actor,source,choice) on conflict(user_id,source_id) do update set branch=excluded.branch;
  return jsonb_build_object('ok',true);
 end if;
 if mine.id is null then raise exception using errcode='22023',message='Сначала сохраните свою версию бинда'; end if;
 if operation='share' then
  select id into recipient from public.supportos_users where lower(email)=lower(trim(payload->>'email')) and status='active';
  if recipient is null or recipient=actor or not ((public.supportos_rbac_context(recipient)->'permissions') ? 'binds.read') then raise exception using errcode='22023',message='Укажите почту другого сотрудника с доступом к биндам'; end if;
  insert into public.supportos_bind_shares(bind_id,source_id,owner_id,recipient_id) values(mine.id,source,actor,recipient)
   on conflict(bind_id,recipient_id) do update set created_at=public.supportos_bind_shares.created_at returning * into share_row;
  return jsonb_build_object('id',share_row.id);
 end if;
 if operation='propose' then
  if exists(select 1 from public.supportos_bind_proposals where source_id=source and author_id=actor and status='pending') then raise exception using errcode='40001',message='Ваше предложение уже ожидает проверки'; end if;
  if base.updated_at is distinct from (payload->>'expected')::timestamptz then raise exception using errcode='40001',message='Основная версия изменилась. Обновите сравнение перед отправкой.'; end if;
  insert into public.supportos_bind_proposals(source_id,author_id,base_version,translations,tags) values(source,actor,base.updated_at,mine.translations,mine.tags) returning * into proposal;
  return to_jsonb(proposal);
 end if;
 raise exception using errcode='22023',message='Неизвестное действие';
end; $$;
revoke all on function public.supportos_bind_branch_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_bind_branch_action(uuid,text,jsonb) to service_role;
