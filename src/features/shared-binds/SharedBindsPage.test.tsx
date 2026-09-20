// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useModalStore } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";

const mock = vi.hoisted(() => ({
	accounts: vi.fn(),
	list: vi.fn(),
	branches: vi.fn(),
	proposals: vi.fn(),
	history: vi.fn(),
	branchAction: vi.fn(),
	personal: vi.fn(),
	users: vi.fn(),
	save: vi.fn(),
	savePersonal: vi.fn(),
	resetPersonal: vi.fn(),
}));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.accounts,
}));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: mock,
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

import {
	matchLocalBind,
	WorkspaceSharedBindViewer,
} from "./WorkspaceSharedBinds";

const base = {
	id: "common",
	favorite: false,
	archived: false,
	createdAt: "2026-09-10T10:00:00Z",
	slug: "common",
	ownerId: null,
	categoryId: "shared",
	translations: [
		{
			language: "ru",
			title: "Общий ответ",
			content: "Исходный текст",
			updatedAt: "",
		},
	],
	tags: [],
	updatedAt: "2026-09-10T10:00:00Z",
};
beforeEach(() => {
	vi.resetAllMocks();
	localStorage.clear();
	useKnowledgeStore.setState({
		binds: [],
		remoteBinds: [],
		favorites: [],
		pinnedTabs: [],
	});
	useAuthStore.setState({
		session: {
			accessToken: "test",
			user: {
				id: "support",
				email: "test@example.com",
				role: "support",
				access: {
					status: "active",
					roles: [],
					permissions: ["binds.read"],
					version: 1,
					display_name: "",
				},
			},
		},
	});
	mock.branches.mockResolvedValue({ choices: {}, incoming: [], outgoing: [] });
	mock.proposals.mockResolvedValue([]);
	mock.history.mockResolvedValue([]);
	mock.accounts.mockResolvedValue({
		ok: true,
		json: async () => ({ users: [], hasMore: false }),
	});
	mock.branchAction.mockResolvedValue({ ok: true });
	mock.list.mockResolvedValue([base]);
	mock.personal.mockResolvedValue([]);
});
afterEach(cleanup);
function show() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<WorkspaceSharedBindViewer id="common" />
		</QueryClientProvider>,
	);
	return client;
}

it("exposes folder and archive actions for the linked library bind in the shared viewer", async () => {
	const local = {
		...base,
		id: "library-bind",
		ownerId: "support",
		sourceBindId: base.id,
	};
	useKnowledgeStore.setState({ binds: [local] });
	show();
	await screen.findByRole("heading", { name: "Общий ответ", level: 1 });
	fireEvent.click(screen.getByLabelText("Действия бинда"));
	fireEvent.click(
		await screen.findByRole("button", { name: "Переместить в папку" }),
	);
	expect(useModalStore.getState().activeModal).toMatchObject({
		type: "moveBind",
		payload: { bindId: "library-bind" },
	});
	fireEvent.click(screen.getByLabelText("Действия бинда"));
	fireEvent.click(await screen.findByRole("button", { name: "В архив" }));
	expect(useModalStore.getState().activeModal).toMatchObject({
		type: "deleteNode",
		payload: { id: "library-bind", type: "bind" },
	});
	expect(mock.resetPersonal).not.toHaveBeenCalled();
});
it("Support can save a personal version without changing the common original", async () => {
	mock.savePersonal.mockResolvedValue({
		...base,
		id: "personal",
		ownerId: "support",
		sourceBindId: "common",
	});
	show();
	fireEvent.click(
		await screen.findByRole("button", { name: "Изменить для себя" }),
	);
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Моя формулировка" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Сохранить личную версию" }),
	);
	await waitFor(() => expect(mock.savePersonal).toHaveBeenCalled());
	expect(mock.savePersonal.mock.calls[0][0]).toMatchObject({
		userId: "support",
		source: { id: "common" },
		translations: [{ content: "Моя формулировка" }],
	});
	expect(mock.save).not.toHaveBeenCalled();
	expect(
		screen.queryByRole("button", { name: "Бинды сотрудников" }),
	).toBeNull();
});
it("Support has no editor for common originals", async () => {
	show();
	fireEvent.click(await screen.findByRole("button", { name: "Общая" }));
	await screen.findAllByRole("heading", { name: "Общий ответ", level: 1 });
	expect(
		screen.queryByRole("button", { name: "Изменить для всех" }),
	).toBeNull();
	expect(screen.queryByRole("button", { name: "Добавить бинд" })).toBeNull();
});
it("a failed save keeps the draft open and shows an error", async () => {
	mock.savePersonal.mockRejectedValue(new Error("Версия уже изменена"));
	show();
	fireEvent.click(
		await screen.findByRole("button", { name: "Изменить для себя" }),
	);
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Не терять черновик" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Сохранить личную версию" }),
	);
	expect(await screen.findByRole("alert")).toBeTruthy();
	expect(
		(screen.getByLabelText("Текст ответа") as HTMLTextAreaElement).value,
	).toBe("Не терять черновик");
});

