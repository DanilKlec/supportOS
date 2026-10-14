import type {
	ManagedRole,
	Permission,
	User,
} from "../../src/features/accounts/account-types";
import type { KnowledgeDatabase } from "../../src/services/knowledge/knowledge-import-export";

export const fixedTime = "2026-01-15T12:00:00.000Z";
export const userId = "00000000-0000-4000-8000-000000000001";
export const sessionId = "00000000-0000-4000-8000-000000000002";
export const supportPermissions = [
	"work",
	"binds.read",
	"projects.read",
	"bonuses.read",
	"tools",
];
export const permissions: Permission[] = [
	...supportPermissions.map((id, index) => ({
		id,
		name: [
			"Рабочее пространство",
			"Чтение биндов",
			"Чтение проектов",
			"Чтение бонусов",
			"Инструменты",
		][index],
		description: "Доступ к рабочим материалам",
		creator_only: false,
	})),
	...[
		"users.manage",
		"roles.manage",
		"knowledge.write",
		"projects.write",
		"bonuses.write",
		"ai.train",
		"ai.rules",
		"composer.use",
		"translator.use",
	].map((id, index) => ({
		id,
		name: [
			"Управление пользователями",
			"Управление ролями",
			"Публикация материалов",
			"Изменение проектов",
			"Изменение бонусов",
			"AI знания",
			"Правила ответов",
			"Помощник",
			"Переводчик",
		][index],
		description: "Разрешение команды",
		creator_only: false,
	})),
];
export const roles: ManagedRole[] = [
	{
		id: "support",
		name: "Поддержка",
		description: "Рабочие материалы и инструменты поддержки",
		is_system: true,
		version: 1,
		permissions: supportPermissions,
	},
	{
		id: "qc",
		name: "Контроль качества",
		description: "Проверка и публикация материалов команды",
		is_system: true,
		version: 1,
		permissions: ["knowledge.write", "ai.train", "ai.rules"],
	},
	{
		id: "admin",
		name: "Администратор",
		description: "Управление сотрудниками, ролями и доступами",
		is_system: true,
		version: 1,
		permissions: permissions.map((p) => p.id),
	},
];
export const users: User[] = [
	{
		id: "00000000-0000-4000-8000-000000000003",
		email: "employee@example.test",
		display_name: "Тестовый сотрудник",
		status: "active",
		version: 1,
		roles: ["support"],
	},
	{
		id: "00000000-0000-4000-8000-000000000004",
		email: "pending@example.test",
		display_name: "Новый сотрудник",
		status: "pending",
		version: 1,
		roles: [],
	},
];
export const authUser = {
	id: userId,
	aud: "authenticated",
	role: "authenticated",
	email: "visual@example.test",
	email_confirmed_at: fixedTime,
	created_at: fixedTime,
	updated_at: fixedTime,
	app_metadata: { provider: "email", providers: ["email"] },
	user_metadata: { display_name: "Тестовый администратор" },
};
// An intentionally invalid signature. This token cannot authorize real requests.
export const accessToken = [
	Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
		"base64url",
	),
	Buffer.from(
		JSON.stringify({
			sub: userId,
			session_id: sessionId,
			aud: "authenticated",
			role: "authenticated",
			exp: 4102444800,
		}),
	).toString("base64url"),
	"INVALID-VISUAL-FIXTURE-SIGNATURE",
].join(".");
export const authSession = {
	access_token: accessToken,
	refresh_token: "invalid-visual-refresh-token",
	token_type: "bearer",
	expires_in: 3600,
	expires_at: 4102444800,
	user: authUser,
};

export const knowledge: KnowledgeDatabase = {
	categories: [
		{
			id: "visual-category",
			name: "Материалы команды",
			ownerId: null,
			order: 0,
		},
	],
	folders: [
		{
			id: "visual-folder",
			name: "Работа с обращениями",
			categoryId: "visual-category",
			ownerId: null,
			order: 0,
		},
	],
	binds: ["Ответ на обращение", "Проверка статуса"].map((title, index) => ({
		id: `visual-bind-${index + 1}`,
		slug: `visual-bind-${index + 1}`,
		ownerId: null,
		categoryId: "visual-category",
		folderId: "visual-folder",
		tags: ["Поддержка"],
		translations: [
			{
				language: "ru",
				title,
				content:
					"Спасибо за обращение. Мы проверим информацию и вернёмся с ответом.",
				updatedAt: fixedTime,
			},
		],
		favorite: false,
		archived: false,
		createdAt: fixedTime,
		updatedAt: fixedTime,
	})),
	language: "ru",
	expandedFolders: ["visual-category", "visual-folder"],
};
export const bindRows = knowledge.binds.map((bind) => ({
	id: bind.id,
	slug: bind.slug,
	owner_id: null,
	category_id: bind.categoryId,
	folder_id: bind.folderId,
	tags: bind.tags,
	translations: bind.translations,
	favorite: false,
	archived: false,
	created_at: fixedTime,
	updated_at: fixedTime,
}));
