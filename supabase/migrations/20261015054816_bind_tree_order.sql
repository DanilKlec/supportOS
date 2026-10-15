alter table public.supportos_binds add column if not exists order_index integer not null default 0;
create index if not exists supportos_binds_location_order_idx on public.supportos_binds(owner_id,category_id,folder_id,order_index,id);

-- Transfer only location/order. Concurrent text edits are never overwritten by a drag.
create function public.supportos_bind_transfer(actor uuid,sid uuid,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; state jsonb; destination text; folder text; before_id text; category_owner uuid; folder_owner uuid;
 source public.supportos_binds; target public.supportos_binds; copied public.supportos_binds; source_id text; source_ids text[]; moved_ids text[]:='{}'; affected text[]:='{}';
 replacements jsonb:='{}'; entry jsonb; can_write boolean; private_destination boolean; branch_owner uuid; siblings text[]; sequence_ids text[]; item text; slot integer; position integer; stamp timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(71532843);
 state:=public.supportos_mfa_session_state(actor,sid);ctx:=public.supportos_rbac_context(actor);
 if state->>'status' is distinct from 'approved' or ctx->>'status' is distinct from 'active' or not coalesce((ctx->'permissions') ? 'binds.read',false)
 then raise exception using errcode='42501',message='Нет доступа к переносу биндов'; end if;
 can_write:=coalesce((ctx->'permissions') ? 'knowledge.write',false);
 if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'sources') is distinct from 'array' or jsonb_array_length(payload->'sources') not between 1 and 100 or octet_length(payload::text)>40000 then raise exception 'Выберите от 1 до 100 биндов'; end if;
 destination:=payload->>'categoryId';folder:=nullif(payload->>'folderId','');before_id:=nullif(payload->>'beforeId','');
 select c.owner_id into category_owner from public.supportos_categories c where c.id=destination;
 if not found or (category_owner is not null and category_owner<>actor) then raise exception using errcode='42501',message='Раздел назначения недоступен'; end if;
 if folder is not null then
  select f.owner_id into folder_owner from public.supportos_folders f where f.id=folder and f.category_id=destination;
  if not found or (folder_owner is not null and folder_owner<>actor) then raise exception using errcode='42501',message='Папка назначения недоступна'; end if;
 end if;
 private_destination:=category_owner is not null or folder_owner is not null;
 select array_agg(e->>'id') into source_ids from jsonb_array_elements(payload->'sources') e;
 if exists(select 1 from unnest(source_ids) i where i is null or i !~ '^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$') or cardinality(source_ids)<>(select count(distinct i) from unnest(source_ids) i) or before_id=any(source_ids) then raise exception 'Некорректный список биндов'; end if;
 if before_id is not null then
  select b.* into target from public.supportos_binds b where b.id=before_id;
  if not found or target.archived or (target.owner_id is not null and target.owner_id<>actor) then raise exception using errcode='42501',message='Бинд назначения недоступен'; end if;
  if target.category_id<>destination or target.folder_id is distinct from folder then raise exception using errcode='40001',message='Расположение назначения изменилось. Обновите дерево'; end if;
  private_destination:=private_destination or target.owner_id is not null;
 end if;
 for entry in select value from jsonb_array_elements(payload->'sources') loop
  source_id:=entry->>'id';
  select b.* into source from public.supportos_binds b where b.id=source_id for update;
  if not found or source.archived then raise exception using errcode='40001',message='Бинд больше недоступен. Обновите дерево'; end if;
  if source.owner_id is not null and source.owner_id<>actor then raise exception using errcode='42501',message='Нельзя перемещать чужие бинды'; end if;
  if source.category_id is distinct from entry->>'categoryId' or source.folder_id is distinct from nullif(entry->>'folderId','') then raise exception using errcode='40001',message='Бинд уже перемещён другим сотрудником. Обновите дерево'; end if;
  if source.owner_id is null and (not can_write or private_destination) then
   select b.* into copied from public.supportos_binds b where b.owner_id=actor and b.source_bind_id=source.id and not b.archived order by b.updated_at desc,b.id limit 1 for update;
   if not found then
    copied:=jsonb_populate_record(null::public.supportos_binds,to_jsonb(source)||jsonb_build_object('id','bind-'||gen_random_uuid(),'slug','personal-'||gen_random_uuid(),'owner_id',actor,'source_bind_id',source.id,'source_hash',source.updated_at::text,'created_at',stamp,'updated_at',stamp));
    insert into public.supportos_binds select copied.*;
   end if;
   replacements:=replacements||jsonb_build_object(source.id,copied.id);source:=copied;
  end if;
  moved_ids:=array_append(moved_ids,source.id);
  update public.supportos_binds b set category_id=destination,folder_id=folder,updated_at=stamp where b.id=source.id;
 end loop;
 -- Reorder each ownership branch independently; personal moves never write shared siblings.
 for branch_owner in select distinct b.owner_id from public.supportos_binds b where b.id=any(moved_ids) loop
  select coalesce(array_agg(b.id order by b.order_index,
   coalesce((select t->>'title' from jsonb_array_elements(b.translations) t where t->>'language'='en' limit 1),(select t->>'title' from jsonb_array_elements(b.translations) t where t->>'language'='ru' limit 1),b.slug),b.id),'{}') into siblings
   from public.supportos_binds b where b.owner_id is not distinct from branch_owner and b.category_id=destination and b.folder_id is not distinct from folder and not b.archived and not b.id=any(moved_ids);
  slot:=coalesce(array_position(siblings,before_id),cardinality(siblings)+1);
  select array_agg(i order by ord) into sequence_ids from unnest(moved_ids) with ordinality a(i,ord) join public.supportos_binds b on b.id=a.i where b.owner_id is not distinct from branch_owner;
  sequence_ids:=coalesce(siblings[1:slot-1],'{}')||sequence_ids||coalesce(siblings[slot:cardinality(siblings)],'{}');
  position:=0;
  foreach item in array sequence_ids loop
   position:=position+1;
   update public.supportos_binds b set order_index=position,updated_at=stamp where b.id=item and b.order_index is distinct from position;
  end loop;
  affected:=affected||sequence_ids;
 end loop;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data) values(actor,(select email from public.supportos_users where id=actor),'library.bind.transfer',source_ids[1],payload,jsonb_build_object('ids',moved_ids,'replacements',replacements));
 return jsonb_build_object('binds',(select jsonb_agg(to_jsonb(b) order by b.order_index,b.id) from public.supportos_binds b where b.id=any(affected)),'replacements',replacements);
end $$;
revoke all on function public.supportos_bind_transfer(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_bind_transfer(uuid,uuid,jsonb) to service_role;