it("recipient selects a shared branch and can only copy it into their own", async () => {
	mock.branches.mockResolvedValue({
		choices: { common: "grant" },
		incoming: [
			{
				id: "grant",
				sourceId: "common",
				sender: "Коллега",
				bind: {
					...base,
					id: "theirs",
					translations: [
						{
							language: "ru",
							title: "Ответ коллеги",
							content: "Чужая формулировка",
						},
					],
				},
			},
		],
		outgoing: [],
	});
	show();
	expect(
		await screen.findByRole("heading", { name: "Ответ коллеги", level: 1 }),
	).toBeTruthy();
	fireEvent.click(
		screen.getByRole("button", { name: "Скопировать в мою ветку" }),
	);
	expect(
		(screen.getByLabelText("Текст ответа") as HTMLTextAreaElement).value,
	).toBe("Чужая формулировка");
	expect(
		screen.queryByRole("button", { name: "Изменить для всех" }),
	).toBeNull();
});

it("matches stable ids or a unique slug without guessing duplicate titles", () => {
	expect(matchLocalBind(base, [{ ...base, id: "local" }])?.id).toBe("local");
	expect(
		matchLocalBind(base, [
			{ ...base, id: "one" },
			{ ...base, id: "two" },
		]),
	).toBeUndefined();
	expect(
		matchLocalBind(base, [
			{ ...base, id: "linked", slug: "different", sourceBindId: base.id },
		])?.id,
	).toBe("linked");
});
it("offers sharing before a personal branch exists", async () => {
	mock.accounts.mockResolvedValue({
		ok: true,
		json: async () => ({
			users: [
				{ id: "recipient", display_name: "Ivan", email: "ivan@example.com" },
			],
			hasMore: false,
		}),
	});
	mock.branchAction.mockImplementation(async (action) => {
		if (action === "share")
			mock.branches.mockResolvedValue({
				choices: {},
				incoming: [],
				outgoing: [
					{
						id: "share",
						sourceId: "common",
						recipient: "Ivan",
						email: "ivan@example.com",
					},
				],
			});
		if (action === "revoke")
			mock.branches.mockResolvedValue({
				choices: {},
				incoming: [],
				outgoing: [],
			});
		return { ok: true };
	});
	show();
	fireEvent.click(await screen.findByRole("button", { name: "Поделиться" }));
	expect(
		screen.getByRole("textbox", { name: "Поиск по имени или email" }),
	).toBeTruthy();
	fireEvent.click(await screen.findByRole("button", { name: /Ivan/ }));
	fireEvent.click(screen.getByRole("button", { name: "Предоставить доступ" }));
	await screen.findByText("Уже имеет доступ");
	expect(mock.branchAction).toHaveBeenCalledWith("share", {
		sourceId: "common",
		email: "ivan@example.com",
	});
	fireEvent.click(screen.getByRole("button", { name: /Ivan/ }));
	const form = screen
		.getByRole("button", { name: "Предоставить доступ" })
		.closest("form");
	if (!form) throw new Error("Share form missing");
	fireEvent.submit(form);
	expect(
		mock.branchAction.mock.calls.filter(([action]) => action === "share"),
	).toHaveLength(1);
	fireEvent.click(screen.getByRole("button", { name: "Отозвать доступ" }));
	await waitFor(() =>
		expect(screen.queryByText("Уже имеет доступ")).toBeNull(),
	);
	expect(
		(screen.getByRole("button", { name: /Ivan/ }) as HTMLButtonElement)
			.disabled,
	).toBe(false);
});

it("switches immediately while saving and rolls back a failed preference", async () => {
	let rejectSave: (error: Error) => void = () => {};
	mock.personal.mockResolvedValue([
		{
			...base,
			id: "personal",
			sourceBindId: "common",
			translations: [
				{ language: "ru", title: "Личный ответ", content: "Мой текст" },
			],
		},
	]);
	mock.branchAction.mockImplementation(
		() =>
			new Promise((_, reject) => {
				rejectSave = reject;
			}),
	);
	show();
	await screen.findByRole("heading", { name: "Личный ответ", level: 1 });
	fireEvent.click(screen.getByRole("button", { name: "Общая" }));
	await screen.findByRole("heading", { name: "Общий ответ", level: 1 });
	rejectSave(new Error("Сохранение не удалось"));
	await screen.findByRole("alert");
	await screen.findByRole("heading", { name: "Личный ответ", level: 1 });
});

