-- Workload audit: docs/foreign-key-index-audit.md.
-- Add only missing leading-key indexes with a real branch/signal query or
-- cascading FK use. No index drops, data mutations, grants or policy changes.
-- The two updated_by FKs intentionally remain unindexed: singleton AI guidance
-- and three read-only legacy documents are looked up exclusively by their PKs.
-- Apply transactionally; fail promptly instead of waiting behind busy writers.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- PK(user_id, source_id) serves user choices, not a source-only FK cascade.
create index if not exists supportos_bind_choices_source_idx
 on public.supportos_bind_choices using btree (source_id);

-- /api/binds?action=my-feedback filters user_id; PK(bind_id,user_id) cannot
-- supply a leading user key. Also covers auth.users ON DELETE CASCADE.
create index if not exists supportos_bind_feedback_user_idx
 on public.supportos_bind_feedback using btree (user_id);

-- /api/binds?action=proposal-results: author equality + resolved_at DESC LIMIT 50.
-- A full index covers the author FK across ALL statuses, unlike the existing
-- source-first partial unique index for pending proposals (which is retained).
create index if not exists supportos_bind_proposals_author_resolved_idx
 on public.supportos_bind_proposals using btree (author_id, resolved_at desc);

-- Branch RPC outgoing shares: WHERE owner_id=actor, JOIN recipient user.
create index if not exists supportos_bind_shares_owner_idx
 on public.supportos_bind_shares using btree (owner_id);

-- Branch RPC joins the original bind via source_id; parent bind deletion must
-- find source shares across all owners/recipients. Existing keys lead elsewhere.
create index if not exists supportos_bind_shares_source_idx
 on public.supportos_bind_shares using btree (source_id);
