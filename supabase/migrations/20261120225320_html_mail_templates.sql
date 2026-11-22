alter table public.supportos_mail_templates
  add column html text check (char_length(html) between 1 and 220000),
  add column layout jsonb check (layout is null or (html is not null and jsonb_typeof(layout) = 'object'));
