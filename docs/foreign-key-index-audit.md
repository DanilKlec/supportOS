# Индексы FK: аудит рабочего набора запросов

Проверено 2026-10-08 на **SupportOS** (`exijfprfwmyplggayrpt`),
Postgres 17.6.1.166. Project ref совпадает с настроенным URL приложения.
Новая migration `*_useful_business_fk_indexes.sql` только добавляет индексы.
Старые migrations, данные, FK, RPC, RLS и grants не изменяются.

## Решения по семи предупреждениям

| FK | Строк до migration | Решение и основание |
| --- | ---: | --- |
| `supportos_bind_choices.source_id` | 5 | B-tree `(source_id)`: поиск дочерних строк при удалении исходного бинда и проверке изменения его ключа. PK `(user_id, source_id)` начинается с другого ключа. |
| `supportos_bind_feedback.user_id` | 0 | B-tree `(user_id)`: `/api/binds?action=my-feedback` фильтрует пользователя с `LIMIT 1000`; FK на `auth.users` имеет `ON DELETE CASCADE`. PK начинается с `bind_id`. |
| `supportos_bind_proposals.author_id` | 1 | B-tree `(author_id, resolved_at DESC)`: `/api/binds?action=proposal-results` фильтрует автора и статусы accepted/rejected, сортирует `resolved_at DESC`, возвращает 50 результатов. Также покрывает авторский FK **для всех статусов**. |
| `supportos_bind_shares.owner_id` | 1 | B-tree `(owner_id)`: outgoing shares в branch RPC фильтруются `owner_id=actor`, затем присоединяется получатель. FK на пользователя — cascade. |
| `supportos_bind_shares.source_id` | 1 | B-tree `(source_id)`: incoming shares присоединяют исходный бинд по `original.id=s.source_id`; FK cascade должен находить shares независимо от владельца/получателя. |
| `supportos_ai_guidance.updated_by` | 1 | **Без нового индекса**: singleton `main`, все рабочие чтения и записи идут по PK `id`. Фильтров/join по `updated_by` нет. В Accounts нет hard-delete пользователей или изменения их PK; disable меняет статус. Даже при ручном удалении Auth-пользователя FK проверяет одну строку. Пересмотреть при переходе к построчному guidance или массовому удалению пользователей. |
| `supportos_shared_content.updated_by` | 3 | **Без нового индекса**: read-only fallback ещё используется `server/content/index.js`, но исключительно по PK `id`. Запись emails/bonuses/bonus-tools уже normalized; три legacy JSON-документа оставлены нетронутыми. Пересмотреть при росте архива, запросах по автору или появлении hard-delete пользователей. |

### Проверенные callers

- `server/binds/index.js`: `proposal-results`, `my-feedback`, `knowledge-delete`.
- `supportos_bind_branch_action` в фактической DB и `supabase/bind-branches.sql`:
  outgoing/incoming shares, choices, pending proposals. Фактическое тело RPC
  сверено с локальным SQL; server-only RBAC не изменяется.
- `server/ai/_knowledge.js`, `supportos_save_ai_runtime`: `id='main'`, обновление
  `updated_by` само по себе не является основанием индексировать этот столбец.
- `server/content/index.js`: сначала normalized rows; только при их отсутствии
  legacy `supportos_shared_content?id=eq.<kind>`.
- Фактические FK, порядок ключей, предикаты и valid/ready flags прочитаны из
  `pg_constraint`/`pg_index`, а не выведены из имён индексов.

Сохранён partial unique `supportos_bind_proposals_pending(source_id,author_id)
WHERE status='pending'`: он обеспечивает бизнес-ограничение, но не заменяет
author-first индекс для всех статусов. Новая сортировка не вводит `status`
перед `resolved_at`: `status IN (...)` не даёт единого упорядоченного потока
по времени через индекс `(author_id,status,resolved_at)`.

## Фактическая статистика и ограничения выводов

