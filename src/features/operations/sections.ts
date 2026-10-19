import type { WorkspaceSection } from "@/features/operations/OperationsWorkspace";
import {
	BookOpen,
	History,
	Inbox,
	LayoutDashboard,
	ScanSearch,
	type LucideIcon,
} from "lucide-react";
export const adminSections: WorkspaceSection[] = [
	[
		"overview",
		"Панель администратора",
		"Обзор",
		"Состояние платформы, доступов, интеграций и AI.",
	],
	[
		"users",
		"Пользователи",
		"Команда",
		"Сотрудники, доступы и история изменений.",
	],
	[
		"roles",
		"Роли и доступы",
		"Команда",
		"Роли и эффективные разрешения. Системные ограничения сохраняются.",
	],
	[
		"access",
		"Проверка доступов",
		"Команда",
		"Проверка доступов по реальным данным аккаунтов и ролей.",
	],
	[
		"platform-projects",
		"Проекты",
		"Платформа",
		"Источники проектов и границы их конфигурации.",
	],
	[
		"integrations",
		"Интеграции",
		"Платформа",
		"Настройки и подтверждённое состояние подключений.",
	],
	[
		"jobs",
		"Задачи и автоматизация",
		"Платформа",
		"Фоновые операции и доступные сигналы выполнения.",
	],
	[
		"system-health",
		"Состояние системы",
		"Платформа",
		"Доступность источников. Отсутствие телеметрии не означает исправность.",
	],
	[
		"ai",
		"Обзор искусственного интеллекта",
		"Искусственный интеллект",
		"Состояние помощника и доступные сигналы качества.",
	],
	[
		"knowledge",
		"AI знания",
		"Искусственный интеллект",
		"Проверенные знания для помощника.",
	],
	[
		"rules",
		"Правила ответов",
		"Искусственный интеллект",
		"Правила подготовки ответов помощником.",
	],
	[
		"projects",
		"Инструкции проектов",
		"Искусственный интеллект",
		"Процессы и ограничения проектов для помощника.",
	],
	[
		"glossary",
		"Глоссарий",
		"Искусственный интеллект",
		"Термины и переводы для помощника.",
	],
	[
		"playground",
		"Проверка ответа",
		"Искусственный интеллект",
		"Проверка ответов и использованных источников.",
	],
	[
		"tests",
		"Тесты",
		"Искусственный интеллект",
		"Проверки типовых вопросов перед публикацией.",
	],
	[
		"feedback",
		"Отзывы операторов",
		"Искусственный интеллект",
		"Оценки ответов помощника и работа над ошибками.",
	],
	[
		"models",
		"Модели и маршрутизация",
		"Искусственный интеллект",
		"Используемая модель и маршрутизация задач.",
	],
	[
		"learning",
		"Обучение и безопасность",
		"Искусственный интеллект",
		"Политика накопления знаний и проверки изменений.",
	],
	[
		"usage",
		"Использование и расходы",
		"Искусственный интеллект",
		"Потребление и бюджет — только по данным серверной телеметрии.",
	],
	[
		"logs",
		"Журналы искусственного интеллекта",
		"Искусственный интеллект",
		"Источники, решения маршрутизации и безопасность ответов.",
	],
	[
		"audit",
		"Аудит",
		"Система",
		"Кто и когда изменил доступы: состояние до и после.",
	],
	[
		"flags",
		"Флаги функций",
		"Система",
		"Управляемые сервером функции платформы.",
	],
].map(([id, label, group, description]) => ({ id, label, group, description }));

const hiddenAdminNavigationSections = new Set([
	"access",
	"platform-projects",
	"jobs",
	"system-health",
	"models",
	"learning",
	"usage",
	"logs",
	"flags",
]);

adminSections.forEach((section) => {
	if (hiddenAdminNavigationSections.has(section.id)) {
		section.hiddenFromNavigation = true;
	}
});

export const adminHashRedirects: Record<string, string> = {
	access: "roles",
	"platform-projects": "integrations",
	jobs: "integrations",
	"system-health": "overview",
	models: "ai",
	learning: "ai",
	usage: "ai",
	logs: "ai",
	flags: "overview",
};

const qcIcons: Record<string, LucideIcon> = {
	overview: LayoutDashboard,
	inbox: Inbox,
	materials: BookOpen,
	problems: ScanSearch,
	history: History,
};
export const qcSections: WorkspaceSection[] = [
	[
		"overview",
		"Обзор",
		"Контроль качества",
		"Что сейчас требует вашего внимания.",
	],
	[
		"inbox",
		"Очередь проверки",
		"Контроль качества",
		"Откройте проблему, проверьте контекст и выберите следующее действие.",
	],
	[
		"materials",
		"Материалы",
		"Контроль качества",
		"Рабочие материалы команды: бинды, почты и welcome-бонусы.",
	],
	[
		"problems",
		"Проблемы материалов",
		"Контроль качества",
		"Найдите похожие материалы и недостающие переводы.",
	],
	[
		"history",
		"История",
		"Контроль качества",
		"История изменений и версии материалов.",
	],
].map(([id, label, group, description]) => ({
	id,
	label,
	group,
	description,
	icon: qcIcons[id],
}));

export const qcHashRedirects: Record<string, string> = {
	candidates: "inbox",
	conflicts: "duplicates",
	reviews: "inbox",
	trends: "overview",
};
