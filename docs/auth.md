# Supabase Auth и доступ руководителей

Приложение подключено локально к проекту `exijfprfwmyplggayrpt`. Все страницы, кроме `/login`, требуют Supabase-сессию. Временный frontend-пароль больше не используется. Возврат после входа разрешён только на внутренний адрес. SDK сохраняет сессию, обновляет токен и синхронизирует выход между вкладками.

## Окружение

```env
VITE_SUPABASE_URL=https://exijfprfwmyplggayrpt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Эти две публичные переменные должны быть доступны при сборке и серверным API. Сервер также поддерживает `SUPABASE_URL` и `SUPABASE_PUBLISHABLE_KEY`. Ключ `SUPABASE_SERVICE_ROLE_KEY` нужен только серверной части мониторинга; никогда не добавляйте его в `VITE_`.

## Личные аккаунты

Создайте реальные аккаунты через Supabase Dashboard → Authentication → Users → Add user с согласованными адресами и паролями. Укажите Site URL и разрешённые redirect URL для вашего домена, а для локальной разработки — `http://localhost:3000/login`. Самостоятельная регистрация в интерфейсе приложения не предлагается. Если приложение должно быть закрытым, отключите регистрацию новых пользователей в настройках Auth проекта.

Роль мониторинга назначается администратором через доверенный Supabase SQL Editor для конкретного существующего UUID:

```sql
-- Замените UUID на ID согласованного руководителя. Не используйте массовый UPDATE.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"role":"supervisor"}'::jsonb
where id = 'REPLACE_WITH_EXISTING_USER_UUID'::uuid;
```

Для снятия роли удалите ключ `role` из `raw_app_meta_data` того же пользователя. `admin` также допускается в мониторинг; `supervisor` не даёт административных прав базе знаний. Сервер запрашивает `/auth/v1/user` для каждого обращения и использует только возвращённый `app_metadata.role`. Он не доверяет `user_metadata`, frontend store, роли из тела запроса или старому cookie мониторинга. В аудит назначений записывается проверенный UUID руководителя. После изменения роли обновите страницу.

## API и данные

### Активные сессии

`Настройки → Безопасность → Активные сессии` использует только
`GET /api/accounts?action=sessions`. Сервер проверяет пользователя через Auth,
Telegram 2FA и действующий доступ `work`; `subject` и `sid` берёт исключительно
из проверенной личности и JWT `session_id`, а не из параметров браузера.

