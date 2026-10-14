# Исправление общей публикации почт и бонусов

## Повторный сбой: обязательный WHERE в Supabase

После доставки отсутствующей RPC пользователь снова получил HTTP 502.
Read-only диагностика gateway и PostgreSQL logs установила точную причину:
SQLSTATE `21000`, `DELETE requires a WHERE clause`, строка 51 функции
`supportos_publish_normalized_content`. Ошибка относится к общей функции
почт, welcome-бонусов и bonus-tools; это не необходимость снова входить
в аккаунт или обновлять права.

Первый тест в PGlite проверял SQL/permissions/concurrency, но не моделировал
server-side safe-update guard. Первое исправление доставило RPC, однако
безусловные DELETE внутри неё по-прежнему блокировались реальным сервером.
Механизм guard описан в [pg-safeupdate](https://github.com/eradman/pg-safeupdate).

Новая миграция `20261009085144_safe_normalized_content_publication.sql`
применена к SupportOS DB. Она заменяет только функцию; старые миграции,
системный guard, table grants, RBAC и данные при установке не меняются.
Remote version и локальное имя новой миграции согласованы.

- Почты, бонусы, переводы и правила обновляются через UPSERT.
- Predicate-scoped DELETE удаляет только идентификаторы, исключённые из
  полного сохраняемого снимка соответствующего справочника.
- Валютные таблицы сохраняют ID; строки без client ID заменяются только
  внутри явно выбранной именованной таблицы через `WHERE currency_table_id`.
- Существующие `created_at` почт, бонусов и валютных таблиц сохраняются.
- Повторяющиеся IDs/названия не разрешено незаметно перезаписывать через
  UPSERT: операция целиком отклоняется с прежним SQLSTATE `23505`.
- Atomicity, expected version / 409, permission checks и аудит остаются.
- Нет `WHERE true`, отключения guard, TRUNCATE, записи в legacy archive
  или прямого browser доступа.

До/после установки fingerprint почт, бонусов, правил и legacy archive
совпал; версии справочников остались 1. Real publication после установки
выполнил сам пользователь в своём интерфейсе и подтвердил:
**«Оба раздела сохранились»**. Ассистент не публиковал пользовательский
черновик и не делал пробные изменения в реальных данных.

Read-only verification после пользовательского сохранения подтвердила
emails version 2 и bonuses version 3, а также реальные `content.publish`
audit events с `storage=normalized` для обоих разделов.

Новые regression tests сначала воспроизвели сбой: отсутствие WHERE,
пересоздание email/bonus timestamps и currency table IDs. После правки
проверяются predicates без tautology, обновление существующих записей,
удаление только исключённых записей/переводов, empty snapshots,
duplicate rejection и сохранение каталога проектов.

Изменённые файлы этого повторного прохода:

- `supabase/migrations/20261009085144_safe_normalized_content_publication.sql`
- `server/content/publication.database.test.js`
- `server/content/database.test.js`
- `docs/publication-regression-2026-10-09.md`

Security advisors после правки: прежние 37 INFO server-only RLS и 1 WARN
Leaked Password Protection; новых WARN/ERROR нет.

Финальные проверки повторного прохода: `npm run test` — PASS, 723 tests /
122 files; `npm run check` — PASS с прежними 61 warnings / 27 infos;
`npm run build` — PASS, без изменений frontend bundle. UI и стили не менялись;
visual regression этого повторного SQL-only прохода не перезапускался.

Ниже сохранены результаты первого прохода как история, не доказательство
успешной real publication до повторного исправления.

## Причина

В SupportOS DB `exijfprfwmyplggayrpt` существовали normalized tables и
`supportos_content_revisions`, но отсутствовали обе серверные функции:
`supportos_publish_normalized_content(uuid,text,integer,jsonb)` и
`supportos_upsert_content_project(text,text,text,text,text,text)`.
API уже вызывал первую для почт, welcome-бонусов и bonus-tools.
Чтение работало, а ошибка отсутствующей RPC превращалась в общий текст
«Не удалось опубликовать данные» с некорректным HTTP 400.

## Исправление

- Новая миграция `20261009082433_normalized_content_publication_rpc.sql`
  доставляет существующие normalized CRUD-функции без изменения их бизнес-логики.
  Старые миграции не редактировались. При применении миграции нет записей
  в business tables, archive, revisions или RBAC assignments.
- Обе функции — `SECURITY INVOKER`, с фиксированным пустым search_path.
  EXECUTE разрешён только backend `service_role`, запрещён
  `PUBLIC/anon/authenticated`; browser grants и RLS не изменяются.
- Сохраняются текущая проверка write permissions, atomic publication,
  expected version / HTTP 409 и access audit. Legacy storage остаётся read-only.
- API различает ошибку отсутствующей миграции и некорректные пользовательские
  данные: неожиданные storage errors возвращаются как HTTP 502 с безопасным
  кодом, без SQL, payload, details или hint. 400/403/409 сохраняются для
  validation, permissions и optimistic conflicts.

Миграция применена через Supabase MCP. Remote migration history присвоила
версию `20261009082433`, имя `normalized_content_publication_rpc`.
Файл создан CLI и затем сопоставлен с фактической remote version;
локальное имя и migration history совпадают. PostgREST получает `reload schema`.

## Проверка без изменения записей команды

До и после применения:

| Данные | Строк | Fingerprint до = после |
| --- | ---: | --- |
| Бинды | 113 | `21160c4929971bfc7cfc45b5fef73bc1` |
| Адреса почт | 133 | `b7427748dbdf95471ec021501b6792f5` |
| Welcome-бонусы | 160 | `343caf33de27347a8c6e59635b302878` |
| Legacy archive | — | `e9aa0fc40c147a6ac970367e35eef70f` |

Версии всех трёх общих справочников остались 1. Remote verification
подтвердила наличие обеих RPC, `prosecdef=false`, EXECUTE для service_role
и отсутствие EXECUTE для anon/authenticated. Live публикация реальных
черновиков не выполнялась: пользователь повторяет её сам.

В изолированном PGlite тест воспроизводит именно deployed partial rollout:
таблицы и revisions уже есть, RPC ещё нет. После новой миграции под реальной
SQL-ролью service_role проверяются:

- публикация/изменение почт, произвольные types, notes и ordering;
- бонусы, переводы, freshness и сопоставление legacy project ID с каталогом;
- bonus rules, currency tables/values и права на identity sequences;
- permissions, atomic rollback, expected-version conflicts и audit;
- запрет browser table/RPC доступа и записи в legacy archive;
- общий импорт биндов, история и timestamp conflicts.

Тесты SharedPublication дополнительно проверяют каждый из трёх справочников:
при ошибке черновик остаётся, повтор использует ту же ожидаемую версию,
успешный ответ снимает dirty/error. Существующие API tests покрывают
shared bind save, personal ownership и 409.

## Regression

- `npm run test`: PASS, 715 tests / 122 files.
- `npm run check`: PASS, прежние 61 warnings / 27 infos.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS, 2497 modules, 58 PWA entries; bundle не увеличился.
- `npm run test:visual`: PASS, 48/48, desktop и 390px; эталоны не обновлялись.
- `git diff --check`: PASS.
- Security advisors: новых WARN/ERROR нет. Прежний WARN —
  [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  Server-only RLS-without-policy INFO оставлены; allow-all policies не добавлялись.

Основное исправление уже действует в БД и не требует frontend redeploy.
Повторите «Сохранить для всех» без перезагрузки вкладки, чтобы не потерять
runtime draft. Новая диагностика API потребует обычного деплоя кода.

## Изменённые файлы

- `server/content/index.js`
- `server/content/index.test.js`
- `server/content/publication.database.test.js` — новый
- `src/components/SharedPublication.test.tsx`
- `supabase/migrations/20261009082433_normalized_content_publication_rpc.sql` — новый
- `docs/publication-regression-2026-10-09.md` — новый
