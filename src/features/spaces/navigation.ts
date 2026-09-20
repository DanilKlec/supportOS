import type { Permission } from "../../../shared/access.js";
export const spaces = [
	{
		title: "Рабочее пространство",
		items: [
			{ label: "Бинды", to: "/" },
			{
				label: "Помощник ответа",
				to: "/",
				hash: "composer-answer",
				permission: "composer.use",
			},
		],
	},
	{
		title: "Контент",
		items: [
			{ label: "Обзор", to: "/content" },
			{ label: "Материалы", to: "/shared-binds" },
			{ label: "Почты", to: "/project-emails", hash: "content" },
			{ label: "Бонусы", to: "/bonuses", hash: "content" },
			{ label: "Калькулятор", to: "/bonuses", hash: "content-calculator" },
			{ label: "Предложения", to: "/shared-binds", hash: "proposals" },
			{ label: "Качество", to: "/health" },
			{ label: "Архив", to: "/archive" },
		],
	},
	{
		title: "Команда",
		items: [
			{ label: "Активность", to: "/team" },
			{ label: "Сейчас", to: "/agent-monitor" },
			{ label: "Расписание", to: "/agent-monitor", hash: "schedule" },
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
			{
				label: "Интеграции",
				to: "/settings",
				hash: "integrations",
				permission: "technical",
			},
			{
				label: "Данные",
				to: "/settings",
				hash: "data",
				permission: "binds.read",
			},
		],
	},
] as const;
export type SpaceItem = {
	label: string;
	to: string;
	hash?: string;
	permission?: Permission;
};

export function canonicalPage(path: string, hash = "") {
	path = path.replace(/\/+$/, "") || "/";
	hash = hash.replace(/^#/, "");
	if (path === "/settings/users")
		return {
			to: "/admin",
			hash: ["roles", "audit"].includes(hash) ? hash : "users",
		};
	if (path === "/ai/knowledge") return { to: "/admin", hash: "knowledge" };
	if (path === "/settings/ai")
		return { to: "/settings", hash: "integrations-ai" };
	if (path === "/settings/translator")
		return { to: "/settings", hash: "integrations-translator" };
	if (path === "/admin" && ["integrations", "system"].includes(hash))
		return { to: "/settings", hash: "integrations" };
	if (path === "/admin" && hash === "qc")
		return { to: "/shared-binds", hash: "proposals" };
	if (path === "/bonus-tools")
		return {
			to: "/bonuses",
			hash: hash === "manage" ? "calculator-manage" : "calculator",
		};
	return { to: path, hash };
}
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

export function isContentReference(path: string, hash: string) {
	return (
		["/bonuses", "/bonus-tools", "/project-emails"].includes(
			path.replace(/\/+$/, ""),
		) &&
		["content", "content-calculator", "manage", "calculator-manage"].includes(
			hash,
		)
	);
}
