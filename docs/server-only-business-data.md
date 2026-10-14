# Server-only доступ к business data

Путь данных: React → authenticated `/api` → проверка сессии/Telegram и свежих DB permissions → Supabase с серверным ключом. `PUBLIC`, `anon` и `authenticated` не получают прямой table/column/sequence доступ к business data. RBAC выполняется сервером; `service_role` обходит RLS, поэтому RLS не заменяет серверные permission/ownership checks.

Миграция `20261007210927_harden_all_supportos_relation_grants.sql` дополняет прежний фиксированный список: все существующие `public.supportos_*` tables/views, public partitions/inheritance children и связанные sequences, включая переименованные. REVOKE снимает также независимые column grants; RLS включён для ordinary/partitioned tables, существующие policies не меняются. На остаточных правах через role inheritance/ownership миграция останавливается и откатывается. Никаких allow-all policies, изменений данных, функций, ролей или grants `service_role` нет.

## Проверенные callers

В production `src/` нет вызовов `supabaseService.select/insert/upsert/updateWhere/delete/rpc`, SDK `from/rpc/channel` для business data или `postgres_changes`. Binds, personal branches, history/proposals/signals идут через `/api/binds`; emails/bonuses/currency tools — `/api/content`; catalog — `/api/projects`; AI/QC — `/api/ai`; users/RBAC/security — `/api/accounts`. Старые generic REST methods в `supabase.service.ts` пока остаются неиспользуемыми legacy helpers, не production workflow. Regression test запрещает их повторное использование. Их наличие не предоставляет DB privileges.

## Исключения и границы

| Объект/путь | Разрешено | Ограничение |
| --- | --- | --- |
| Business `supportos_*` tables, columns, sequences | Только доверенный backend | Browser exceptions отсутствуют, в том числе для personal records, project catalog, QC, RBAC и security history |
| Supabase Auth SDK в браузере | Вход, состояние/обновление сессии, выход | Это Auth API, не CRUD `auth.sessions` или business tables; managed Auth objects не меняются |
| `service_role` и серверные RPC/private helpers | Существующие серверные ACL | Ключ только на сервере; journals `supportos_access_audit`/`supportos_login_events` сохраняют SELECT+INSERT без UPDATE/DELETE/TRUNCATE |
| Legacy RLS policies с `TO authenticated` | Сохранены как defense-in-depth | Это не исключение table access; helper `supportos_access(text)` также server-only, см. [отдельный аудит](access-helper-security.md) |
| Managed `auth`, `storage`, `realtime`, системные схемы | Вне этой business migration | Не трогаются DDL/grants Supabase; sessions доступны пользователю только через ограниченный backend API |
| `monitor_*` и другие объекты без business prefix | Вне этой migration | Прямого production browser CRUD в них нет; отдельная схема/миграции мониторинга не переписываются |
| Supabase Dashboard/SQL Editor, владелец таблиц | Доверенное администрирование | Не является app/browser workflow; owner/superuser привилегии не отзываются |

## Инвентаризация linked DB

Проверка 2026-10-08, проект `exijfprfwmyplggayrpt`, PostgreSQL 17.6. Найдены 25 `public.supportos_*` ordinary tables, все с RLS; browser table/column grants уже отсутствовали. Других business schemas, views/materialized views/foreign/partitioned tables и views с зависимостью от этих таблиц нет. Browser roles не superuser/BYPASSRLS и не состоят в дополнительных ролях. Browser-callable public SupportOS SECURITY DEFINER functions отсутствуют.

Полный список проверенных таблиц:

- Content: `supportos_categories`, `supportos_folders`, `supportos_binds`, `supportos_bind_history`, `supportos_bind_shares`, `supportos_bind_proposals`, `supportos_bind_choices`, `supportos_bind_feedback`, `supportos_knowledge_gaps`, `supportos_ai_guidance`, `supportos_shared_content`, `supportos_personal_content`.
- RBAC: `supportos_users`, `supportos_roles`, `supportos_permissions`, `supportos_role_permissions`, `supportos_user_roles`, `supportos_access_audit`.
- Security: `supportos_login_events`, `supportos_password_requests`, `supportos_telegram_critical_requests`, `supportos_telegram_link_requests`, `supportos_telegram_links`, `supportos_telegram_login_challenges`, `supportos_telegram_registration`.

Из четырёх sequences две имели лишние anon/authenticated USAGE/SELECT/UPDATE: `supportos_access_audit_id_seq` и `supportos_bind_history_id_seq`. Миграция снимает эти SQL privileges, не меняя counters. Это не означает существования автоматически доступного PostgREST endpoint для sequence. Остальные две (`supportos_knowledge_gaps_id_seq`, `supportos_login_events_id_seq`) уже были закрыты; их серверные права сохраняются.

Normalized projects/emails/bonuses/currency tables, revisions/migration reports, glossary и AI feedback есть в локальных migrations, но **не установлены в этой linked DB**. Эта задача не применяет посторонние schema/backfill migrations и не утверждает, что normalized DB заполнена. Новая миграция охватит их, если они существуют при применении; PostgreSQL tests дополнительно загружают normalized content/glossary/feedback migrations. Новые/поздно применяемые schema migrations обязаны сами снимать browser grants.

## Новые migrations и default privileges

В linked `public` обнаружены Supabase default grants для новых tables/sequences от `postgres` и `supabase_admin` к `anon`/`authenticated`. Они **не** доказывают доступ к уже закрытой таблице. Default privileges нельзя ограничить prefix `supportos_*`; глобальная отмена затронула бы все будущие объекты схемы, поэтому она не выполняется этим scoped изменением.

Каждая новая business migration должна в одной транзакции создать таблицу, включить RLS, выполнить `REVOKE ALL ... FROM PUBLIC, anon, authenticated` для таблицы и identity/serial sequences и выдать только необходимые серверные privileges. Для новых column grants — отдельный column REVOKE. Для RPC отдельно снять browser/PUBLIC EXECUTE. Не запускать legacy bootstrap SQL поверх актуальных migrations: он может вернуть browser grants. После новых migrations обязательно запускать read-only [verification SQL](../supabase/verification/server-only-business-grants.sql): `violations=[]`, `tables_without_rls=0`. Этот файл проверяет эффективные privileges, в том числе PUBLIC/inherited grants и PG17 MAINTAIN.

[Supabase: grants и RLS](https://supabase.com/docs/guides/api/securing-your-api) — разные уровни: grants определяют достижимость объекта, RLS ограничивает строки. Отсутствующие policies у намеренно закрытых server-only tables допустимы; INFO advisor не является основанием создавать разрешающие policies.

## Проверки

`server/business-grants.database.test.js` использует реальный PostgreSQL/PGlite: независимые column/PUBLIC grants, actual normalized tables, owned/renamed/unowned sequences, partitions/views, идемпотентность, SQL 42501, сохранность данных/policies/server ACL, append-only journals, server content CRUD/RBAC, rollback на inherited grants и read-only verification. Existing revoke-other-sessions integration suite также применяет эту миграцию перед проверкой Accounts/Binds/AI API и sensitive checks.

Миграция применена к linked DB. После применения verification: 25 таблиц, 4 sequences, `violations=[]`, `tables_without_rls=0`. Все 19 существующих policies (включая их определения), серверные table/sequence ACL и количества строк во всех 25 таблицах совпали до/после. Миграция не вызывает nextval/setval и не меняет counters. 128 целевых tests в 11 files и `npm run build` прошли.

Повторный security advisor: ERROR отсутствуют; остаётся только прежний WARN [Leaked password protection выключена](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Настройки Auth вне этой задачи. INFO [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) оставлен для намеренно server-only tables; никаких policies для косметического подавления advisor не добавлено.
