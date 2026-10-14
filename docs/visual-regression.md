# Screenshot regression

Playwright проверяет production-сборку SupportOS в Chromium. Baselines находятся
в `tests/visual/__screenshots__`; их нужно включать в Git вместе с тестами.

## Запуск

```sh
npm ci
npx playwright install chromium
npm run test:visual
npm run test:visual:report
```

В CI используются те же команды, без секретов Supabase/Telegram/AI. Требуются Node
20+ и свободный `127.0.0.1:4173`. Проверено на Node 24.13.1 / Windows / Playwright
1.64.0. Обычный запуск **никогда не создаёт и не обновляет** отсутствующие эталоны.

После намеренного изменения layout:

```sh
npm run test:visual:update
```

Просмотрите PNG/diff в отчёте перед принятием обновлённых эталонов. Не обновляйте
baselines автоматически при падении теста. Playwright закреплён точной версией в
lockfile; существующие зависимости не обновлены.

## Покрытие

Оба viewport: **1440×900** и **390×844**, device scale factor 1.

- `/`: shell, header, sidebar и открытый бинд с toolbar; дополнительно открытый
  sidebar на mobile.
- `/admin#users`: navigation, registry, toolbar; отдельный кадр всего toolbar.
- User drawer активного и ожидающего сотрудника: header, поля/роли и footer
  после внутреннего scroll (включая «Подтвердить и выдать роли»).
- `/qc#materials`: navigation, material tabs/select и toolbar.
- `/settings`: header, section navigation, стандартные controls.
- `/#composer-answer`: открытый SupportComposer, настройки и кадр действий после
  внутреннего scroll. Генерация/provider не вызываются.

Используются короткие синтетические данные, фиксированные дата, locale, timezone
и UI preferences. Снимки ждут загрузки конкретных элементов и шрифтов, отключают
анимации/caret и убирают hover. Headers, sidebar, toolbars и controls не маскируются;
реальные business records и динамическая telemetry вообще не загружаются.
Дополнительно проверяется отсутствие horizontal overflow у page containers.
Внутренний controlled table overflow разрешён. Ошибки JavaScript не принимаются
как новый baseline.

Baseline фиксирует текущий UI, а не подтверждает отсутствие старых визуальных
дефектов. Например, header Composer сейчас слишком тесный: заголовок сокращается,
а соседние действия сближаются. Это оставлено видимым в PNG; production layout
в задаче добавления regression tests не исправлялся.

## Изоляция auth и данных

`tests/visual/server.mjs` создаёт отдельную сборку в `test-results/visual-app`, не
читает `.env`, принудительно заменяет публичные Supabase параметры фиктивными и
слушает только loopback. Vite preview не запускает dev backend middleware;
любые `/api/` запросы вне browser mock получают 403. Уже запущенный сервер не
переиспользуется. Production `src/`, auth/RBAC/backend не изменяются.

Fixture устанавливает синтетическую SDK session, **не** подменяет Zustand auth
или permissions. Приложение по-прежнему выполняет `getUser` и server access check.
Mock возвращает session/access исключительно в изолированном browser context.
JWT имеет заведомо недействительную подпись, refresh token и public key — фиктивные.
Никаких реальных аккаунтов, service-role keys или сохранённых production sessions.

Все browser requests перехватываются: разрешены только assets локального preview
и явный список GET mock endpoints с ожидаемым тестовым Bearer. Неизвестные API,
любые записи, внешние запросы и WebSockets блокируются и проваливают тест. PWA
service workers отключены, чтобы не обходить перехват. Список блокировок не
содержит headers/payloads/tokens; trace содержит только синтетические тестовые
данные. Каждый тест получает новый browser context.

Отрицательные tests проверяют login guard без session, отказ при недействительной
SDK session, закрытый Admin без `users.manage` и Composer без `composer.use`.
Это проверки UI guards, **не** замена integration/security tests реального API.

## Платформы и артефакты

Первичные эталоны сняты на **Windows (`win32`)**. Снимки разделены по платформе и
viewport, поскольку [рендеринг зависит от OS, browser и fonts](https://playwright.dev/docs/test-snapshots).
Для Linux/macOS нужно отдельно сформировать, просмотреть и добавить соответствующие
эталоны. Не сравнивайте Linux-runner с Windows PNG и не включайте автоматическое
обновление в CI. Используйте одинаковую ОС, версии browser и набор шрифтов при
проверке одного набора baselines.

Diff, actual PNG, trace и HTML report сохраняются в `test-results/visual` и
`playwright-report` и исключены из Git. В CI их можно сохранять при падении для
ручного анализа. Файлы `*.visual.ts` намеренно не соответствуют Vitest discovery.
