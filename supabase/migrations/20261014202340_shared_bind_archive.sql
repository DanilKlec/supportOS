-- Remove shared answers without destroying translations, history or personal versions.
create function public.supportos_shared_bind_archive(actor uuid,sid uuid,item_id text,expected timestamptz,archived boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; state jsonb; before_row public.supportos_binds; after_row public.supportos_binds;
begin
 perform pg_advisory_xact_lock(71532843);
 state:=public.supportos_mfa_session_state(actor,sid);
 ctx:=public.supportos_rbac_context(actor);
 if state->>'status' is distinct from 'approved' or ctx->>'status' is distinct from 'active'
  or not coalesce((ctx->'permissions') ?& array['binds.read','knowledge.write'],false)
 then raise exception using errcode='42501',message='Нет права изменять общие бинды'; end if;
 if item_id is null or item_id !~ '^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$' or expected is null or archived is null
 then raise exception 'Некорректная версия бинда'; end if;
 select b.* into before_row from public.supportos_binds b where b.id=item_id for update;
 if not found then raise exception using errcode='40001',message='Бинд уже удалён. Обновите дерево'; end if;
 if before_row.owner_id is not null then raise exception using errcode='42501',message='Личный бинд здесь недоступен'; end if;
 if before_row.updated_at is distinct from expected then raise exception using errcode='40001',message='Бинд изменён другим сотрудником. Обновите дерево'; end if;
 if coalesce(before_row.archived,false)=archived then raise exception using errcode='40001',message='Состояние бинда уже изменено. Обновите дерево'; end if;
 update public.supportos_binds b set archived=supportos_shared_bind_archive.archived,updated_at=clock_timestamp() where b.id=item_id returning b.* into after_row;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data)
 values(actor,(select email from public.supportos_users where id=actor),case when archived then 'library.bind.archive' else 'library.bind.restore' end,item_id,to_jsonb(before_row),to_jsonb(after_row));
 return to_jsonb(after_row);
end $$;
revoke all on function public.supportos_shared_bind_archive(uuid,uuid,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.supportos_shared_bind_archive(uuid,uuid,text,timestamptz,boolean) to service_role;
