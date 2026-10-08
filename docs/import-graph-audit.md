# Аудит import graph

Дата: 2026-10-08. Чистка только согласованных кандидатов, без изменения поведения.

## Граф и воспроизведение

- До удаления: 457 узлов, 1357 внутренних связей.
- После удаления: 442 узла, 1344 внутренних связей.
- Unresolved internal imports: 0. Computed imports/requires/globs: 0.
- Полный граф: `docs/import-graph.json`.
- Read-only scanner: `node scripts/import-graph.mjs` (полный JSON), `--summary` (аудит кандидатов), `--compact` (формат сохранённого графа).

Scanner использует AST установленного TypeScript и tsconfig resolution, учитывает aliases `@/` и `#/`, статические/dynamic imports, require, type imports, re-exports, import types, vi/jest references, triple-slash references, import.meta.glob и HTML entry. Для JS imports дополнительно учитывается runtime .js рядом с .d.ts. Внешние зависимости node_modules не входят в граф. Узлы — исходные модули, HTML entry и импортируемые ресурсы; неимпортируемые bundled JSON проверены отдельно как кандидаты, но не добавлены как source-модули.

В compact JSON `nodeFields`/`edgeFields` описывают массивы. Индексы source/target каждой связи ссылаются на `nodes`; например `nodes[edge[0]][0]` — исходный файл.

Счётчики production/test/tooling imports включают входящие связи **даже из недостижимых модулей**, чтобы недостижимость не была ошибочно принята за разрешение удалить файл. Type-only import тоже блокирует удаление. Re-exports не игнорируются.

## Route generation и действующий layout

`tsr.config.json` использует стандартные `src/routes` и `src/routeTree.gen.ts`; эти файлы защищены независимо от счётчиков imports. Сохранён действующий `src/router.tsx`: его импортирует `src/app/App.tsx`, который используется entry `src/main.tsx`. Удалён только пустой, неимпортируемый `src/app/router.tsx`.

`src/routes/__root.tsx` импортирует `src/layouts/MainLayout/MainLayout.tsx`. Этот layout использует актуальный `src/widgets/Sidebar`, а не legacy `src/layouts/MainLayout/Sidebar.tsx`. Действующие MainLayout и widgets/Sidebar/Workspace сохранены.

## Удалённые файлы

Удаление выполнено в два этапа с повторным построением графа. Во всех случаях непосредственно перед удалением: production/test/tooling imports = **0 / 0 / 0**, route generation = **false**.

| Файл | Входящие до чистки | На момент удаления: prod / test / tooling | Основание |
| --- | ---: | --- | --- |
| `src/app/providers.tsx` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/app/router.tsx` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/entities/bind/mock.ts` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/entities/category/mock.ts` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/entities/folder/mock.ts` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/entities/knowledge/mock/index.ts` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/features/ai/translator/translator.service.ts` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/layouts/MainLayout/Sidebar.tsx` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/layouts/MainLayout/Workspace.tsx` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/services/ai-future.service.ts` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/shared/lib/seed.ts` | 0 | 0 / 0 / 0 | Ноль входящих связей до чистки. |
| `src/store/bind.store.ts` | 1 | 0 / 0 / 0 | После удаления неиспользуемого re-export; 41 named consumer barrel, без useBindStore/namespace/dynamic consumers. |
| `src/entities/knowledge/mock/binds.ts` | 1 | 0 / 0 / 0 | После удаления неиспользуемого mock/index.ts. |
| `src/entities/knowledge/mock/categories.ts` | 1 | 0 / 0 / 0 | После удаления неиспользуемого mock/index.ts. |
| `src/entities/knowledge/mock/folders.ts` | 1 | 0 / 0 / 0 | После удаления неиспользуемого mock/index.ts. |

Всего удалено 15 tracked файлов; исходные версии доступны в Git. Целиком директории не удалялись.

## Barrels

Из `src/store/index.ts` удалена только строка `export * from "./bind.store";`. Все 41 consumer barrel имеют явные named imports; useBindStore среди них отсутствует. Namespace/side-effect/default/dynamic consumers этого barrel не найдены. После удаления re-export граф повторно подтвердил ноль imports bind.store перед удалением самого файла. Остальные пользовательские изменения barrel сохранены.

Неиспользуемый `src/entities/knowledge/mock/index.ts` удалён первым. Только после повторного аудита удалены binds/categories/folders mock modules. Dangling re-exports не осталось.

## Сохранённые кандидаты

| Файл | Входящие imports после чистки | Причина |
| --- | ---: | --- |
| `src/layouts/MainLayout/MainLayout.tsx` | 1 | Используется root route; production-reachable. |
| `src/types/bind.ts` | 4 | Type imports из BindEditor.tsx, useTheme.ts, shared/lib/db.ts и shared/lib/languages.ts. Эти consumers не мигрировались и не удалялись в данной задаче. |
| `src/entities/knowledge/mock/defaultKnowledge.json` | 0 | Bundled business archive: отдельные DB backfill/count verification и отсутствие backend fallback в этой задаче не проверялись. |
| `src/entities/bonus/mock/defaultDepositBonuses.json` | 0 | То же ограничение удаления bundled business data. |
| `src/entities/project-email/mock/defaultProjectEmails.json` | 0 | То же ограничение удаления bundled business data. |

Нулевой import count для JSON не отменяет ранее заданные условия DB-first verification. Данные БД и legacy archives не изменены.

## Проверки

| Команда | Результат |
| --- | --- |
| `npm run check` | Exit 1: 120 errors, 77 warnings, 28 infos. До удаления были те же количества (354 checked files), после удаления — 339 checked files. Несвязанные style/lint ошибки не исправлялись. |
| `npm test` | 543 passed / 544 total. Единственное прежнее падение: `src/features/operations/workspace.test.tsx:101`, ожидание «Проекты» после redirect к «Интеграции». |
| `npm run build` | Exit 0. |
| `npm run generate-routes` | Exit 0; routeTree.gen.ts без Git diff. |
| Повторный import graph | Ноль unresolved/computed references и dangling internal imports. |
