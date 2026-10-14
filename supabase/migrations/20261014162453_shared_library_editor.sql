-- Shared folder edits are atomic and cannot touch personal libraries.
create function public.supportos_shared_tree_change(actor uuid,sid uuid,entity text,operation text,payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; state jsonb; before_row jsonb; after_row jsonb; item_id text;
 item_name text; category text; parent text; tint text; next_order integer; siblings text[]; pos integer; other_pos integer; swap text;
begin
 perform pg_advisory_xact_lock(71532843);
 state:=public.supportos_mfa_session_state(actor,sid);
 ctx:=public.supportos_rbac_context(actor);
 if state->>'status' is distinct from 'approved' or ctx->>'status' is distinct from 'active'
  or not coalesce((ctx->'permissions') ?& array['binds.read','knowledge.write'],false)
 then raise exception using errcode='42501',message='Нет права изменять общую структуру'; end if;
 if entity is null or operation is null or entity not in ('category','folder') or operation not in ('save','delete','up','down')
  or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>8192
 then raise exception 'Некорректное действие со структурой'; end if;
 item_id:=payload->>'id';
 if item_id is not null and item_id !~ '^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,199}$' then raise exception 'Некорректный объект'; end if;
 if entity='category' then
  select to_jsonb(c) into before_row from public.supportos_categories c where c.id=item_id for update;
 else
  select to_jsonb(f) into before_row from public.supportos_folders f where f.id=item_id for update;
 end if;
 if before_row is not null and before_row->>'owner_id' is not null then raise exception using errcode='42501',message='Личная структура здесь недоступна'; end if;
 if item_id is not null and before_row is null then raise exception using errcode='40001',message='Объект уже удалён. Обновите дерево'; end if;
 if before_row is not null and (payload->>'expected')::timestamptz is distinct from (before_row->>'updated_at')::timestamptz
 then raise exception using errcode='40001',message='Структура изменена другим сотрудником. Обновите дерево'; end if;
 if before_row is null and operation<>'save' then raise exception 'Объект не выбран'; end if;
 if operation='save' then
  item_name:=trim(payload->>'name');
  tint:=nullif(payload->>'color','');
  if item_name is null or length(item_name) not between 1 and 120 then raise exception 'Название: от 1 до 120 символов'; end if;
  if tint is not null and tint !~ '^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$' then raise exception 'Некорректный цвет'; end if;
  if entity='folder' then
   category:=payload->>'categoryId'; parent:=nullif(payload->>'parentId','');
   if not exists(select 1 from public.supportos_categories c where c.id=category and c.owner_id is null) then raise exception 'Общий раздел не найден'; end if;
   if before_row is not null and category is distinct from before_row->>'category_id' then raise exception 'Папки перемещаются внутри своего раздела'; end if;
   if parent is not null then
    if not exists(select 1 from public.supportos_folders f where f.id=parent and f.category_id=category and f.owner_id is null) then raise exception 'Родительская папка недоступна'; end if;
    if parent=item_id or exists(with recursive ancestors(id,parent_id) as (
     select f.id,f.parent_id from public.supportos_folders f where f.id=parent
     union select f.id,f.parent_id from public.supportos_folders f join ancestors a on f.id=a.parent_id
    ) select 1 from ancestors where id=item_id) then raise exception 'Нельзя поместить папку внутрь себя или её дочерней папки'; end if;
   end if;
   if exists(select 1 from public.supportos_folders f where f.owner_id is null and f.category_id=category and f.parent_id is not distinct from parent and lower(f.name)=lower(item_name) and f.id is distinct from item_id) then raise exception 'Папка с таким названием уже есть'; end if;
   if before_row is null or parent is distinct from before_row->>'parent_id' then
    select coalesce(max(f.order_index),0)+1 into next_order from public.supportos_folders f where f.owner_id is null and f.category_id=category and f.parent_id is not distinct from parent;
   else next_order:=(before_row->>'order_index')::integer; end if;
   if item_id is null then
    item_id:='folder-'||gen_random_uuid();
    insert into public.supportos_folders(id,owner_id,category_id,parent_id,name,color,order_index) values(item_id,null,category,parent,item_name,tint,next_order) returning to_jsonb(supportos_folders.*) into after_row;
   else
    update public.supportos_folders f set name=item_name,parent_id=parent,color=tint,order_index=next_order,updated_at=clock_timestamp() where f.id=item_id returning to_jsonb(f.*) into after_row;
   end if;
  else
   if exists(select 1 from public.supportos_categories c where c.owner_id is null and lower(c.name)=lower(item_name) and c.id is distinct from item_id) then raise exception 'Раздел с таким названием уже есть'; end if;
   if item_id is null then
    item_id:='category-'||gen_random_uuid();
    select coalesce(max(c.order_index),0)+1 into next_order from public.supportos_categories c where c.owner_id is null;
    insert into public.supportos_categories(id,owner_id,name,color,order_index) values(item_id,null,item_name,tint,next_order) returning to_jsonb(supportos_categories.*) into after_row;
   else
    update public.supportos_categories c set name=item_name,color=tint,updated_at=clock_timestamp() where c.id=item_id returning to_jsonb(c.*) into after_row;
   end if;
  end if;
 elsif operation='delete' then
  if entity='folder' then
   if exists(select 1 from public.supportos_folders f where f.parent_id=item_id) or exists(select 1 from public.supportos_binds b where b.folder_id=item_id) then raise exception 'Папка содержит материалы или вложенные папки. Сначала переместите их'; end if;
   delete from public.supportos_folders f where f.id=item_id;
  else
   if exists(select 1 from public.supportos_folders f where f.category_id=item_id) or exists(select 1 from public.supportos_binds b where b.category_id=item_id) then raise exception 'Раздел не пуст. Сначала переместите его содержимое'; end if;
   delete from public.supportos_categories c where c.id=item_id;
  end if;
 else
  if entity='category' then
   select array_agg(c.id order by c.order_index,c.id) into siblings from public.supportos_categories c where c.owner_id is null;
  else
   select array_agg(f.id order by f.order_index,f.id) into siblings from public.supportos_folders f where f.owner_id is null and f.category_id=before_row->>'category_id' and f.parent_id is not distinct from before_row->>'parent_id';
  end if;
  pos:=array_position(siblings,item_id); other_pos:=pos+case when operation='up' then -1 else 1 end;
  if other_pos between 1 and array_length(siblings,1) then
   swap:=siblings[pos]; siblings[pos]:=siblings[other_pos]; siblings[other_pos]:=swap;
   if entity='category' then
    update public.supportos_categories c set order_index=array_position(siblings,c.id),updated_at=clock_timestamp() where c.id=any(siblings);
   else
    update public.supportos_folders f set order_index=array_position(siblings,f.id),updated_at=clock_timestamp() where f.id=any(siblings);
   end if;
  end if;
  if entity='category' then select to_jsonb(c) into after_row from public.supportos_categories c where c.id=item_id;
  else select to_jsonb(f) into after_row from public.supportos_folders f where f.id=item_id; end if;
 end if;
 insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data)
 values(actor,(select email from public.supportos_users where id=actor),'library.'||entity||'.'||operation,item_id,before_row,after_row);
 return jsonb_build_object('ok',true,'row',after_row);
