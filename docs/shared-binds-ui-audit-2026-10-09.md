# Общие бинды и проверка интерфейса — 09.10.2026

## Результат

Общие оригиналы отображаются в одной ветке «Общие», внутри которой сохранены
существующие разделы и вложенные папки. Это группировка интерфейса, а не массовое
перемещение записей в один раздел базы данных. Личные версии остаются отдельными.

При создании и редактировании общего бинда можно выбрать общий раздел, папку
этого раздела и цвет. Изменение раздела сбрасывает прежнюю папку. Публикация
требует предварительного просмотра и отдельного подтверждения.

Цвет дерева наследуется в порядке: собственный цвет бинда → ближайшая папка →
раздел. Наследование не перезаписывает данные бинда. Можно убрать собственный
цвет кнопкой «Использовать цвет папки». Вложенные папки показываются полным путём.

Сервер проверяет принадлежность папки общему разделу и формат цвета. Личные
разделы/папки нельзя назначить общему оригиналу. Сохранены knowledge.write,
проверка сессии и атомарная проверка updated_at с конфликтом 409. Старые callers,
которые не передают расположение/цвет, не сбрасывают существующие значения.

Общий оригинал в Zustand runtime cache больше не считается личной веткой.
Без личной версии он открывается как «Общая». Существующая личная версия и
явно сохранённый выбор ветки продолжают учитываться.

## Другие исправления интерфейса

- Мобильная панель папок получила непрозрачный фон из существующего токена.
- В быстром калькуляторе убраны действия создания/редактирования; управление
  осталось в существующем management workflow. Копирование и поиск сохранены.
- Поля тона и темы Помощника расширены внутри узкой панели, без изменения
  AI/translation logic, значений полей и оформления.
- Спортивные фильтры переносятся на строки вместо ухода за край экрана.
- Локализованы оставшиеся английские сообщения обычного редактора бинда и
  уведомления перемещения/сортировки дерева. Языковые коды и данные не переведены.
- Новые элементы используют существующие UI-kit/classes/tokens. Глобальное
  overflow-x:hidden и новый слой !important не добавлялись.

## Проверки

| Проверка | Результат |
| --- | --- |
| npm run check | PASS; 61 существующий warning, 27 info, 0 errors |
| npx tsc --noEmit | PASS |
| npm run test | 744/744; 124 файлов |
| npm run test:visual | 50/50; desktop 1440×900 и mobile 390×844 |
| npm run build | PASS; 2498 modules, 57 PWA entries |
| git diff --check | PASS |

Responsive suite проверяет 40 экранов в светлой/тёмной темах на обоих размерах:
workspace и открытый бинд; основные QC-разделы и Materials workflows;
почты, бонусы, калькулятор; пять разделов Settings; Assistant;
Admin overview/users drawer/roles/audit/integrations/AI;
избранное, недавние, архив, импорт; спорт, LiveChat;
активность команды, мониторинг, график и список биндов раздела.
Также проверены детали очереди QC, footer drawer и controlled overflow таблиц.
Scroll-тесты доходят до последних записей справочников для Support и admin.

Новый браузерный тест проверяет выбор раздела/папки/цвета, двухэтапную публикацию,
единственное появление нового бинда в ветке «Общие», цвет и открытие общей версии.
POST перехватывается строго в локальном синтетическом контуре и не достигает БД.
Автоматический sync мониторинга также замокан только локально; LiveChat не вызывается.
Остальные неизвестные запросы и записи запрещены fixture. Production auth не обходится.

Эталонные снимки обновлены только для изменившихся workspace/sidebar/branch и
настроек Composer после визуального просмотра. Пороги сравнения не ослаблялись;
снимки Admin, QC, Settings и user drawer не заменялись.

Первый полный прогон обнаружил два устаревших английских locator в ModalRoot tests
и форматирование новых assertions. Исправлены labels в tests и форматирование;
проверки payload, черновиков и конфликтов не удалялись и не ослаблялись.

## Проверка опубликованного preview

