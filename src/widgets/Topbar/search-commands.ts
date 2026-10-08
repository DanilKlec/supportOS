import { normalizeSearchValue } from "@/shared/lib/bind-search";
import { can, canAccessPage } from "../../../shared/access.js";

export interface SearchCommand {
	id:
		| "user"
		| "project"
		| "settings"
		| "create-bind"
		| "assistant"
		| "materials";
	label: string;
	description: string;
	keywords: string;
	action:
		| { type: "navigate"; to: string; hash: string }
		| { type: "create-bind" };
}

export function searchCommands(access: unknown, query = ""): SearchCommand[] {
	const projectEmails = canAccessPage(access, "/project-emails");
	const commands: SearchCommand[] = [
		{
			id: "user",
			label: "Открыть пользователя",
			description: "Выбрать сотрудника в списке пользователей",
			keywords: "пользователи сотрудники аккаунт admin",
			action: { type: "navigate", to: "/admin", hash: "users" },
		},
		{
			id: "project",
			label: "Открыть проект",
			description: projectEmails
				? "Выбрать проект в почтах проектов"
				: "Выбрать проект в бонусах",
			keywords: "проекты каталог почты бонусы",
			action: {
				type: "navigate",
				to: projectEmails ? "/project-emails" : "/bonuses",
				hash: "",
			},
		},
		{
			id: "settings",
			label: "Открыть настройки",
			description: "Общие настройки приложения",
			keywords: "настройки settings",
			action: { type: "navigate", to: "/settings", hash: "" },
		},
		{
			id: "create-bind",
			label: "Создать бинд",
			description: "Открыть форму нового бинда",
			keywords: "новый бинд добавить материал",
			action: { type: "create-bind" },
		},
		{
			id: "assistant",
			label: "Открыть Помощник",
			description: "Подготовить ответ клиенту",
			keywords: "помощник assistant ai ответ composer",
			action: { type: "navigate", to: "/", hash: "composer-answer" },
		},
		{
			id: "materials",
			label: "Открыть QC → Материалы",
			description: "Рабочие источники команды",
			keywords: "qc материалы общая база знания",
			action: { type: "navigate", to: "/qc", hash: "materials" },
		},
	];
	const tokens = normalizeSearchValue(query).split(" ").filter(Boolean);

	return commands.filter((command) => {
		// The existing binds API permits personal creation with binds.read;
		// common knowledge writes are checked by the existing form/server flow.
		const allowed =
			command.action.type === "create-bind"
				? can(access, "binds.read")
				: canAccessPage(access, command.action.to, command.action.hash);
		const searchable = normalizeSearchValue(
			`${command.label} ${command.description} ${command.keywords}`,
		);
		return allowed && tokens.every((token) => searchable.includes(token));
	});
}
