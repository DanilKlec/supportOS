# Аудит критичных действий Admin и безопасности

Используется существующий `public.supportos_access_audit`: `actor_id`, `actor_label`, `target_id`, `action`, `before_data`, `after_data`, `created_at`. Новая таблица аудита не создаётся. `event_ref` — необязательная ссылка на событие/заявку для защиты от повторов, не credential и не токен.

Миграции: `20261007203642_critical_security_access_audit.sql` и `20261007204222_audit_registration_claim_completion.sql`. Старые события остаются нетронутыми; backfill и выдуманные исторические snapshots не выполняются.

| Действие | Событие и безопасный snapshot |
| --- | --- |
| Создание аккаунта Admin / подтверждённая Telegram-регистрация | `user.create`: до — `null`, после — ID, реальный статус и версия профиля |
| Роли пользователя, выдача доступа, отключение аккаунта | `user.update`: статусы, версии, ID ролей, эффективные permissions, признак изменения имени |
| Создание, изменение, удаление роли | `role.save` / `role.delete`: ID, версии, системность, permissions, признаки изменения названия/описания |
| Одобрение / отклонение привязки Telegram администратором | `telegram.link.approve` / `telegram.link.reject`: статус заявки, наличие привязки |
| Отключение / начало смены Telegram | `telegram.unlink` / `telegram.change`: наличие привязки до/после. Смена сначала отключает старую привязку; новая проходит существующую проверку |
| Изменение / восстановление пароля | `password.change` / `password.recovery`: состояние подтверждения; сам пароль и его hash не записываются |
| Завершение всех сессий при смене пароля | `sessions.revoke_all`: фактическое количество активных сессий до, ноль после |
| Завершение остальных сессий | `sessions.revoke_others.requested`: число других сессий перед потреблением подтверждения; `sessions.revoke_others`: проверенный результат и сохранённая текущая сессия |
| Выход из текущей сессии | `session.logout.requested`: известная активная сессия и намерение; `session.logout`: подтверждённое отсутствие сессии. Старое состояние при повторном запросе не придумывается |
| Изменение / публикация AI-знаний, правил, инструкций, глоссария | Существующие `ai.*`: версии и тип записи, без prompts и содержимого |
| Публикации общих справочников / импорт | Существующие `content.*` / `bind.*`: действующие audited RPC сохранены |

## Транзакции и границы

- RBAC, Telegram-привязка и аудит изменяются одной DB-транзакцией. Ошибка INSERT аудита откатывает изменение и потребление подтверждения.
- Создание через Accounts API передаёт только server-controlled `app_metadata.supportos_creation_request`. Новый private trigger на **публичном профиле**, вызванный существующим identity-sync, проверяет actor/session/action/target и пишет событие в транзакции Auth. Ошибка аудита откатывает создание. Последующая ошибка назначения ролей сохраняет прежний frontend contract: аккаунт остаётся pending, а событие создания уже записано.
- Telegram-регистрация подтверждается уже проверенным `verified_at` + `claimed_at`. Если срок заявки истёк во время Auth-запроса после успешного claim, реальное создание всё равно аудируется. Отсутствующий подтверждённый claim не позволяет создать аккаунт с внутренним registration marker; исходные begin/claim/finish functions сохранены.
- Password flow не переписан: audit triggers дополняют существующий completion journal. Изменение пароля, удаление сессий, security history и access audit коммитятся вместе; deferred guard сохранён.
- Auth `signOut` и PostgREST — разные транзакции. До внешнего вызова фиксируется намерение; при ошибке этой записи вызов не выполняется. Событие успеха создаётся только после проверки реального состояния `auth.sessions`. При ошибке финализации намерение остаётся, успех не подделывается. `.requested` не означает успешный отзыв.
- `supportos_login_events` сохраняет отдельную пользовательскую историю входов. Обычные login approved/rejected и жизненный цикл challenge не дублируются в access audit; действия с учётной записью и сессиями отражаются в общем аудите.
- Изменения напрямую через Supabase Dashboard или сторонний Auth API не имеют подтверждённого SupportOS actor и остаются в [Supabase Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs). Нельзя выдумывать автора таких изменений. Новых объектов в managed `auth` schema нет.

## Данные и доступ

Security/RBAC snapshots формируются по allowlist. Не копируются request body, Auth objects, пароль/hash пароля, access/refresh/confirmation tokens, permit/challenge hashes, raw IP, Telegram username, prompts, свободные имена/описания. Изменения свободных полей отмечаются только boolean-флагами. Существующие business `bind.*` события и старый архив не переписываются.

Журнал append-only: service role имеет только SELECT/INSERT; UPDATE/DELETE/TRUNCATE дополнительно запрещены triggers. RLS остаётся включённым. `anon` и `authenticated` не имеют прямого доступа. Чтение — существующий Accounts audit API с проверкой текущей сессии и `users.manage` / `roles.manage`; ограничения на просмотр `bind.*` сохранены. Новых permissions и allow-all policies нет.

## Проверки

`server/access-audit.database.test.js` использует реальные SQL-функции в PGlite: безопасные snapshots, актор и target, откат при недоступном аудите, создание аккаунта, Telegram review/unlink/change, password change/recovery, logout, AI optimistic conflict, append-only и grants.

`server/accounts/revoke-other-sessions.integration.test.js` проверяет реальный backend/SDK/RPC: подтверждённый отзыв, before/after, отсутствие credentials, отсутствие события успеха при сбое Auth, защиту от повтора и sensitive checks старых JWT. Внешние Auth/Telegram HTTP-сервисы в тестах synthetic; реальные аккаунты/сессии не изменяются.

Обе миграции применены к linked SupportOS DB. Read-only verification: 19 событий до и после, RLS включён, browser table/RPC/private reader доступ отсутствует, service UPDATE/DELETE/TRUNCATE отсутствуют. Определения существующих RBAC, critical execute, login decide, Telegram review, password claim и deferred password guard совпадают с исходными.

157 целевых tests в 21 файле и `npm run build` прошли. Security advisors после последней миграции не выявили новых WARN/ERROR. Сохранены два прежних предупреждения, не изменяемые этой задачей:

- [Authenticated SECURITY DEFINER executable](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): `public.supportos_access(text)`.
- [Leaked password protection выключена](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Позднее WARN для `supportos_access(text)` устранён отдельной миграцией: [проверка callers и server-only EXECUTE](access-helper-security.md). Два WARN выше — исторический результат применения audit migrations, а не текущий список advisors.

Backend-файлы требуется деплоить вместе: Accounts передаёт проверенный creation marker, Logout фиксирует намерение до Auth API. Деплой приложения этим изменением не выполнялся.