Read-only smoke выполнен в уже авторизованном браузере на
support-2aiqxcllp-afda.vercel.app: workspace, почты, бонусы, калькулятор,
QC/Materials, Admin/users drawer, Settings/security и Assistant.
Основные экраны проверены на desktop/mobile. Активные сессии и история входов
загружаются; drawer имеет одинаковые кнопки 40px; бонусный контейнер прокручивается.
Page-level horizontal overflow в проверенных основных экранах не обнаружен.

Preview содержит прежний опубликованный код: новые исправления проверены локально,
а не объявляются уже работающими в Vercel. Для них нужен redeploy frontend и API.
Пароли, роли, Telegram-привязки, бизнес-данные и сессии при smoke не изменялись.
Внешние AI/LiveChat/Google Sheets запросы с реальными пользовательскими данными
не выполнялись. Исчерпывающая проверка всех комбинаций permissions и внешних
интеграций этим проходом не заявляется.

## Данные и оставшиеся замечания

Read-only проверка БД: 112 общих неархивных биндов, 54 уже имеют папку,
10 общих разделов и 19 папок; собственные цвета общих биндов не заполнены.
Массовый backfill цветов не нужен: наследование работает в интерфейсе.
Данные и схема Supabase в этом проходе не изменялись.

Три legacy-папки имеют пустой category_id. Они не назначены разделам автоматически:
расположение нельзя угадывать. В project catalog видны legacy-коды рядом с полными
названиями; объединять IDs без отдельного однозначного mapping небезопасно.

Вердикт: основной дизайн сохранять. В первую очередь полезны исправления
предсказуемости веток, читаемости controls и доступности прокрутки — они выполнены.
Следующие отдельные задачи: контролируемое сопоставление legacy project aliases и
папок; профилирование начального bundle (858.22 kB / gzip 254.24 kB). Тяжёлые
management chunks по-прежнему не загружаются на главной — это подтверждено tests.
Переписывание дизайна, автоматическое слияние данных и массовый lint/type cleanup
не выполнялись.

## Файлы этого прохода

Production:

- server/binds/index.js
- src/entities/knowledge/tree.ts
- src/features/shared-binds/shared-tree.ts
- src/features/shared-binds/WorkspaceSharedBinds.tsx
- src/features/shared-binds/SharedBindEditor.tsx
- src/features/shared-binds/bind-drafts.ts
- src/services/shared-binds.service.ts
- src/widgets/Sidebar/Sidebar.tsx
- src/widgets/Sidebar/TreeNode.tsx
- src/shared/modals/BindFormModal.tsx
- src/shared/modals/ModalFormHelpers.tsx
- src/layouts/MainLayout/MainLayout.tsx
- src/features/bonuses/BonusToolsPage.tsx
- src/features/spaces/AssistantSettingsPanel.tsx
- src/features/sports-betting/SportsBettingPage.tsx

Tests и отчёт:

- server/binds/index.test.js
- src/services/shared-binds.service.test.ts
- src/features/shared-binds/SharedBindsPage.test.tsx
- src/features/shared-binds/SharedBindEditor.test.tsx
- src/features/shared-binds/shared-tree.test.ts
- src/widgets/Workspace/knowledge-crud.test.tsx
- src/shared/modals/ModalRoot.test.tsx
- tests/visual/shared-binds.visual.ts
- tests/visual/layout.visual.ts
- tests/visual/reference-scroll.visual.ts
- tests/visual/responsive.visual.ts
- tests/visual/__screenshots__/desktop/win32/{workspace,workspace-bind,composer,composer-actions}.png
- tests/visual/__screenshots__/mobile/win32/{workspace-sidebar,workspace-bind,composer,composer-actions}.png
- docs/shared-binds-ui-audit-2026-10-09.md

Уже имевшиеся правки предыдущего исправления публикации почт/бонусов сохранены
отдельно и не относятся к этому проходу: docs/publication-regression-2026-10-09.md,
server/content/database.test.js, server/content/publication.database.test.js,
supabase/migrations/20261009085144_safe_normalized_content_publication.sql.
Commit, push и deployment в этом проходе не выполнялись.