На 07.10.2026 проверены актуальный [Supabase Auth API и описание сессий](https://supabase.com/docs/guides/auth/sessions),
исходный код GoTrue и `information_schema.columns` подключённого проекта.
В Auth Admin API нет метода списка сессий. Используется новая миграция
`20261007184859_active_user_sessions.sql`: закрытый SECURITY DEFINER helper
в `supportos_private` и SECURITY INVOKER RPC в `public`. Это узкое исключение
для чтения метаданных `auth.sessions`; прямые права на Auth-таблицы не добавляются,
Supabase-managed объекты не изменяются. Обе функции доступны только `service_role`.
Helper повторно проверяет принадлежность текущего `sid` указанному пользователю
и `not_after`, затем выбирает только его сессии без истёкшего `not_after`.

Ответ содержит только `id`, `created_at`, `updated_at`, `refreshed_at`,
`user_agent` (если есть) и `is_current`. Access/refresh tokens, HMAC keys,
IP и данные других пользователей не возвращаются. API использует
`private, no-store`; React Query хранит только метаданные в памяти с ключом
пользователя и сессии, без persistence. Страница поддерживает ручное обновление
и обновление при возвращении в окно.

`refreshed_at` в проверенной схеме — timestamp без timezone, который GoTrue
записывает в UTC; RPC явно преобразует его в timestamptz. Это обновление
авторизации, а не heartbeat активности SupportOS. Ограничения времени жизни,
неактивности и single-session Supabase применяет при refresh, а очистку
истёкших строк выполняет позднее: список отражает доступные записи Auth,
не выдумывает отдельную телеметрию и не обещает непрерывную online-активность.

Миграция применена в подключённом проекте. Проверено: `anon`/`authenticated`
не могут читать `auth.sessions` или выполнять новые функции; `service_role`
может вызывать RPC/helper, но не получает прямой SELECT на `auth.sessions`.
Неверная личность возвращает только `invalid_session`.
После миграции security advisors не добавили замечаний. Сохранились 23 INFO
для намеренно server-only таблиц и два прежних WARN:
[исполнение `supportos_access` пользователями](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
и [отключённая защита от скомпрометированных паролей](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

API AI, переводчика, Google Sheets и спорта требуют Bearer-токен, проверяемый через Supabase. Мониторинг дополнительно требует роль `supervisor` или `admin`. Webhook и внешний сборщик используют отдельные серверные секреты. Browser fetch передаёт токен только API того же origin, не сторонним переводчикам или Google.

### История безопасности

`supportos_login_events` — новый append-only журнал. RLS включён, у `anon` и
`authenticated` нет прямых прав на таблицу/RPC. `service_role` имеет только
SELECT/INSERT; UPDATE/DELETE/TRUNCATE дополнительно запрещены триггерами,
в том числе для обычного SQL владельца таблицы. Это защита от изменения через
приложение, не криптографическая защита от администратора БД, способного отключить триггеры.
Связи с Auth не каскадные: UUID пользователя/сессии остаются в журнале после
их удаления. Новых объектов или триггеров в managed-схеме `auth` не создаётся.

Сохраняются UUID пользователя/сессии, тип события, серверное время, HMAC-SHA256
IP, фиксированные названия браузера/ОС и результат Telegram, если он применим.
Внутренний `event_ref` обеспечивает идемпотентность, не содержит credential
и не возвращается клиенту. Raw IP, user-agent, пароль, callback tokens,
access/refresh tokens и Telegram ID в журнал не копируются.
Для IP используется существующий серверный `TELEGRAM_WEBHOOK_SECRET`:
на Vercel — только platform-overwritten `x-vercel-forwarded-for`, иначе socket IP;
произвольный `x-forwarded-for` не принимается. Неизвестный IP — NULL,
а временный нулевой bucket для password rate limit в журнал не попадает.
Смена секретного ключа меняет будущие отпечатки. Браузер/ОС — данные из UA,
не доказательство устройства или личности.

- `login_approved`/`login_rejected`: триггер на переходе Telegram challenge
  из `pending` в итоговый статус. Решение бота и событие коммитятся вместе;
  повторный callback не добавляет запись. Отмена/ошибка доставки имеет
  `telegram_result=not_confirmed`, а не выдуманное отклонение в Telegram.
  Выход из уже подтверждённой сессии не записывается как отклонённый вход.
- `password_changed` + `sessions_revoked`: при `processing → completed` в
  существующей транзакции Auth password guard. При ошибке изменения пароля
  оба события откатываются. Для recovery session_id может отсутствовать.
- Обычный выход: `POST /api/registration?action=logout`, проверка личности без
  требования 2FA/work (выход доступен pending/disabled аккаунтам), затем
  [Auth Admin signOut с scope local](https://supabase.com/docs/reference/javascript/auth-admin-signout).
  RPC подтверждает, что сессия больше не live, записывает единственное событие,
  и закрывает Telegram proof. SDK затем очищает локальную сессию. Неверный
  или просроченный токен не мешает локальной очистке; при сбое server/Auth/DB
  клиент не обходит журнал молча. Повтор после успешного отзыва идемпотентен.

`GET /api/accounts?action=login-history[&target=UUID][&before=ID]` возвращает
только разрешённую историю по 50 событий с cursor pagination и индексом
`(user_id,id desc)`. Своя история требует `work` либо `users.manage`;
чужая — только действующий `users.manage`, не название роли. Auth, 2FA и RBAC
проверяются сервером и повторно в RPC. Ответ — явный allowlist метаданных,
`private, no-store`; React Query использует только память и ключ пользователя,
сессии и выбранного target. В интерфейсе: Настройки → Безопасность → История
входов; администратор — кнопка «История входов» в реестре пользователей.

Журнал начинается после применения миграции и развёртывания нового сервера.
Миграция `20261007191041_login_security_history.sql` применена в подключённом
проекте. Реальные grants проверены: только server SELECT/INSERT и EXECUTE RPC,
без UPDATE/DELETE/TRUNCATE и изменения sequence; RLS и запретительные триггеры
включены. Запрос истории без действительной сессии возвращает `invalid_session`.
Advisors: 24 ожидаемых [INFO RLS без browser policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
и два прежних WARN, описанных выше; новых WARN/ERROR не появилось.
Старые события не выдумываются и не backfill-ятся. Неудачный ввод пароля до
Telegram challenge и действия напрямую в Supabase Dashboard/вне SupportOS
в этот журнал не входят; это не замена полному Supabase Auth audit log.

Таблицы мониторинга закрыты для `anon` и `authenticated`, RLS включён. Доступ и исполнение RPC разрешены только серверному `service_role`. Пять сообщений advisors `RLS Enabled No Policy` имеют уровень INFO и ожидаемы: браузерных политик доступа здесь намеренно нет. [Описание проверки Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

База знаний загружается и сохраняется через server API в базе данных. Схема `supabase/schema.sql` не применялась в рамках настройки мониторинга.

## Проверено и что осталось

- Миграция `supportos_agent_monitor` применена в Supabase; RLS и права таблиц/RPC проверены. Контрольная запись события, назначения и расчёт смен проверены в транзакции с rollback.
- Локальные тесты покрывают защищённый loader, безопасный redirect, серверные 401/403, подделку роли, аудит, webhook, расчёт смен и интерфейс.
- Реальные аккаунты не создавались и роли не назначались. Вход с реальными пользовательскими данными ещё не проверен.
- LiveChat credentials, серверный service key, регистрация webhook, внешний сборщик и deployment остаются шагами активации; см. [мониторинг](agent-monitor.md).
- Общая проверка TypeScript выявляет существующие ошибки вне новой авторизации: импорт бонусов, ModalRoot, CommandPalette, TreeNode и ToolsMenu. Производственная сборка Vite проходит.
