# supportos_access: server-only EXECUTE

Миграция `20261007205438_restrict_access_helper_execute.sql` отменяет прежнее исключение authenticated EXECUTE. `PUBLIC`, `anon`, `authenticated` больше не могут вызывать `public.supportos_access(text)`, в том числе через Data API. `service_role` сохраняет EXECUTE для совместимости. Тело функции, SECURITY DEFINER, фиксированный пустой search_path, RBAC assignments и RLS policies не меняются.

## Инвентаризация callers

Проверены все ссылки `supportos_access` в репозитории, определения routines и зависимости `pg_depend` живой SupportOS DB.

| Caller | Использование |
| --- | --- |
| Frontend / server runtime | Прямых RPC-вызовов нет |
| `supportos_categories`, `supportos_folders`, `supportos_binds` | По 4 legacy policies `content_read/insert/update/delete` — 12 уникальных policies |
| `supportos_bind_feedback` | Legacy `feedback_read` |
| `supportos_knowledge_gaps` | Legacy `gaps_read` |
| Другие DB routines / views / triggers | Зависимых объектов или вызовов из routine body не найдено |
| `server/rbac-database.test.js` | Исторический тест прежнего bootstrap; не production caller |
| `schema.sql`, `access-control.sql`, `rbac.sql`, старые migrations | Исторические определения и grants, не текущий runtime API |

Все пять таблиц имеют RLS, без table/column CRUD grants для `anon` и `authenticated`. Это проверено через `has_table_privilege` и `has_any_column_privilege`, включая унаследованный PUBLIC-доступ. Policies с `TO authenticated` не выполняются в текущем server-only workflow. Сервер работает с service-role/BYPASSRLS **после** проверки пользовательской сессии и свежих DB permissions.

Реальный RBAC путь сохранён: `requireUser` проверяет Supabase identity и Telegram/session guard → `loadAccess` вызывает server-only `supportos_rbac_context(subject)` → server handlers проверяют permissions → audited mutation RPC. Функция `supportos_access` в этом пути не участвует. Browser/JWT metadata не становятся источником прав.

## Миграция и безопасность

- Перед REVOKE миграция проверяет grants всех таблиц, policies которых зависят от helper. При browser table/column grants останавливается с понятной ошибкой: требуется отдельный анализ фактически используемого RLS caller.
- Роли, permissions, маршруты, данные, RPC signatures и helper body не переписываются. Новых allow-all policies или browser table grants нет.
- При случайном будущем SELECT grant на legacy-таблицу запрос остаётся fail-closed из-за отсутствующего helper EXECUTE. Это не рабочий способ вернуть browser CRUD: потребуется явная смена модели доступа и безопасный RLS-compatible helper.
- Старые применённые migrations не редактируются. Не запускать legacy bootstrap SQL поверх действующих migrations: он восстанавливает старые grants/policies. Новая установка должна применять последовательность migrations, включая server-only grants и эту миграцию.

## Проверки

`server/access-helper.database.test.js`: реальные PostgreSQL SQL/ACL/RLS в PGlite, 15 cases. Проверяются PUBLIC/inherited access, anon/authenticated прямой RPC, настоящий Creator subject и forged JWT metadata, запрет прямого изменения ролей/статуса, свежий DB RBAC и read/write aliases, server-role изменения с аудитом, 409 optimistic conflict, отсутствие повышения до Creator/technical, случайный SELECT grant и preflight для table/column/PUBLIC grant drift. Определения helper/context/change до и после совпадают.

`server/accounts/revoke-other-sessions.integration.test.js` теперь загружает актуальные server-only grants и helper migration: существующие Accounts/Binds/AI APIs, current/old JWT sensitive guards и critical confirmation проверяются с закрытым browser EXECUTE.

## Результат применения

Миграция применена к linked SupportOS DB. Реальные попытки вызова в read-only transaction под `anon` и `authenticated` получили именно `permission denied for function supportos_access`. Проверено: PUBLIC grant отсутствует, service-role EXECUTE сохранён, browser-callable public SupportOS SECURITY DEFINER functions отсутствуют. Все 14 policies, определения helper/context/change и количества role assignments/permission links/audit events остались неизменными.

91 целевой test и `npm run build` прошли. Повторный Supabase security advisor больше не сообщает [0029_authenticated_security_definer_function_executable](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable). Остался только прежний WARN: [Leaked password protection выключена](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Настройки Auth этой задачей не менялись; INFO для намеренно server-only RLS tables не скрывались allow-all policies.
