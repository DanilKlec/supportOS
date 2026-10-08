# Критичные действия через существующий Telegram

Миграция: `supabase/migrations/20261007194247_telegram_critical_confirmation.sql`.
Используются прежние `TELEGRAM_BOT_TOKEN`, webhook secret и
`/api/registration?action=webhook`. Второго бота, endpoint webhook или независимого
входа нет. Login 2FA и password flow/их RPC не переписаны.

`supportos_telegram_critical_requests` — purpose-specific продолжение той же
архитектуры challenges. Оно не занимает login challenge: одобренный вход не
является разрешением на критичное действие.

## Протокол

1. Auth API проверяет JWT; actor/session_id берутся только из проверенной identity.
   Существующие Telegram gate и effective RBAC обязательны.
2. POST `/api/accounts?action=critical`, `operation: begin`, фиксирует action,
   target, SHA-256 точного JSONB payload, actor, session_id и срок 5 минут.
   Действия allowlisted: `sessions.revoke_others`, `telegram.unlink`,
   `telegram.change`, `user.update`, `role.save`, `role.delete`, `user.create`.
3. Существующий бот отправляет безопасное описание действия и цели.
   Callback token и browser execution token различны, по 32 случайных байта;
   DB хранит только их hashes. Пароли создания аккаунтов не входят в challenge.
4. Тот же secret-verified webhook принимает `critical_approve/reject` только из
   private chat, где sender = chat = Telegram текущей привязки.
5. `status/cancel` доступны только actor + session данного запроса. UI poll через
   React Query ограничен сроком и прекращается на terminal status/error.
6. После одобрения пользователь явно выполняет действие. Endpoint повторно
   проверяет actor, session, permissions, текущий Telegram, action, target,
   точный payload, expiry и execution token. Token не используется в других API.

RBAC mutation + расходование подтверждения выполняются одной транзакцией поверх
существующего `supportos_rbac_change`; optimistic version/409, Creator guards и
границы выдаваемых прав сохранены. Любая запись ролей/разрешений и disable account
через Accounts API требует подтверждения. Первичное назначение ролей при создании
аккаунта тоже требует gate, чтобы создание не стало обходом.

## Внешние операции

Завершение других сессий использует server Auth admin `signOut(verifiedJWT,
'others')`, не default/global. Permit расходуется до запроса Auth API. Даже при
ошибке провайдера повторное применение запрещено: нужен новый challenge.
Успешный `sessions_revoked` записывается только после проверки отсутствия других
live sessions в DB; текущая сессия должна оставаться живой. Гонка с новым входом
не даёт ложного сообщения об успехе.

Создание Auth аккаунта также является внешним шагом с одноразовым claim.
Существующий `changeAccess` используется только для первичного назначения после
этого gate. Он и исходный RBAC RPC остаются service-only; браузер их не вызывает.
Если первичное назначение не удалось, сохранён прежний warning/дальнейшая выдача
ролей через AccountsPanel с новым подтверждением.

Отключение/смена собственной Telegram-привязки подтверждается **старой**
привязкой. Оно отзывает Telegram proofs и возвращает в существующие link/2FA
экраны. Новую привязку подтверждают Telegram + администратор прежним механизмом.
`telegram_unlinked_at` и узкий trigger предотвращают автоматический повторный
импорт отключённой привязки из завершённой legacy registration. Legacy archive
не удаляется. Отключение привязки не отключает обязательную 2FA и не является
способом восстановления доступа без старого Telegram.

## Доступ и данные

- Requests: RLS включён; anon/authenticated не имеют table/RPC grants; service
  имеет только SELECT/INSERT/UPDATE. Browser proof только в памяти, не storage.
- Единственное новое SEC DEFINER исключение — private boolean-reader наличия
  других сессий. Фиксированный search_path, только service EXECUTE, без выдачи
  строк/токенов/IP или direct grants на `auth.sessions`.
- Нет raw IP, passwords, access/refresh tokens в challenge storage или bot
  message. Security metadata использует существующий HMAC IP + parsed browser/OS.
