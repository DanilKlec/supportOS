# Admin и QC: архитектура и границы реализации

Репозиторий: DanilKlec/supportOS, ветка test-auth-monitor. Визуальная основа — пользовательский supportos-admin-qc-concept.html. Макет используется как образец иерархии, групп навигации, плотности и diff; его демонстрационные данные не включены в приложение.

## Разделение ответственности

- Admin `/admin`: доступы, роли, аудит, источники проектов, подключения, состояние сервисов и границы конфигурации AI. В Admin нет ручного обучения модели.
- QC `/qc`: очередь проверки, предложения операторов, материалы, пробелы, дубликаты, глоссарий, качество и версии. Существующие редакторы знаний/правил/инструкций открываются внутри Materials; проверка ответов, тесты и обратная связь — внутри AI Quality.
- Workspace и обычные справочники не получают новый контекстный sidebar.

## Структура

- `features/operations/OperationsWorkspace.tsx`: общая оболочка, контекстная навигация, мобильный выбор раздела, панели, строки, состояния загрузки/ошибки.
- `features/operations/sections.ts`: 15 основных пунктов Admin и 15 QC; дополнительные редакторы знаний являются дочерними инструментами QC.
- `features/operations/data.ts`: типизированные адаптеры существующих endpoint и ключей React Query.
- `features/admin/AdminWorkspace.tsx`, `features/admin/pages/PlatformPages.tsx`: сборка платформенных экранов. `AdminPanel` остаётся совместимым экспортом.
- `features/qc/QCWorkspace.tsx`, `QualityPages.tsx`, `review-model.ts`: QC и нормализация очереди без изменения модели предложений.
- `services/operations-capabilities.ts`: контракты LearningCandidate, LearningEvidence, LearningPolicy, ModelRouting, AIRequestLog, Usage, ReviewSchedule; явный результат not-configured для отсутствующих backend.

## Какие данные используются

| Экраны | Реальный источник / ограничения |
| --- | --- |
| Dashboard, Users, Access Review | `/api/accounts?action=users`, catalog. Обзор читает до 20 страниц и показывает загруженное/общее количество. Неиспользуемые роли определяются только при полной выборке. |
| Roles & Permissions, Audit | Существующий AccountsPanel и API/RPC ролей, матрица разрешений, подтверждение diff, before/after аудит. |
| Employee drawer | Существующий редактор прав, аудит сотрудника, мониторинг при monitor.read; личные бинды через sharedBindsService.personal при binds.manage. Назначения проектов пока отсутствуют. |
| Projects | Проекты загруженного справочника бонусов. Они явно не приравниваются к назначениям сотрудников или инструкциям AI. |
| Integrations, System Health | `/api/ai/status` — конфигурация провайдера/модели; `/api/agent-monitor?action=data` — lastSync при monitor.read; состояние клиентской конфигурации Supabase. Конфигурация не объявляется доказательством доступности сервиса. |
| AI Overview / AI Quality | Существующий AI runtime и его последние 100 оценок при AI-правах; отдельно knowledge feedback. Метрики принятия/редактирования/стоимости не выдумываются. |
| Review Inbox / QC Overview | sharedBindsService.proposals и `/api/binds?action=quality-signals`. Устаревшие отметки группируются по bind_id; затем предложения и пробелы. Риск и confidence отсутствуют, пока нет классификатора. |
| Agent Proposals | ProposalWorkflow и BindProposals: текущие pending/mine/accepted/rejected, сравнение, accept/reject. Inbox использует этот же компонент для выбранного предложения. |
| Materials | SharedBindsPage, настоящая общая база, редактор с текущей оптимистической версией. Lifecycle — отображение существующих состояний, без новой схемы. Отметка устаревания означает Needs review, а не автоматическое снятие публикации. |
| Missing Knowledge | Последние 100 зарегистрированных пробелов. Сервер не предоставляет статус закрытия — UI не имитирует его. |
| Duplicates | Существующий getKnowledgeHealthReport по общей базе, сравнение нормализованного текста. Семантическая проверка не заявляется. |
| Glossary и инструменты знаний | Существующий AIControlCenter и `/api/ai/knowledge`; версия документа, preview, публикация и серверные права сохранены. |
| Language Quality | Число заполненных переводов / число активных общих материалов. Это покрытие, не точность перевода. |
| History & Versions | sharedBindsService.history, последние 50 версий, diff с текущей общей версией. Общий destructive rollback API отсутствует; доступен переход в действующий редактор. Личная операция «взять за основу» в Workspace сохраняется. |

## Что ожидает backend

AI Candidates, генерация/автопубликация кандидатов, изменение Learning Policy, task routing/fallback, usage/costs/budget, AI request logs, semantic conflicts, scheduled reviews, quality trends, feature flags и реестр фоновых jobs показаны с явным статусом Not configured / No telemetry. Настройки отключены; нет фиктивного сохранения в localStorage, случайных метрик, таймеров синхронизации или выдуманных кандидатов. Не выполнялись fine-tuning и новые миграции.

Будущий поток: работа операторов → подтверждённые сигналы → обнаружение повторений → кандидат с evidence → классификация риска → разрешённая low-risk публикация либо QC → опубликованные знания доступны следующему подбору контекста. Semantic auto-publish по умолчанию выключен. Текущие оценки без текста переписки ещё не достаточны для построения такого процесса: нужно добавить серверный сбор согласованных примеров, дедупликацию и аудит решений.

## RBAC и совместимость

Обычный Support не имеет доступа к Admin/QC. Навигация и прямые ссылки используют общий `canAccessPage`; нестандартные роли получают только разделы по уже существующим effective permissions. Технические разделы требуют technical; Users/Access Review/Audit — users.manage, Roles — roles.manage. Контент QC требует knowledge.write; специализированные инструменты — соответствующие ai.* права. Роли и разрешения в БД не менялись. Защита Creator, запреты самоэскалации, серверная авторизация, аудит и optimistic versioning сохранены.

Старые `/content`, `/shared-binds#proposals`, `/admin#knowledge|rules|projects|glossary|playground|tests|feedback`, `/ai/knowledge` и `/admin#qc` направляются в эквивалентный раздел QC. `/admin#projects` сохраняет значение AI-инструкций; платформенные проекты доступны через `/admin#platform-projects`. `/health` и `/archive` остаются рабочими, чтобы сохранить существующие проверки и восстановление архива. Остальные прежние настройки доступны по старым адресам.

Кнопка глобального выхода в Agent Monitor переименована в «Выйти из SupportOS». Сбор данных, фильтры, смены, расписание и экспорт мониторинга не изменялись.

## Проверка

- Полный прогон: 217 тестов, 60 файлов — успешно.
- TypeScript, Biome check/lint и production build — успешно.
- Новый тест рендерит все секции Admin/QC с пустыми/неподключёнными состояниями; тесты очереди и RBAC проверяют отсутствие выдуманного риска и изоляцию прав.
- Визуально сверены desktop оболочки с исходным HTML и мобильная компоновка 390 px на изолированных статических рендерах настоящих компонентов. Это не E2E серверных изменений под рабочим аккаунтом.
- Для воспроизводимого preview: PowerShell `$env:SUPPORTOS_PREVIEW='1'; npx vitest run src/features/operations/workspace.test.tsx`. Вывод в `.admin-qc-reference` — только тестовые статические страницы, не часть приложения и не источник продуктовых данных.
