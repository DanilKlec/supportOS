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
	load: vi.fn(),
	change: vi.fn(),
}));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: mock,
}));
vi.mock("@/services/shared-library.service", () => ({
	sharedLibraryService: mock,
}));
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
