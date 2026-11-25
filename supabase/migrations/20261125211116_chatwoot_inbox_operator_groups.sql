alter table public.supportos_chatwoot_widget_settings
  add column operator_team_ids bigint[] not null default '{}',
  add column direct_operator_ids bigint[] not null default '{}',
  add column group_member_ids bigint[] not null default '{}';

create index supportos_chatwoot_widget_settings_operator_teams_idx
  on public.supportos_chatwoot_widget_settings using gin (operator_team_ids);
