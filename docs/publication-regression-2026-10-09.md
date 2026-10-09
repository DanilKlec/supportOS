# Исправление общей публикации почт и бонусов

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