До изменения advisor: `unindexed_foreign_keys = 7`, `unused_index = 11`.
В `pg_stat_statements` сгруппированы нормализованные формы запросов без вывода
пользовательских значений: branch RPC — **1 026** вызовов. Статистика statement
reset — 2026-09-08; database stats reset — 2026-08-25. Статистика не сбрасывалась.
Это подтверждает использование RPC, но не измеряет частоту каждого operation:
параметры нормализованы, внутренние SQL не обязательно отслеживаются отдельно.
Новых user feedback ещё нет, поэтому индекс обоснован существующим API и FK,
а не выдуманным текущим потоком запросов.

Проверенные старые индексы: choices PK — 658 scans, proposal pending — 364,
shares recipient — 627, shared-content PK — 414; guidance PK — 15.
Это счётчики на момент аудита, не SLA и не сравнение быстродействия.
Ни один `unused_index` не удалён: нулевой счётчик не доказывает бесполезность
constraint, редких операций или ещё не используемого workflow.

Таблицы для пяти новых индексов содержат 0–5 строк, каждая занимает не больше
32 KiB на момент проверки. Нет основания обещать ускорение на таком объёме:
планировщик вправе выбрать seq scan. Цель — покрыть реальный путь доступа/FK
при росте данных, не заставляя планировщик использовать индекс.

## Применение и проверка

- Migration создана через `supabase migration new useful_business_fk_indexes`.
  Пять обычных `CREATE INDEX IF NOT EXISTS`, без DROP/DELETE/UPDATE.
  Применяется транзакционно, с `lock_timeout=5s`, `statement_timeout=30s`;
  текущий объём допускает короткую блокировку записей. Если отложенный rollout
  идёт уже на больших таблицах, отдельно пересмотреть nontransactional
  `CREATE INDEX CONCURRENTLY`, не менять прошлые migrations.
- `server/foreign-key-indexes.database.test.js`: настоящая схема в PGlite,
  5 000 synthetic binds, EXPLAIN с обычным планировщиком; проверяются индексы
  user results, outgoing shares и source-only FK lookup. Нет forced index scan.
  Проверяются идемпотентность, сохранность строк/старых индексов/ACL/RLS/RPC,
  UPDATE ограничения и DELETE cascades на **локальных synthetic** данных.
- `supabase/verification/business-fk-indexes.sql`: read-only counts и coverage.
  Учитываются только valid/ready полные B-tree с FK в ведущем **search key**.
  Поздний ключ, INCLUDE, partial index или исчезнувший FK не дают ложный успех.
  `missing_required` и `missing_targets` должны быть пустыми; два `updated_by`
  остаются явными исключениями, не скрываются из advisor.
- После применения повторить performance advisor. Не создавать фиктивную
  нагрузку/EXPLAIN ANALYZE, чтобы обнулить `unused_index` замечания.

### Результат на подключённом проекте

Migration применена к SupportOS; remote history version — **20261008070104**.
Имя нового локального файла приведено к этой версии для совпадения migration
history; прошлые migrations не переименовывались и не исправлялись.

Повторный performance advisor, `observed_at=2026-10-08T07:01:31.104Z`:

| Проверка | До | После |
| --- | ---: | ---: |
| `unindexed_foreign_keys` | 7 | 2 — только два документированных `updated_by` |
| `unused_index` | 11 | 16 — прежние 11 плюс 5 новых, ещё без реальной нагрузки |

Remote read-only verification: `missing_required=[]`, `missing_targets=[]`,
все пять индексов valid/ready, с правильным ведущим ключом, без предиката.
Все десять старых индексов целевых таблиц сохранились с теми же определениями;
FK/unique constraints, table ACL, RLS flags и counts до/после совпали.
Counts остались: guidance 1, choices 5, feedback 0, proposals 1, shares 1,
legacy shared content 3. Ничего не удалялось и не переносилось.

Проверки: 69/69 целевых тестов в 10 файлах (из них 8 новых database tests),
`npm run build` прошёл. Полный suite в этом задании не запускался.

Основание: [Supabase FK advisor](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[unused index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
[Postgres 17: многоколоночные индексы](https://www.postgresql.org/docs/17/indexes-multicolumn.html).
