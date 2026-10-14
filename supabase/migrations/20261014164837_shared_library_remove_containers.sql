-- Remove obsolete shared containers without deleting any bind or translation.
create function public.supportos_shared_tree_remove(actor uuid,sid uuid,entity text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; state jsonb; original jsonb; item_id text; category text; parent text;
 destination text; next_order integer; result jsonb; moved_folders integer:=0; moved_binds integer:=0;
begin
 perform pg_advisory_xact_lock(71532843);
 state:=public.supportos_mfa_session_state(actor,sid);
 ctx:=public.supportos_rbac_context(actor);
 if state->>'status' is distinct from 'approved' or ctx->>'status' is distinct from 'active'
  or not coalesce((ctx->'permissions') ?& array['binds.read','knowledge.write'],false)
 then raise exception using errcode='42501',message='Нет права изменять общую структуру'; end if;
 if entity is null or entity not in ('category','folder') or jsonb_typeof(payload) is distinct from 'object'
  or octet_length(payload::text)>8192 then raise exception 'Некорректное действие со структурой'; end if;
 if payload->>'strategy' is distinct from 'keep' then
  return public.supportos_shared_tree_change(actor,sid,entity,'delete',payload);
 end if;
 item_id:=payload->>'id';
 if entity='category' then
  select to_jsonb(c) into original from public.supportos_categories c where c.id=item_id for update;
 else
  select to_jsonb(f) into original from public.supportos_folders f where f.id=item_id for update;
 end if;
 if original is null then raise exception using errcode='40001',message='Объект уже удалён. Обновите дерево'; end if;
 if original->>'owner_id' is not null then raise exception using errcode='42501',message='Личная структура здесь недоступна'; end if;
 if (payload->>'expected')::timestamptz is distinct from (original->>'updated_at')::timestamptz
 then raise exception using errcode='40001',message='Структура изменена другим сотрудником. Обновите дерево'; end if;
 if entity='folder' then
  category:=original->>'category_id'; parent:=original->>'parent_id';
  if parent is not null and exists(with recursive ancestors(id,parent_id) as (
   select f.id,f.parent_id from public.supportos_folders f where f.id=parent
   union select f.id,f.parent_id from public.supportos_folders f join ancestors a on f.id=a.parent_id
  ) select 1 from ancestors where id=item_id) then raise exception 'Нарушена вложенность папок. Сначала переместите папку'; end if;
  if parent=item_id or (parent is not null and not exists(select 1 from public.supportos_folders f where f.id=parent and f.category_id=category and f.owner_id is null))
  then raise exception 'Родительская папка недоступна. Сначала переместите папку'; end if;
  if exists(select 1 from public.supportos_folders child join public.supportos_folders sibling
   on sibling.category_id=category and sibling.parent_id is not distinct from parent
   and sibling.owner_id is null and sibling.id<>item_id and lower(sibling.name)=lower(child.name)
   where child.parent_id=item_id and child.owner_id is null)
  then raise exception 'На уровень выше уже есть папка с таким названием. Сначала переименуйте вложенную папку'; end if;
  if exists(select 1 from public.supportos_folders f where f.parent_id=item_id and f.category_id<>category)
   or exists(select 1 from public.supportos_binds b where b.folder_id=item_id and b.category_id<>category)
  then raise exception 'Ссылки на папку требуют исправления. Сначала переместите материалы'; end if;
  select coalesce(max(f.order_index),0) into next_order from public.supportos_folders f
   where f.category_id=category and f.parent_id is not distinct from parent;
  with children as (select f.id,row_number() over(order by f.order_index,f.id)::integer n
   from public.supportos_folders f where f.parent_id=item_id)
  update public.supportos_folders f set parent_id=parent,order_index=next_order+children.n,updated_at=clock_timestamp()
   from children where f.id=children.id;
  get diagnostics moved_folders=row_count;
  -- Personal versions keep their owner, source, text and translations; only location changes.
  update public.supportos_binds b set folder_id=parent,updated_at=clock_timestamp() where b.folder_id=item_id;
  get diagnostics moved_binds=row_count;
 else
  destination:=nullif(payload->>'destinationCategoryId','');
  if not exists(select 1 from public.supportos_folders f where f.category_id=item_id)
   and not exists(select 1 from public.supportos_binds b where b.category_id=item_id)
  then return public.supportos_shared_tree_change(actor,sid,entity,'delete',payload); end if;
  if destination is null or destination=item_id or not exists(
   select 1 from public.supportos_categories c where c.id=destination and c.owner_id is null
  ) then raise exception 'Выберите другой общий раздел для содержимого. При необходимости сначала создайте новый'; end if;
  if exists(select 1 from public.supportos_folders child join public.supportos_folders sibling
   on sibling.category_id=destination and sibling.parent_id is null and sibling.owner_id is null
    and lower(sibling.name)=lower(child.name)
   where child.category_id=item_id and child.parent_id is null and child.owner_id is null)
  then raise exception 'В выбранном разделе уже есть папка с таким названием. Сначала переименуйте папку или выберите другой раздел'; end if;
  select coalesce(max(f.order_index),0) into next_order from public.supportos_folders f where f.category_id=destination and f.parent_id is null;
  with roots as (select f.id,row_number() over(order by f.order_index,f.id)::integer n from public.supportos_folders f where f.category_id=item_id and f.parent_id is null)
  update public.supportos_folders f set order_index=next_order+roots.n from roots where f.id=roots.id;
  update public.supportos_folders f set category_id=destination,updated_at=clock_timestamp() where f.category_id=item_id;
  get diagnostics moved_folders=row_count;
  update public.supportos_binds b set category_id=destination,updated_at=clock_timestamp() where b.category_id=item_id;
  get diagnostics moved_binds=row_count;
 end if;
 result:=public.supportos_shared_tree_change(actor,sid,entity,'delete',payload);
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data)
 values(actor,(select email from public.supportos_users where id=actor),'library.'||entity||'.contents-preserved',item_id,
  original,jsonb_build_object('destinationCategoryId',coalesce(destination,category),'parentId',parent,'foldersMoved',moved_folders,'bindsMoved',moved_binds));
 return result || jsonb_build_object('foldersMoved',moved_folders,'bindsMoved',moved_binds);
