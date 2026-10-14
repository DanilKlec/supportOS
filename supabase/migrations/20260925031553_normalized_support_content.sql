-- Normalized SupportOS reference data. Data migration is intentionally separate.
create table public.supportos_projects (
 id text primary key check (length(trim(id)) > 0),
 name text not null check (length(trim(name)) > 0),
 slug text not null check (length(trim(slug)) > 0),
 sheet_id text,
 source_url text,
 source_hash text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create unique index supportos_projects_slug_unique
on public.supportos_projects (lower(slug));

create table public.supportos_project_emails (
 id text primary key check (length(trim(id)) > 0),
 project_id text not null references public.supportos_projects(id) on delete cascade,
 type text not null check (length(trim(type)) > 0),
 email text not null check (length(trim(email)) > 0),
 note text,
 sort_order integer not null default 0 check (sort_order >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index supportos_project_emails_project_idx
on public.supportos_project_emails (project_id, sort_order, id);

create table public.supportos_welcome_bonuses (
 id text primary key check (length(trim(id)) > 0),
 project_id text not null references public.supportos_projects(id) on delete cascade,
 name text not null check (length(trim(name)) > 0),
 min_deposit_amount numeric check (min_deposit_amount >= 0),
 min_deposit_currency text,
 sort_order integer not null default 0 check (sort_order >= 0),
 valid_until date,
 review_due date,
 checked_at timestamptz,
 responsible text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index supportos_welcome_bonuses_project_idx
on public.supportos_welcome_bonuses (project_id, sort_order, id);

create index supportos_welcome_bonuses_review_idx
on public.supportos_welcome_bonuses (review_due)
where review_due is not null;

create table public.supportos_welcome_bonus_translations (
 welcome_bonus_id text not null references public.supportos_welcome_bonuses(id) on delete cascade,
 language text not null check (length(trim(language)) between 2 and 16),
 content text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (welcome_bonus_id, language)
);

create table public.supportos_currency_tables (
 id bigint generated always as identity primary key,
 name text not null check (length(trim(name)) > 0),
 sort_order integer not null default 0 check (sort_order >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create unique index supportos_currency_tables_name_unique
on public.supportos_currency_tables (lower(name));

create table public.supportos_bonus_rules (
 id text primary key check (length(trim(id)) > 0),
 project_id text not null references public.supportos_projects(id) on delete cascade,
 currency_table_id bigint references public.supportos_currency_tables(id) on delete set null,
 group_name text not null default '',
 welcome_wager text not null default '',
 welcome_max_win text not null default '',
 no_deposit text not null default '',
 retention_wager text not null default '',
 retention_max_win text not null default '',
 events text not null default '',
 map text not null default '',
 note text not null default '',
 sort_order integer not null default 0 check (sort_order >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index supportos_bonus_rules_project_idx
on public.supportos_bonus_rules (project_id, sort_order, id);

create index supportos_bonus_rules_currency_table_idx
on public.supportos_bonus_rules (currency_table_id)
where currency_table_id is not null;

create table public.supportos_currency_rows (
 id bigint generated always as identity primary key,
 currency_table_id bigint not null references public.supportos_currency_tables(id) on delete cascade,
 base text not null check (length(trim(base)) > 0),
 base_amount numeric check (base_amount >= 0),
 sort_order integer not null default 0 check (sort_order >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index supportos_currency_rows_table_idx
on public.supportos_currency_rows (currency_table_id, sort_order, id);

create table public.supportos_currency_values (
 currency_row_id bigint not null references public.supportos_currency_rows(id) on delete cascade,
 currency_code text not null check (length(trim(currency_code)) between 3 and 16),
 value_text text not null check (length(trim(value_text)) > 0),
 amount numeric check (amount >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (currency_row_id, currency_code)
);

create index supportos_currency_values_code_idx
on public.supportos_currency_values (currency_code, currency_row_id);

alter table public.supportos_projects enable row level security;
alter table public.supportos_project_emails enable row level security;
alter table public.supportos_welcome_bonuses enable row level security;
alter table public.supportos_welcome_bonus_translations enable row level security;
alter table public.supportos_bonus_rules enable row level security;
alter table public.supportos_currency_tables enable row level security;
alter table public.supportos_currency_rows enable row level security;
alter table public.supportos_currency_values enable row level security;

revoke all on table
 public.supportos_projects,
 public.supportos_project_emails,
 public.supportos_welcome_bonuses,
 public.supportos_welcome_bonus_translations,
 public.supportos_bonus_rules,
 public.supportos_currency_tables,
 public.supportos_currency_rows,
 public.supportos_currency_values
from public, anon, authenticated;

grant select, insert, update, delete on table
 public.supportos_projects,
 public.supportos_project_emails,
 public.supportos_welcome_bonuses,
 public.supportos_welcome_bonus_translations,
 public.supportos_bonus_rules,
 public.supportos_currency_tables,
 public.supportos_currency_rows,
 public.supportos_currency_values
to service_role;

revoke all on sequence
 public.supportos_currency_tables_id_seq,
 public.supportos_currency_rows_id_seq
from public, anon, authenticated;

grant usage, select on sequence
 public.supportos_currency_tables_id_seq,
 public.supportos_currency_rows_id_seq
to service_role;