it("requires reviewing the exact common draft before publishing", async () => {
	const { SharedBindEditor } = await import("./SharedBindsPage");
	render(
		<SharedBindEditor original={base} onClose={() => {}} onSaved={() => {}} />,
	);
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Обновление" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Проверить изменения" }));
	expect(mock.save).not.toHaveBeenCalled();
	expect(screen.getByText("Проверка перед публикацией")).toBeTruthy();
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Другая правка" },
	});
	expect(
		screen.queryByRole("button", { name: "Опубликовать для всех" }),
	).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Проверить изменения" }));
	mock.save.mockResolvedValue(base);
	fireEvent.click(
		screen.getByRole("button", { name: "Опубликовать для всех" }),
	);
	await waitFor(() =>
		expect(mock.save).toHaveBeenCalledWith(
			expect.objectContaining({
				translations: expect.arrayContaining([
					expect.objectContaining({ content: "Другая правка" }),
				]),
			}),
		),
	);
});

it("recovers a personal draft after remount and removes it after successful save", async () => {
	const { SharedBindEditor } = await import("./SharedBindsPage");
	const save = vi.fn().mockResolvedValue(base);
	const first = render(
		<SharedBindEditor
			personal
			original={base}
			save={save}
			onClose={() => {}}
			onSaved={() => {}}
		/>,
	);
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Не терять этот текст" },
	});
	await screen.findByText("Черновик сохранён в этом браузере");
	first.unmount();
	const second = render(
		<SharedBindEditor
			personal
			original={base}
			save={save}
			onClose={() => {}}
			onSaved={() => {}}
		/>,
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Восстановить черновик" }),
	);
	expect(
		(screen.getByLabelText("Текст ответа") as HTMLTextAreaElement).value,
	).toBe("Не терять этот текст");
	fireEvent.click(
		screen.getByRole("button", { name: "Сохранить личную версию" }),
	);
	await waitFor(() => expect(save).toHaveBeenCalled());
	second.unmount();
	render(
		<SharedBindEditor
			personal
			original={base}
			save={save}
			onClose={() => {}}
			onSaved={() => {}}
		/>,
	);
	expect(screen.queryByText("Найден несохранённый черновик")).toBeNull();
});

it("keeps personal edits on conflict and retries against the explicitly reviewed version", async () => {
	const latest = {
		...base,
		id: "personal",
		sourceBindId: "common",
		updatedAt: "2026-09-12T10:00:00Z",
	};
	mock.personal.mockResolvedValue([latest]);
	mock.savePersonal
		.mockRejectedValueOnce(
			Object.assign(new Error("Conflict"), { status: 409 }),
		)
		.mockResolvedValue(latest);
	show();
	fireEvent.click(
		await screen.findByRole("button", { name: "Изменить для себя" }),
	);
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Мои изменения" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Сохранить личную версию" }),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "Продолжить с моими правками" }),
	);
	expect(
		(screen.getByLabelText("Текст ответа") as HTMLTextAreaElement).value,
	).toBe("Мои изменения");
	fireEvent.click(
		screen.getByRole("button", { name: "Сохранить личную версию" }),
	);
	await waitFor(() => expect(mock.savePersonal).toHaveBeenCalledTimes(2));
	expect(mock.savePersonal.mock.calls[1][0].original.updatedAt).toBe(
		latest.updatedAt,
	);
});
it.each([
	false,
	true,
])("declines only the selected received version and restores own=%s", async (hasOwn) => {
	const own = {
		...base,
		id: "own",
		ownerId: "support",
		sourceBindId: "common",
		translations: [
			{ language: "ru", title: "Личный fallback", content: "Мой текст" },
		],
	};
	mock.personal.mockResolvedValue(hasOwn ? [own] : []);
	const incoming = {
		id: "received",
		sourceId: "common",
		sender: "Автор",
		bind: {
			...base,
			id: "authors",
			translations: [
				{
					language: "ru",
					title: "Полученная версия",
					content: "Авторский текст",
				},
			],
		},
	};
	mock.branches.mockResolvedValue({
		choices: { common: "received" },
		incoming: [
			incoming,
			{ ...incoming, id: "other-received", sender: "Другой автор" },
		],
		outgoing: [],
	});
	mock.branchAction.mockImplementation(async (action) => {
		if (action === "decline")
			mock.branches.mockImplementation(() => new Promise(() => {}));
		return { ok: true };
	});
	const client = show();
	await screen.findByRole("heading", { name: "Полученная версия", level: 1 });
	fireEvent.click(screen.getByText("Действия"));
	fireEvent.click(
		await screen.findByRole("button", { name: "Отказаться от версии" }),
	);
	expect(
		screen.getByRole("dialog", { name: "Отказаться от версии?" }),
	).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Отказаться" }));
	await screen.findByRole("heading", {
		name: hasOwn ? "Личный fallback" : "Общий ответ",
		level: 1,
	});
	expect(mock.branchAction).toHaveBeenCalledWith("decline", {
		shareId: "received",
	});
	expect(mock.save).not.toHaveBeenCalled();
	expect(mock.resetPersonal).not.toHaveBeenCalled();
	expect(
		client
			.getQueryData<{ incoming: { id: string }[] }>([
				"bind-branches",
				"support",
			])
			?.incoming.map((share) => share.id),
	).toEqual(["other-received"]);
});
