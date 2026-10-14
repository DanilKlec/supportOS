// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";
const mock = vi.hoisted(() => ({
	list: vi.fn(),
	save: vi.fn(),
	archive: vi.fn(),
	load: vi.fn(),
	change: vi.fn(),
	loadKnowledge: vi.fn(),
}));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: mock,
}));
vi.mock("@/services/shared-library.service", () => ({
	sharedLibraryService: mock,
}));
vi.mock("@/services/knowledge.service", () => ({ knowledgeService: mock }));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
import { SharedBindWorkbench } from "./SharedBindWorkbench";
const category = {
	id: "cat",
	name: "Общее",
	ownerId: null,
	order: 1,
	updatedAt: "2026-10-14",
};
const folder = {
	id: "folder",
	name: "Бонусы",
	ownerId: null,
	order: 1,
	categoryId: "cat",
	updatedAt: "2026-10-14",
};
const bind = {
	id: "answer",
	ownerId: null,
	slug: "answer",
	categoryId: "cat",
	folderId: "folder",
	tags: [],
	translations: [
		{
			language: "ru",
			title: "Условия бонуса",
			content: "Готовый ответ клиенту",
			updatedAt: "",
		},
	],
	favorite: false,
	archived: false,
	createdAt: "",
	updatedAt: "2026-10-14",
};
beforeEach(() => {
	vi.resetAllMocks();
	localStorage.clear();
	mock.load.mockResolvedValue({ categories: [category], folders: [folder] });
	mock.list.mockResolvedValue([bind]);
	mock.change.mockResolvedValue({ ok: true, row: { id: "new" } });
	mock.save.mockResolvedValue({ ...bind, updatedAt: "new" });
	mock.loadKnowledge.mockResolvedValue({});
	useAuthStore.setState({
		session: {
			accessToken: "synthetic-test",
			user: {
				id: "qc",
				email: "qc@example.test",
				role: "qc",
				access: {
					status: "active",
					roles: [],
					permissions: ["binds.read", "knowledge.write"],
					version: 1,
					display_name: "",
				},
			},
		},
	});
});
afterEach(() => {
	cleanup();
	useAuthStore.setState({ session: undefined });
});
function mount() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SharedBindWorkbench />
		</QueryClientProvider>,
	);
	return client;
}
it("closes folder and bind menus on outside pointer, focus and Escape", async () => {
	mount();
	await screen.findByRole("tree");
	fireEvent.click(screen.getByRole("button", { name: "Раскрыть Бонусы" }));
	const folderMenu = screen
		.getByLabelText("Действия: Бонусы")
		.closest("details")!;
	const bindMenu = screen
		.getByLabelText("Действия: Условия бонуса")
		.closest("details")!;
	folderMenu.open = true;
	fireEvent.pointerDown(document.body);
	expect(folderMenu.open).toBe(false);
	bindMenu.open = true;
	fireEvent.focusIn(screen.getByLabelText("Поиск в дереве"));
	expect(bindMenu.open).toBe(false);
	bindMenu.open = true;
	fireEvent.keyDown(document, { key: "Escape" });
	expect(bindMenu.open).toBe(false);
	expect(document.activeElement).toBe(bindMenu.querySelector("summary"));
});
it("confirms removal of the exact shared revision, then restores it from the trash", async () => {
	mock.archive.mockImplementation(async (original, archived) => {
		const saved = {
			...original,
			archived,
			updatedAt: archived ? "2026-10-15" : "2026-10-16",
		};
		mock.list.mockResolvedValue([saved]);
		return saved;
	});
	mount();
	await screen.findByRole("tree");
	fireEvent.change(screen.getByLabelText("Поиск в дереве"), {
		target: { value: "Условия" },
	});
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Условия бонуса",
		}),
	);
	fireEvent.click(
		screen.getAllByRole("button", { name: "Удалить бинд" }).at(-1)!,
	);
	const dialog = screen.getByRole("dialog", { name: "Удалить общий бинд?" });
	expect(mock.archive).not.toHaveBeenCalled();
	fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(mock.archive).toHaveBeenCalledWith(bind, true);
	expect(screen.queryByRole("treeitem", { name: "Условия бонуса" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Корзина (1)" }));
	fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
	fireEvent.click(
		within(
			screen.getByRole("dialog", { name: "Восстановить бинд?" }),
		).getByRole("button", { name: "Восстановить" }),
	);
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(mock.archive).toHaveBeenLastCalledWith(
		expect.objectContaining({
			id: bind.id,
			archived: true,
			updatedAt: "2026-10-15",
		}),
		false,
	);
});
it("retains the bind and confirmation when removal conflicts with another edit", async () => {
	mock.archive.mockRejectedValue(new Error("Бинд изменён другим сотрудником"));
	mount();
	await screen.findByRole("tree");
	fireEvent.change(screen.getByLabelText("Поиск в дереве"), {
		target: { value: "Условия" },
	});
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Условия бонуса",
		}),
	);
	fireEvent.click(
		screen.getAllByRole("button", { name: "Удалить бинд" }).at(-1)!,
	);
	fireEvent.click(
		within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }),
	);
	expect(await screen.findByRole("alert")).toHaveProperty(
		"textContent",
		"Бинд изменён другим сотрудником",
	);
	expect(screen.getByRole("treeitem", { name: "Условия бонуса" })).toBeTruthy();
});
it("shows a nested tree, creates a child folder at the selected location and refreshes from the server", async () => {
	mount();
	await screen.findByRole("tree");
	fireEvent.click(screen.getByRole("button", { name: "Раскрыть Бонусы" }));
	expect(screen.getByRole("treeitem", { name: /Условия бонуса/ })).toBeTruthy();
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", { name: "Бонусы" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Новая папка" }));
	const dialog = screen.getByRole("dialog", { name: "Новая папка" });
	fireEvent.change(within(dialog).getByLabelText("Название"), {
		target: { value: "Промокоды" },
	});
	fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
	await waitFor(() =>
		expect(mock.change).toHaveBeenCalledWith({
			entity: "folder",
			operation: "save",
			payload: {
				name: "Промокоды",
				categoryId: "cat",
				parentId: "folder",
				color: "",
			},
		}),
	);
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(mock.load.mock.calls.length).toBeGreaterThan(1);
});
it("edits inline while keeping the tree, guards unsaved navigation and publishes the original version", async () => {
	mount();
	await screen.findByRole("tree");
	fireEvent.change(screen.getByLabelText("Поиск в дереве"), {
		target: { value: "клиенту" },
	});
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Условия бонуса",
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
	expect(screen.getByRole("tree")).toBeTruthy();
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Обновлённый ответ" },
	});
	fireEvent.click(screen.getByRole("button", { name: /Все материалы/ }));
	expect(
		screen.getByRole("dialog", { name: "Перейти без публикации?" }),
	).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Остаться" }));
	fireEvent.click(screen.getByRole("button", { name: "Проверить изменения" }));
	fireEvent.click(
		screen.getByRole("button", { name: "Опубликовать для всех" }),
	);
	await waitFor(() =>
		expect(mock.save).toHaveBeenCalledWith(
			expect.objectContaining({
				original: bind,
				categoryId: "cat",
				folderId: "folder",
				translations: [
					expect.objectContaining({ content: "Обновлённый ответ" }),
				],
			}),
		),
	);
});
it("keeps the loaded content visible when no write permission is present", async () => {
	const session = useAuthStore.getState().session!;
	useAuthStore.setState({
		session: {
			...session,
			user: {
				...session.user,
				access: { ...session.user.access!, permissions: ["binds.read"] },
			},
		},
	});
	mount();
	await screen.findByRole("tree");
	expect(screen.queryByRole("button", { name: "Новый бинд" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Новый раздел" })).toBeNull();
});

it("creates a new shared section using the visible toolbar", async () => {
	mount();
	await screen.findByRole("tree");
	fireEvent.click(screen.getByRole("button", { name: "Новый раздел" }));
	const dialog = screen.getByRole("dialog", { name: "Новый раздел" });
	fireEvent.change(within(dialog).getByLabelText("Название"), {
		target: { value: "Новые ответы" },
	});
	expect(within(dialog).getByText("Общая база / Новые ответы")).toBeTruthy();
	fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
	await waitFor(() =>
		expect(mock.change).toHaveBeenCalledWith(
			expect.objectContaining({
				entity: "category",
				operation: "save",
				payload: expect.objectContaining({ name: "Новые ответы" }),
			}),
		),
	);
});

it("creates a folder while a bind is selected instead of accidentally moving the bind", async () => {
	mount();
	await screen.findByRole("tree");
	fireEvent.change(screen.getByLabelText("Поиск в дереве"), {
		target: { value: "Условия бонуса" },
	});
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Условия бонуса",
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: "Новая папка" }));
	const dialog = screen.getByRole("dialog", { name: "Новая папка" });
	fireEvent.change(within(dialog).getByLabelText("Название"), {
		target: { value: "Промокоды" },
	});
	fireEvent.click(within(dialog).getByRole("button", { name: "Создать" }));
	await waitFor(() =>
		expect(mock.change).toHaveBeenCalledWith({
			entity: "folder",
			operation: "save",
			payload: {
				name: "Промокоды",
				categoryId: "cat",
				parentId: "folder",
				color: "",
			},
		}),
	);
	expect(mock.save).not.toHaveBeenCalled();
});