end $$;
revoke all on function public.supportos_shared_tree_remove(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_shared_tree_remove(uuid,uuid,text,jsonb) to service_role;

-- Personal branches can refer to shared containers too. Serialize their placement
-- with restructuring so a concurrent save cannot recreate an orphaned reference.
create or replace function public.supportos_shared_bind_location_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(71532843);
 if tg_op='UPDATE' and new.category_id is not distinct from old.category_id
  and new.folder_id is not distinct from old.folder_id and new.owner_id is not distinct from old.owner_id then return new; end if;
 if new.category_id <> 'supportos-shared' and not exists(
  select 1 from public.supportos_categories c where c.id=new.category_id and (c.owner_id is null or c.owner_id=new.owner_id)
 ) then raise exception 'Раздел больше недоступен. Обновите структуру'; end if;
 if new.folder_id is not null and not exists(
  select 1 from public.supportos_folders f where f.id=new.folder_id and f.category_id=new.category_id and (f.owner_id is null or f.owner_id=new.owner_id)
 ) then raise exception 'Папка больше недоступна. Обновите структуру'; end if;
 return new;
end $$;
-- Take the structure lock before REST writes acquire individual row locks.
create function public.supportos_library_write_lock() returns trigger
language plpgsql security invoker set search_path='' as $$
begin perform pg_advisory_xact_lock(71532843); return null; end $$;
revoke all on function public.supportos_library_write_lock() from public,anon,authenticated;
grant execute on function public.supportos_library_write_lock() to service_role;
create trigger supportos_library_bind_write_lock before insert or update or delete on public.supportos_binds
 for each statement execute function public.supportos_library_write_lock();
create trigger supportos_library_folder_write_lock before insert or update or delete on public.supportos_folders
 for each statement execute function public.supportos_library_write_lock();
create trigger supportos_library_category_write_lock before insert or update or delete on public.supportos_categories
 for each statement execute function public.supportos_library_write_lock();

-- Validate final folder references at commit: an entire section can move in one
-- transaction even if child rows are visited before their parents.
create function public.supportos_library_folder_reference_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare current_folder public.supportos_folders%rowtype;
begin
 if tg_op='UPDATE' and new.category_id is not distinct from old.category_id
  and new.parent_id is not distinct from old.parent_id and new.owner_id is not distinct from old.owner_id then return null; end if;
 select * into current_folder from public.supportos_folders f where f.id=new.id;
 if not found then return null; end if;
 if current_folder.category_id<>'supportos-shared' and not exists(select 1 from public.supportos_categories c
  where c.id=current_folder.category_id and (c.owner_id is null or c.owner_id=current_folder.owner_id))
 then raise exception 'Раздел папки больше недоступен. Обновите структуру'; end if;
 if current_folder.parent_id is not null then
  if not exists(select 1 from public.supportos_folders f where f.id=current_folder.parent_id
   and f.category_id=current_folder.category_id and (f.owner_id is null or f.owner_id=current_folder.owner_id))
  then raise exception 'Родительская папка больше недоступна. Обновите структуру'; end if;
  if current_folder.parent_id=current_folder.id or exists(with recursive ancestors(id,parent_id) as (
   select f.id,f.parent_id from public.supportos_folders f where f.id=current_folder.parent_id
   union select f.id,f.parent_id from public.supportos_folders f join ancestors a on f.id=a.parent_id
  ) select 1 from ancestors where id=current_folder.id)
  then raise exception 'Нельзя поместить папку внутрь себя или её дочерней папки'; end if;
 end if;
 return null;
end $$;
revoke all on function public.supportos_library_folder_reference_guard() from public,anon,authenticated;
grant execute on function public.supportos_library_folder_reference_guard() to service_role;
create constraint trigger supportos_library_folder_reference_guard after insert or update on public.supportos_folders
 deferrable initially deferred for each row execute function public.supportos_library_folder_reference_guard();
notify pgrst,'reload schema';
