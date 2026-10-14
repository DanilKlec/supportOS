-- Existing shared imports and personal forks already reference this ID.
-- Restore the missing container without recategorizing DB-only/personal binds.
insert into public.supportos_categories(id,owner_id,name,order_index)
select 'supportos-shared',null,'Общие материалы',1000
where exists(select 1 from public.supportos_binds where category_id='supportos-shared')
on conflict(id) do nothing;
