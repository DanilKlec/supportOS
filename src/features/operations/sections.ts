import type { WorkspaceSection } from "@/features/operations/OperationsWorkspace";
export const adminSections: WorkspaceSection[] = [
	[
		"overview",
		"Admin Dashboard",
		"Overview",
		"Состояние платформы, доступов, интеграций и AI.",
	],
	["users", "Users", "Team", "Сотрудники, доступы и история изменений."],
	[
		"roles",
		"Roles & Permissions",
		"Team",
		"Роли и эффективные разрешения. Системные ограничения сохраняются.",
	],
	[
		"access",
		"Access Review",
		"Team",
		"Проверка доступов по реальным данным аккаунтов и ролей.",
	],
	[
		"platform-projects",
		"Projects",
		"Platform",
		"Источники проектов и границы их конфигурации.",
	],
	[
		"integrations",
		"Integrations",
		"Platform",
		"Настройки и подтверждённое состояние подключений.",
	],
	[
		"jobs",
		"Jobs & Automations",
		"Platform",
		"Фоновые операции и доступные сигналы выполнения.",
	],
	[
		"system-health",
		"System Health",
		"Platform",
		"Доступность источников. Отсутствие телеметрии не означает исправность.",
	],
	[
		"ai",
		"AI Overview",
		"AI",
		"Состояние помощника и доступные сигналы качества.",
	],
	[
		"models",
		"Models & Routing",
		"AI",
		"Используемая модель и маршрутизация задач.",
	],
	[
		"learning",
		"Learning & Safety",
		"AI",
		"Политика накопления знаний и проверки изменений.",
	],
	[
		"usage",
		"Usage & Costs",
		"AI",
		"Потребление и бюджет — только по данным серверной телеметрии.",
	],
	[
		"logs",
		"AI Logs",
		"AI",
		"Источники, решения маршрутизации и безопасность ответов.",
	],
	[
		"audit",
		"Audit",
		"System",
		"Кто и когда изменил доступы: состояние до и после.",
	],
	[
		"flags",
		"Feature Flags",
		"System",
		"Управляемые сервером функции платформы.",
	],
].map(([id, label, group, description]) => ({ id, label, group, description }));
export const qcSections: WorkspaceSection[] = [
 ["overview", "Обзор", "QC", "Что сейчас требует вашего внимания."],
 ["inbox", "Очередь проверки", "QC", "Откройте проблему, проверьте контекст и выберите следующее действие."],
 ["materials", "Материалы", "QC", "Рабочие материалы команды и проверенные сведения для AI."],
 ["problems", "Проблемы материалов", "QC", "Найдите похожие материалы и недостающие переводы."],
 ["quality", "Проверка AI", "QC", "Проверяйте ответы помощника, тесты и отзывы операторов."],
 ["history", "История", "QC", "История изменений и версии материалов."],
].map(([id,label,group,description])=>({id,label,group,description}));