- Login/password callbacks и RPC не менялись; critical callbacks просто
  маршрутизируются через существующий webhook.
- Это защита authenticated application API, не защита от владельца DB или
  компрометации service-role credential. Out-of-band Dashboard writes не
  подтверждаются этим приложением.

## Проверки

PGlite tests используют synthetic users/sessions: подмена actor/session/action/
target/payload/permit, expiry, reject/cancel, replay, отзыв прав/сессии/Telegram,
RBAC/409 rollback, disable, role mutation, `others` completion и запрет legacy
relink. Unit/UI tests покрывают общий webhook, fail-closed delivery/Auth failures,
отсутствие password в generic request, explicit execute и сохранение payload.
Живые пользовательские сессии/привязки/роли при проверке не изменяются.

Проверено 2026-10-07: миграция применена к связанному SupportOS-проекту;
requests_created=0, RLS=true, browser grants отсутствуют. Fingerprints существующих
login/password guard functions до/после совпали. 100 целевых tests и build прошли.
Полный test run выявил один прежний failure в
`src/features/operations/workspace.test.tsx` (ожидание скрытого «Проекты»);
`tsc --noEmit` сохраняет 10 ранее существовавших ошибок.

Security advisors: 0 новых WARN/ERROR, прежние WARN без изменений:
[authenticated SECURITY DEFINER — supportos_access](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
и [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
RLS/no-policy INFO: 24 → 25, новое относится к намеренно server-only requests;
allow-all policies не добавлялись.

Auth scope `others` сверено с
[актуальной Supabase reference](https://supabase.com/docs/reference/javascript/auth-signout).

## «Завершить все остальные сессии»: integration regression

Кнопка в «Настройки → Безопасность → Активные сессии» вызывает только SupportOS
backend. UI не вызывает `supabase.auth.signOut({scope: 'others'})`. Новый challenge
создаётся при каждом запросе; одобренный login 2FA, pending/rejected/expired
critical proof или proof уже выполненного действия не подходят.

`server/accounts/revoke-other-sessions.integration.test.js` запускает настоящие
Accounts/registration/Binds/AI handlers, requireIdentity/requireUser, существующий
Telegram webhook, RBAC и critical/session RPC на PGlite. Выполнение RPC идёт с
реальными service-role grants, не от DB owner. Внешние Auth/Telegram/PostgREST
HTTP endpoints — synthetic transport; SDK `admin.signOut` не замокан. Тесты не
являются live E2E с production Supabase/Telegram и не меняют настоящие сессии.

Ключевой сценарий намеренно сохраняет валидность подписи/expiry старого JWT и
старый approved login challenge после Auth revocation. Sensitive checks обязаны
отказать по отсутствующему `auth.sessions.id`, а не ждать JWT expiry. Оба старых
JWT получают 401 на Accounts context/session/history/critical action, Binds и
Composer AI/status; body/query `session_id` не обходят проверку. Текущий JWT
продолжает работать; другой пользователь не затрагивается.

Дополнительные сценарии: свежий proof для повторной revocation после нового входа,
отказ от replay/expiry/wrong actor/session/action/Telegram sender, подмена signed
session claim, Auth 5xx/no-op, отсутствие ложного success event. Backend отвечает
успехом только после подтверждения DB: другие live sessions отсутствуют, текущая
ещё жива. При внешней ошибке permit уже израсходован, нужен новый challenge.

После добавления integration regression: 10 integration cases и 118 целевых
tests в 18 файлах прошли; `npm run build` завершился успешно. Read-only проверка
linked DB подтвердила live-session guards, проверку current/others на completion,
RLS и отсутствие browser EXECUTE grants. Новая schema migration не требуется.

Область гарантии — action и sensitive APIs SupportOS. Сам публичный logout API
Supabase Auth не получает Telegram-проверку от этой интеграции; его стандартный
протокол не изменялся. Приложение не использует его напрямую для `others`.

Требование проверки `session_id` после sign-out соответствует
[Supabase session security](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out).