it("confirms removal of a populated folder, preserves binds and refreshes their locations", async () => {
	mount();
	await screen.findByRole("tree");
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Бонусы",
		}),
	);
	fireEvent.click(
		within(
			screen.getByRole("group", {
				name: "Действия выбранной папки или раздела",
			}),
		).getByRole("button", { name: "Удалить папку" }),
	);
	const dialog = screen.getByRole("dialog", { name: "Удалить папку?" });
	expect(
		within(dialog).getByText(/переводы и личные версии сотрудников сохранятся/),
	).toBeTruthy();
	expect(mock.change).not.toHaveBeenCalled();
	mock.load.mockResolvedValue({ categories: [category], folders: [] });
	mock.list.mockResolvedValue([
		{ ...bind, folderId: undefined, updatedAt: "new" },
	]);
	fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
	await waitFor(() =>
		expect(mock.change).toHaveBeenCalledWith({
			entity: "folder",
			operation: "delete",
			payload: { id: "folder", expected: "2026-10-14", strategy: "keep" },
		}),
	);
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(screen.getByText("Папка удалена. Содержимое сохранено.")).toBeTruthy();
	expect(screen.getAllByText("Условия бонуса").length).toBeGreaterThan(0);
	expect(mock.loadKnowledge).toHaveBeenCalledOnce();
});

it("requires a destination when deleting a section with content", async () => {
	mock.load.mockResolvedValue({
		categories: [category, { ...category, id: "next", name: "Новые ответы" }],
		folders: [folder],
	});
	mount();
	await screen.findByRole("tree");
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Общее",
		}),
	);
	fireEvent.click(
		within(
			screen.getByRole("group", {
				name: "Действия выбранной папки или раздела",
			}),
		).getByRole("button", { name: "Удалить раздел" }),
	);
	const dialog = screen.getByRole("dialog", { name: "Удалить раздел?" });
	expect(
		(
			within(dialog).getByLabelText(
				"Куда перенести содержимое",
			) as HTMLSelectElement
		).value,
	).toBe("next");
	fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));
	await waitFor(() =>
		expect(mock.change).toHaveBeenCalledWith({
			entity: "category",
			operation: "delete",
			payload: {
				id: "cat",
				expected: "2026-10-14",
				strategy: "keep",
				destinationCategoryId: "next",
			},
		}),
	);
});
