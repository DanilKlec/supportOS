-- Read-only audit of the seven reported FKs. No EXPLAIN ANALYZE, stats resets,
-- synthetic production traffic or data writes. Count queries may scan tables.
with targets(table_name, column_name, required, reason) as (
 values
 ('supportos_ai_guidance', 'updated_by', false, 'Singleton; reads and writes use id=main; no parent hard-delete workflow'),
 ('supportos_bind_choices', 'source_id', true, 'Source bind FK cascade; PK is user-first'),
 ('supportos_bind_feedback', 'user_id', true, 'my-feedback user filter and auth user FK cascade'),
 ('supportos_bind_proposals', 'author_id', true, 'Author results ordered by resolved_at and author FK cascade'),
 ('supportos_bind_shares', 'owner_id', true, 'Outgoing branch shares by owner and user FK cascade'),
 ('supportos_bind_shares', 'source_id', true, 'Original bind join and source bind FK cascade'),
 ('supportos_shared_content', 'updated_by', false, 'Three read-only transition documents; reads use id; no parent hard-delete workflow')
), coverage as (
 select t.*, fk.conname as foreign_key, coalesce(indexes.names, '[]'::jsonb) as indexes,
  coalesce(jsonb_array_length(indexes.names)>0, false) as covered
 from targets t
 join pg_namespace n on n.nspname='public'
 join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
 join pg_attribute a on a.attrelid=c.oid and a.attname=t.column_name and not a.attisdropped
 join pg_constraint fk on fk.conrelid=c.oid and fk.contype='f' and fk.conkey=array[a.attnum]::smallint[]
 left join lateral (
  select jsonb_agg(ic.relname order by ic.relname) as names
  from pg_index i join pg_class ic on ic.oid=i.indexrelid
  join pg_am am on am.oid=ic.relam
  where i.indrelid=c.oid and i.indisvalid and i.indisready
   and i.indpred is null and am.amname='btree'
   -- Only a leading search key counts, NOT a later key or an INCLUDE column.
   and i.indnkeyatts>0 and i.indkey[0]=a.attnum
 ) indexes on true
), counts as (
 select 'supportos_ai_guidance' as name, count(*) as rows from public.supportos_ai_guidance
 union all select 'supportos_bind_choices', count(*) from public.supportos_bind_choices
 union all select 'supportos_bind_feedback', count(*) from public.supportos_bind_feedback
 union all select 'supportos_bind_proposals', count(*) from public.supportos_bind_proposals
 union all select 'supportos_bind_shares', count(*) from public.supportos_bind_shares
 union all select 'supportos_shared_content', count(*) from public.supportos_shared_content
)
select jsonb_build_object(
 'targets', coalesce((select jsonb_agg(to_jsonb(c) order by table_name, column_name) from coverage c), '[]'::jsonb),
 'missing_targets', coalesce((select jsonb_agg(jsonb_build_object('table_name',t.table_name,'column_name',t.column_name))
  from targets t where not exists(select 1 from coverage c where c.table_name=t.table_name and c.column_name=t.column_name)), '[]'::jsonb),
 'missing_required', coalesce((select jsonb_agg(to_jsonb(c) order by table_name, column_name) from coverage c where required and not covered), '[]'::jsonb),
 'intentional_exceptions', coalesce((select jsonb_agg(to_jsonb(c) order by table_name, column_name) from coverage c where not required), '[]'::jsonb),
 'row_counts', (select jsonb_object_agg(name, rows) from counts)
) as verification;
