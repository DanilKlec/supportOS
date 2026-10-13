import {
	Database,
	MonitorSmartphone,
	Palette,
	ShieldCheck,
	UserRound,
} from "lucide-react";

export const accountSections = [
	{
		id: "general",
		hash: "",
		title: "Профиль",
		description: "Личные данные и ваш доступ к рабочему пространству.",
		icon: UserRound,
	},
	{
		id: "security",
		hash: "security",
		title: "Безопасность",
		description: "Пароль, способы входа и дополнительная защита аккаунта.",
		icon: ShieldCheck,
	},
	{
		id: "sessions",
		hash: "sessions",
		title: "Устройства",
		description: "Активные сессии и последние события безопасности.",
		icon: MonitorSmartphone,
	},
	{
		id: "appearance",
		hash: "appearance",
		title: "Оформление",
		description: "Настройте интерфейс, язык и рабочее пространство под себя.",
		icon: Palette,
	},
	{
		id: "data",
		hash: "data",
		title: "Данные",
		description: "Импорт и экспорт доступной вам базы знаний.",
		icon: Database,
	},
] as const;

export type AccountSection = (typeof accountSections)[number]["id"];

export function resolveAccountSection(hash: string): AccountSection {
	return accountSections.find((item) => item.hash === hash)?.id ?? "general";
}

export function accountIdentity(email = "", displayName = "") {
	const legacy = email.endsWith("@telegram.supportos.invalid");
	const name = displayName.trim() || email.split("@")[0] || "Мой аккаунт";
	return {
		name,
		address: legacy ? email.split("@")[0] : email,
		addressLabel: legacy ? "Логин" : "Рабочая почта",
		initials: name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((word) => word[0])
			.join("")
			.toUpperCase(),
	};
}