end $$;
revoke all on function public.supportos_shared_tree_change(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_shared_tree_change(uuid,uuid,text,text,jsonb) to service_role;

-- Serialize bind placement with folder deletion, including the existing REST save path.
-- The virtual supportos-shared category is retained for the legacy bulk publisher.
create or replace function public.supportos_shared_bind_location_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.owner_id is not null then return new; end if;
 perform pg_advisory_xact_lock(71532843);
 if tg_op='UPDATE' and new.category_id is not distinct from old.category_id
  and new.folder_id is not distinct from old.folder_id and old.owner_id is null then return new; end if;
 if new.category_id <> 'supportos-shared' and not exists(
  select 1 from public.supportos_categories c where c.id=new.category_id and c.owner_id is null
 ) then raise exception 'Общий раздел больше недоступен. Обновите структуру'; end if;
 if new.folder_id is not null and not exists(
  select 1 from public.supportos_folders f where f.id=new.folder_id and f.category_id=new.category_id and f.owner_id is null
 ) then raise exception 'Папка больше недоступна. Обновите структуру'; end if;
 return new;
end $$;
revoke all on function public.supportos_shared_bind_location_guard() from public,anon,authenticated;
grant execute on function public.supportos_shared_bind_location_guard() to service_role;
create trigger supportos_shared_bind_location_guard before insert or update of owner_id,category_id,folder_id
on public.supportos_binds for each row execute function public.supportos_shared_bind_location_guard();
notify pgrst,'reload schema';
