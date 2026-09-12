export const spaces = [
	{
		title: "Рабочее пространство",
		items: [
			{ label: "Бинды", to: "/" },
			{
				label: "Support Composer",
				to: "/",
				hash: "composer-answer",
				permission: "tools",
			},
		],
	},
	{
		title: "Контент",
		items: [
			{ label: "Обзор", to: "/content" },
			{ label: "Материалы", to: "/shared-binds" },
			{ label: "Почты", to: "/project-emails" },
			{ label: "Бонусы", to: "/bonuses" },
			{ label: "Предложения", to: "/shared-binds", hash: "proposals" },
			{ label: "Качество", to: "/health" },
			{ label: "Архив", to: "/archive" },
			{ label: "AI-инструкции", to: "/ai/knowledge" },
		],
	},
	{
		title: "Команда",
		items: [
			{ label: "Обзор", to: "/team" },
			{ label: "Сейчас", to: "/agent-monitor" },
			{ label: "Расписание", to: "/agent-monitor", hash: "schedule" },
			{ label: "Сотрудники", to: "/settings/users" },
			{ label: "Активность", to: "/team", hash: "activity" },
		],
	},
	{
		title: "Инструменты",
		items: [{ label: "Спортивные ставки", to: "/sports-betting" }],
	},
	{
		title: "Настройки",
		items: [
			{ label: "Общие", to: "/settings" },
			{ label: "Оформление", to: "/settings", hash: "appearance" },
			{ label: "Интеграции", to: "/settings", hash: "integrations" },
			{ label: "Данные", to: "/settings", hash: "data" },
		],
	},
] as const;
export type SpaceItem = {
	label: string;
	to: string;
	hash?: string;
	permission?: string;
};
export function spaceFor(path: string) {
	if (path === "/bonus-tools") return spaces[1];
	if (
		["/settings/ai", "/settings/translator", "/import/google-sheets"].includes(
			path,
		)
	)
		return spaces[4];
	return spaces.find((s) => s.items.some((i) => i.to === path));
}
