# Initial bundle и загрузка крупных экранов

Аудит 2026-10-08; Vite 8.0.16, одинаковые production settings до/после.
Новые зависимости и `manualChunks` не добавлены. Query defaults, API, RBAC,
данные и CSS не менялись.

## Что найдено и изменено

- Route-level automatic splitting Admin/QC уже работал. Не добавлен второй
  route loader: проблема была в eager imports **внутри** экранов.
- `AdminWorkspace`: AccountsPanel загружается только для пользователей,
  ролей/аудита. Небольшие PlatformPages остаются одной группой с Admin shell.
- `QCWorkspace`: AIControlCenter, SharedBindsPage, ProjectEmailsPage,
  DepositBonusesPage — отдельные lazy workflows. Связанные QualityPages
  оставлены вместе с QC overview/review, без дробления карточек/строк.
- `ReferencePage`: выбирает только одну lazy страницу — бонусы, калькулятор
  или почты; открытие почт больше не загружает оба бонусных экрана.
- Workspace и Topbar импортировали общий редактор из `SharedBindsPage`,
  подтягивая всю QC-страницу в entry. Редактор на 429 строк **перенесён**,
  без переписывания тела, в `SharedBindEditor.tsx`; оба callers импортируют
  его напрямую. Старый export сохранён для совместимости. Сам общий редактор
  остаётся доступен Workspace, без дополнительной задержки открытия.
- TeamActivity импортирует `accessApi` из API-модуля, не из AccountsPanel.
- Suspense использует существующий русский LoadingState. Permission checks,
  выбранные hashes, tabs, keys и props management/embedded сохранены.

## Измерения build output

Замеры `node scripts/bundle-audit.mjs` — final chunks из `writeBundle`,
с manifest в обоих проходах. Размеры десятичные kB; gzip — одинаковый
`node:zlib.gzipSync` (не надо смешивать с настройкой gzip-репортера Vite).

| JS граф / chunk | До, kB | После, kB |
| --- | ---: | ---: |
| Entry + все транзитивные static imports | 1 107,937 | 1 082,651 |
| Их суммарный gzip | 319,984 | 312,534 |
| `index-*` отдельно | 798,654 | 833,247 |
| Home route group `routes-*` | 30,339 | 30,293 |
| `qc-*` | 52,759 | 21,916 |
| `admin-*` | 8,447 | 9,191 |
| `ReferencePage-*` | 21,874 | 2,118 |

Entry closure меньше на **25 286 bytes / 2,28%**, gzip — на **7 450 bytes**.
`index-*` отдельно вырос: bundler перераспределил общие зависимости из
прежних shared chunks обратно в entry. Это не рост полного initial графа.
Admin shell немного вырос из-за async boundary, зато AccountsPanel больше
не входит в его static dependencies.

Home сам auto-split; для первого render `/` также нужен `routes-*` и его
static dependencies. После изменения полный first-render JS граф `/` —
**1 112 944 bytes**, gzip **321 437 bytes**. Ни один из проверяемых крупных
management screens не входит ни в entry closure, ни в home closure.
Это JS-граф, не total network payload: CSS/HTML/API responses здесь не считаются.

До изменений общий chunk `ProjectEmailsPage-*` (82,903 kB) содержал и почты,
и welcome-бонусы; `ReferencePage-*` содержал калькулятор. После — независимые
динамические workflows:

| Workflow chunk | kB после | Когда загружается |
| --- | ---: | --- |
| `AccountsPanel-*` | 36,389 | Admin → пользователи/роли/аудит |
| `AIControlCenter-*` | 32,571 | QC → AI знания/правила/инструкции/проверка AI |
| `SharedBindsPage-*` | 19,920 | QC → Материалы → Бинды |
| `ProjectEmailsPage-*` | 24,390 | Почты или QC → Материалы → Почты |
| `DepositBonusesPage-*` | 47,251 | Welcome-бонусы или их management tab |
| `BonusToolsPage-*` | 21,324 | Калькулятор бонусов |

Это размеры самих chunks, не стоимость их полного closure: общие зависимости
повторно не суммируются. Маленькие UI components не разделялись вручную.

## Повторная проверка

```sh
npm run build
node scripts/bundle-audit.mjs --check
npx vitest run src/features/operations/lazy-workspaces.test.tsx src/features/spaces/ReferencePage.test.tsx
npx playwright test tests/visual/chunks.visual.ts
```

`--check` обходит static imports и home route group, а не просто проверяет
названия файлов. Завершается ошибкой, если крупные экраны снова попали туда,
или если home split chunk не найден. Dynamic imports остаются исключёнными.

Проверено:

- 88/88 целевых unit tests в 11 файлах: lazy sections, tabs/props, permissions,
  AccountsPanel, AI, бонусы, SharedBindEditor и его сохранение/conflicts/drafts.
- 24/24 существующих Playwright auth/layout/screenshot checks, без обновления
  эталонов, 1440×900 и 390×844.
- 8/8 новых Playwright chunk-request checks: `/`, Admin overview → users,
  QC overview → binds → emails, quick emails. Используется существующая
  изолированная fixture с invalid test JWT и authenticated API mocks;
  production guards не изменены, backend writes и внешние запросы блокируются.
- `npm run build` и `bundle-audit.mjs --check` проходят.
- `tsc --noEmit`: те же 7 pre-existing errors (Tabs style, cache useRef,
  review-model risk/confidence assertions, unused Sidebar Button). Не исправлялись
  в этом bundle pass; в затронутых lazy files новых type errors нет.

На Windows Playwright preview teardown зависал уже после выполнения checks;
остановлен только созданный этим прогоном preview Node process после проверки
PID/path/start time. Test runners завершились с exit code 0.

PWA background precache всех assets сохранён. Lazy loading уменьшает initial
исполняемый JS, но не отменяет фоновую установку offline cache. Браузерные
chunk tests блокируют service workers; это проверка загрузки экрана, не precache.

Подход соответствует [TanStack automatic route splitting](https://tanstack.com/router/latest/docs/guide/code-splitting)
и [React lazy/Suspense](https://react.dev/reference/react/lazy).
