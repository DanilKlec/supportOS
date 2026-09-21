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
	[
		"overview",
		"Overview",
		"Overview",
		"Приоритетная очередь проверки знаний и сигналов команды.",
	],
	[
		"inbox",
		"Review Inbox",
		"Review",
		"Предложения, устаревшие материалы и пробелы из существующих источников.",
	],
	[
		"candidates",
		"AI Candidates",
		"Review",
		"Кандидаты из повторяющихся исправлений и подтверждённых примеров.",
	],
	[
		"proposals",
		"Agent Proposals",
		"Review",
		"Сравнение и проверка предложений операторов.",
	],
	[
		"materials",
		"Materials",
		"Knowledge",
		"Общие материалы и существующие версии.",
	],
	[
		"gaps",
		"Missing Knowledge",
		"Knowledge",
		"Темы, для которых операторы не нашли ответ.",
	],
	[
		"conflicts",
		"Conflicts",
		"Knowledge",
		"Проверка противоречий между знаниями.",
	],
	[
		"duplicates",
		"Duplicates",
		"Knowledge",
		"Повторяющееся содержимое материалов.",
	],
	["glossary", "Glossary", "Knowledge", "Термины и переводы для помощника."],
	[
		"quality",
		"AI Quality",
		"Quality",
		"Оценки операторов, проверка ответов и тестовые сценарии.",
	],
	[
		"languages",
		"Language Quality",
		"Quality",
		"Наличие заполненных переводов. Это покрытие, а не оценка точности.",
	],
	[
		"reviews",
		"Scheduled Reviews",
		"Quality",
		"Регулярная проверка актуальности материалов.",
	],
	[
		"trends",
		"Quality Trends",
		"Analytics",
		"Изменения качества по доступной истории.",
	],
	[
		"history",
		"History & Versions",
		"Analytics",
		"История общих материалов и существующий безопасный откат.",
	],
	[
		"knowledge",
		"AI Knowledge",
		"Knowledge settings",
		"Проверенные сведения для подбора контекста.",
	],
	[
		"rules",
		"Answer Rules",
		"Knowledge settings",
		"Обязательные ограничения ответа.",
	],
	[
		"instructions",
		"Project Instructions",
		"Knowledge settings",
		"Особенности обслуживания проектов.",
	],
	[
		"playground",
		"Answer Check",
		"Quality checks",
		"Проверка ответа и применившихся источников.",
	],
	[
		"tests",
		"Regression Tests",
		"Quality checks",
		"Проверка опубликованных знаний и черновиков.",
	],
	[
		"feedback",
		"AI Feedback",
		"Quality checks",
		"Причины отрицательных оценок операторов.",
	],
].map(([id, label, group, description]) => ({ id, label, group, description }));
for (const section of qcSections) {
	if (["knowledge", "rules", "instructions"].includes(section.id))
		section.parent = "materials";
	if (["playground", "tests", "feedback"].includes(section.id))
		section.parent = "quality";
}
