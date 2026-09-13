-- Extend the existing private runtime document; no second knowledge/project store.
with added as (
 insert into public.supportos_permissions(id,name,description,creator_only) values
 ('translator.use','Использование переводчика','Перевод текста',false),
 ('composer.use','Использование Composer','Подготовка ответов в рабочем пространстве',false),
 ('ai.rules','Управление AI Rules','Создание и редактирование черновиков правил',false),
 ('ai.playground','AI Playground','Проверка Production и Draft Preview',false),
 ('ai.tests','AI Tests','Управление и запуск тестов',false),
 ('ai.publish','Публикация AI','Публикация и архивирование AI-материалов',false)
 on conflict(id) do nothing returning id
)
insert into public.supportos_role_permissions(role_id,permission_id)
select r.id,p.id from public.supportos_roles r cross join added p
where r.id='creator'
 or (p.id in ('translator.use','composer.use') and exists(select 1 from public.supportos_role_permissions old where old.role_id=r.id and old.permission_id='tools'))
 or (p.id in ('ai.rules','ai.playground','ai.tests') and exists(select 1 from public.supportos_role_permissions old where old.role_id=r.id and old.permission_id='ai.train'))
 or (p.id='ai.publish' and exists(select 1 from public.supportos_role_permissions old where old.role_id=r.id and old.permission_id='ai.train') and exists(select 1 from public.supportos_role_permissions old where old.role_id=r.id and old.permission_id='knowledge.write'))
on conflict do nothing;
alter table public.supportos_ai_guidance add column if not exists document jsonb not null default '{"entries":[],"feedback":[]}';
alter table public.supportos_ai_guidance add column if not exists version integer not null default 1;
-- Bring legacy global instructions into the same Draft/Publish lifecycle.
update public.supportos_ai_guidance set document=jsonb_build_object('global','','feedback',coalesce(document->'feedback','[]'),'entries',coalesce(document->'entries','[]') || jsonb_build_array(jsonb_build_object(
 'id','global-instructions','kind','projects','title','Global AI Instructions','content',content,'project','','category','','language','','intent','general','priority',100,'enabled',true,'status','published','required','[]'::jsonb,'forbidden','[]'::jsonb,'related','[]'::jsonb,'reference','','author',updated_by,'updatedAt',updated_at,
 'published',jsonb_build_object('kind','projects','title','Global AI Instructions','content',content,'project','','language','','intent','general','priority',100,'enabled',true))))
where not (document ? 'global') and content<>'';
create or replace function public.supportos_save_ai_runtime(actor uuid, expected integer, operation text, value jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; current public.supportos_ai_guidance; next_document jsonb;
begin
 ctx:=public.supportos_rbac_context(actor);
 if ctx is null or ctx->>'status'<>'active' then raise exception using errcode='42501',message='Нет доступа'; end if;
 if operation='feedback' then
  if not ((ctx->'permissions') ? 'composer.use') then raise exception using errcode='42501',message='Нет доступа'; end if;
 else
  if not ((ctx->'permissions') ?| array['ai.train','ai.rules','ai.tests','ai.publish']) then raise exception using errcode='42501',message='Нет права обучения AI'; end if;
  if operation in ('publish','archive','instructions') and not ((ctx->'permissions') ? 'ai.publish') then raise exception using errcode='42501',message='Нет права публикации'; end if;
  if operation not in ('save','delete','publish','archive','instructions') then raise exception 'Invalid operation'; end if;
 end if;
 select * into current from public.supportos_ai_guidance where id='main' for update;
 if operation='feedback' then
  if coalesce(value->>'rating','') not in ('positive','negative') or length(value::text)>1000 then raise exception 'Invalid feedback'; end if;
  next_document:=jsonb_set(current.document,'{feedback}',coalesce(current.document->'feedback','[]') || jsonb_build_array(value || jsonb_build_object('author',actor,'createdAt',clock_timestamp())));
  next_document:=jsonb_set(next_document,'{feedback}',coalesce((select jsonb_agg(item order by n) from (select item,n from jsonb_array_elements(next_document->'feedback') with ordinality x(item,n) order by n desc limit 100) recent),'[]'));
 else
  if expected is distinct from current.version then raise exception using errcode='40001',message='AI-документ изменён. Обновите перед сохранением'; end if;
  next_document:=value-'_change';
  if jsonb_typeof(next_document->'entries') is distinct from 'array' or length(next_document::text)>250000 then raise exception 'Invalid AI document'; end if;
  next_document:=jsonb_set(next_document,'{feedback}',coalesce(current.document->'feedback','[]'));
  insert into public.supportos_access_audit(actor_id,actor_label,action,target_id,before_data,after_data)
  values(actor,(select email from public.supportos_users where id=actor),'ai.'||operation,coalesce(value->'_change'->>'id','main'),jsonb_build_object('version',current.version),jsonb_build_object('version',current.version+1,'kind',value->'_change'->>'kind'));
 end if;
 update public.supportos_ai_guidance set document=next_document,
 version=version+case when operation='feedback' then 0 else 1 end,
 updated_by=case when operation='feedback' then updated_by else actor end,
 updated_at=case when operation='feedback' then updated_at else clock_timestamp() end where id='main';
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.supportos_save_ai_runtime(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.supportos_save_ai_runtime(uuid,integer,text,jsonb) to service_role;

-- Filter before pagination while preserving the existing two-argument caller contract.
create or replace function public.supportos_rbac_list_users(search_text text,page_number integer,status_filter text,role_filter text)
returns jsonb language sql stable security invoker set search_path='' as $$
 with matching as (
  select u.* from public.supportos_users u where
   (u.email ilike '%'||left(coalesce(search_text,''),120)||'%' or u.display_name ilike '%'||left(coalesce(search_text,''),120)||'%')
   and (coalesce(status_filter,'')='' or u.status=status_filter)
   and (coalesce(role_filter,'')='' or exists(select 1 from public.supportos_user_roles ur where ur.user_id=u.id and ur.role_id=role_filter))
 ), page as (
  select * from matching order by email,id limit 50 offset greatest(0,page_number-1)*50
 ) select jsonb_build_object('total',(select count(*) from matching),'users',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('roles',coalesce((select jsonb_agg(role_id order by role_id) from public.supportos_user_roles where user_id=p.id),'[]'::jsonb)) order by p.email,p.id) from page p),'[]'::jsonb));
$$;
revoke all on function public.supportos_rbac_list_users(text,integer,text,text) from public,anon,authenticated;
grant execute on function public.supportos_rbac_list_users(text,integer,text,text) to service_role;
