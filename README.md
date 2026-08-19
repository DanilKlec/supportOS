# SupportOS

SupportOS — рабочее пространство для службы поддержки: база знаний с быстрыми ответами (binds), поиск, мультиязычные материалы и набор вспомогательных инструментов для ежедневной работы оператора.

Приложение работает локально без обязательного бэкенда: данные базы знаний сохраняются в IndexedDB браузера. При необходимости можно включить авторизацию и облачную синхронизацию через Supabase.

## Возможности

- древовидная база знаний: категории, папки и готовые ответы;
- полнотекстовый поиск, избранное, недавние и архивные материалы;
- вкладки, копирование ответов и переменные в шаблонах;
- импорт из Google Sheets и резервный импорт/экспорт в JSON;
- мультиязычные ответы и перевод через LibreTranslate;
- AI-помощник и генерация ответов через Gemini;
- справочники проектных email и депозитных бонусов;
- инструменты расчёта бонусов и данные спортивных коэффициентов;
- светлая/тёмная тема и установка приложения как PWA;
- опциональная авторизация, роли и синхронизация с Supabase.

## Технологии

- React 19, TypeScript и Vite;
- TanStack Router и TanStack Query;
- Zustand;
- Tailwind CSS 4;
- Vitest и Biome;
- Vercel Functions для API-прокси;
- Supabase REST/Auth для опционального облачного режима.

## Быстрый старт

Понадобятся актуальная LTS-версия Node.js и npm.

```bash
git clone https://github.com/DanilKlec/supportOS.git
cd supportOS
npm install
Copy-Item .env.example .env
npm run dev
```

Для macOS/Linux вместо `Copy-Item` используйте:

```bash
cp .env.example .env
```

После запуска приложение доступно по адресу [http://localhost:3000](http://localhost:3000). Для базового локального режима секреты и внешние сервисы не требуются.

## Переменные окружения

Клиентские переменные с префиксом `VITE_` попадают в браузерный bundle — не храните в них секретные ключи.

### Supabase (опционально)

```dotenv
VITE_SUPPORTOS_CLOUD_SYNC=false
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Чтобы включить облачный режим:

1. Создайте проект Supabase.
2. Выполните SQL из [`supabase/schema.sql`](supabase/schema.sql) в SQL Editor проекта.
3. Укажите URL проекта и публичный anon key.
4. Установите `VITE_SUPPORTOS_CLOUD_SYNC=true`.

Схема создаёт профили, категории, папки и binds, включает Row Level Security и разделяет глобальные и пользовательские записи. Для назначения администратора добавьте email в таблицу `supportos_admin_emails` через доверенную административную среду.

### Gemini (опционально)

```dotenv
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash-lite
```

Ключ используется только serverless-функциями `/api/ai/*`. `GEMINI_MODEL` можно не задавать — показанная модель используется по умолчанию.

### LibreTranslate (опционально)

```dotenv
LIBRETRANSLATE_ENDPOINT=https://your-libretranslate-instance.example
LIBRETRANSLATE_API_KEY=your-api-key
```

Также поддерживаются `LIBRETRANSLATE_URL`, список `LIBRETRANSLATE_ENDPOINTS` и резервный список `LIBRETRANSLATE_FALLBACK_ENDPOINTS`. Без явной настройки используется публичный endpoint, доступность которого не гарантируется.

### Спортивные коэффициенты (опционально)

```dotenv
SPORTS_BETTING_API_KEY=your-the-odds-api-key
SPORTS_BETTING_SPORTS=soccer_fifa_world_cup
SPORTS_BETTING_REGIONS=eu
SPORTS_BETTING_MARKETS=h2h
SPORTS_BETTING_LIMIT=12
SPORTS_BETTING_POLL_MS=7200000
SPORTS_BETTING_CACHE_TTL_SECONDS=7200
SPORTS_BETTING_INCLUDE_LAY=false
```

Вместо `SPORTS_BETTING_API_KEY` поддерживается `THE_ODDS_API_KEY`. Дополнительно можно ограничить букмекеров переменной `SPORTS_BETTING_BOOKMAKERS`.

### CRM-ссылки (опционально)

```dotenv
VITE_CRM_ADWA_URL=https://example.com
VITE_CRM_WHITELABELS_URL=https://example.com
VITE_CRM_VORTEXINO_URL=https://example.com
```

## Команды

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Запуск dev-сервера на порту 3000 |
| `npm run build` | Production-сборка в `dist/` |
| `npm run preview` | Локальный просмотр production-сборки |
| `npm run test` | Однократный запуск тестов Vitest |
| `npm run lint` | Проверка кода Biome |
| `npm run format` | Форматирование Biome |
| `npm run check` | Комплексная проверка Biome |
| `npm run generate-routes` | Перегенерация дерева маршрутов TanStack Router |

## API

В каталоге `api/` находятся функции, рассчитанные на Vercel:

- `/api/ai/status` и `/api/ai/generate` — Gemini;
- `/api/translator/languages` и `/api/translator/translate` — LibreTranslate;
- `/api/google-sheets/fetch` — безопасный прокси публичных Google Sheets;
- `/api/sports-betting/live` — получение и кеширование коэффициентов.

Dev-сервер Vite локально эмулирует прокси Google Sheets и sports betting. Для полноценной локальной проверки остальных serverless-функций используйте Vercel CLI либо разверните проект на Vercel.

## Хранение данных

По умолчанию база знаний хранится в IndexedDB `supportos-local`; при недоступности IndexedDB используется localStorage. Настройки и данные отдельных инструментов также сохраняются в браузере. Очистка данных сайта удалит локальную базу, поэтому перед этим сделайте JSON-экспорт.

При включённой облачной синхронизации приложение использует Supabase Auth и таблицы из `supabase/schema.sql`. Локальный JSON-экспорт остаётся способом резервного копирования базы знаний, проектных email и депозитных бонусов.

## Структура проекта

```text
api/                 Vercel Functions и серверные интеграции
public/              PWA-манифест, иконки и статические файлы
src/
  components/        прикладные и UI-компоненты
  entities/          типы и начальные данные предметной области
  features/          AI, переводчик, бонусы, email и betting
  routes/            файловые маршруты TanStack Router
  services/          хранение, импорт/экспорт и интеграции
  shared/            общие хуки, утилиты и модальные окна
  store/             Zustand-хранилища
  widgets/           крупные блоки интерфейса
supabase/schema.sql  схема БД и RLS-политики
```

Файл `src/routeTree.gen.ts` создаётся автоматически TanStack Router и не должен редактироваться вручную.

## Production

```bash
npm run build
npm run preview
```

Конфигурация `vercel.json` уже содержит команды установки и сборки. Перед деплоем добавьте нужные переменные окружения в настройках проекта Vercel. Публичные `VITE_*` значения задаются на этапе сборки, серверные ключи — только в окружении функций.

## Проверка изменений

Перед отправкой изменений рекомендуется выполнить:

```bash
npm run test
npm run check
npm run build
```
