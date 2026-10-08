# Legacy routes: аудит 2026-10-08

Все проверенные URL сохранены как небольшие redirect-only routes для существующих ссылок и bookmarks. Компоненты/CRUD в них не дублируются. Переходы выполняются через `beforeLoad` с `replace: true`; общий root auth/RBAC guard не изменён и по-прежнему проверяет права перед переходом.

| Старый URL | Назначение | Причина сохранения |
| --- | --- | --- |
| `/content` | `/qc#overview` | Существующий canonical mapping и ссылки/проверки Topbar. |
| `/shared-binds` | `/qc#materials` | Ссылки Topbar и EmptyWorkspace, прежний центр общей базы. |
| `/shared-binds#proposals` | `/qc#proposals` | Сохраняет фильтр предложений общей очереди QC. |
| `/settings/users` | `/admin#users` | Legacy bookmarks; существующий mapping и guard tests. |
| `/settings/users#roles` / `#audit` | `/admin#roles` / `#audit` | Сохраняет выбранный раздел. |
| `/settings/ai` | `/settings#integrations-ai` | Существующий mapping в настройки интеграции; navigation/access tests. |
| `/settings/translator` | `/settings#integrations-translator` | Существующий mapping; рабочий TranslatorSettingsPage переиспользуется в интеграциях. |
| `/ai/assistant` | `/#composer-answer` | Уже существовавший redirect в основной Composer. |
| `/bonus-tools` | `/bonuses#calculator` | Alt+4 в WorkspaceContinuity и прежние bookmarks калькулятора. |
| `/bonus-tools#manage` | `/bonuses#calculator-manage` | Сохранён прежний mapping, включая существующую проверку write permission. |
| `/ai/knowledge` | `/qc#knowledge` | Дополнительно найденный пустой legacy route; mapping и tests уже существуют. |

`/ai/assistant` уже был корректным redirect и не изменён. Остальные mappings берутся из существующего `canonicalPage`, без изменений permissions и экранов назначения. Неизвестные hashes по-прежнему обрабатываются прежними правилами mapping.

Файлы routes не удалены: удаление сломало бы существующие URL до выполнения root canonicalization. В `src/routes` больше нет `component: () => null`. Компоненты ContentOverview/SharedContentHub и остальные capability components не удалялись: это отдельный import audit, не часть чистки URL.

Проверены file routes, `tsr.config.json`, generated route tree, production/test references, navigation mappings, root guard и hotkeys. Тест `src/routes/-legacy-routes.test.ts` намеренно имеет префикс `-`, как существующий login test, и не должен попадать в generated route tree.
