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
import type { Bind } from "@/entities/bind";
import { useAuthStore } from "@/store/auth.store";
const mock = vi.hoisted(() => ({
	users: vi.fn(),
	employeeLibrary: vi.fn(),
	savePersonal: vi.fn(),
	resetPersonal: vi.fn(),
	personal: vi.fn(),
	showToast: vi.fn(),
}));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: mock,
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: mock.showToast }),
}));
import { EmployeeBindsWorkbench } from "./EmployeeBindsWorkbench";
const anna = {
		id: "anna",
		email: "anna@example.test",
		display_name: "Анна Иванова",
	},
	boris = {
		id: "boris",
		email: "boris@example.test",
		display_name: "Борис Петров",
	};
const base: Bind = {
	id: "base",
	ownerId: null,
	slug: "base",
	categoryId: "common",
	folderId: "nested",
	translations: [
		{
			language: "ru",
			title: "Общий ответ",
			content: "Общий текст",
			updatedAt: "2026-10-14",
		},
	],
	tags: [],
	favorite: false,
	archived: false,
	createdAt: "2026-10-14",
	updatedAt: "2026-10-14",
};
const own: Bind = {
	...base,
	id: "own",
	ownerId: "anna",
	sourceBindId: "base",
	sourceHash: base.updatedAt,
	translations: [
		{
			language: "ru",
			title: "Личный ответ",
			content: "Текст Анны",
			updatedAt: "2026-10-14",
		},
	],
};
const standalone: Bind = {
	...base,
	id: "standalone",
	ownerId: "anna",
	categoryId: "private",
	folderId: "private-folder",
	translations: [
		{
			language: "ru",
			title: "Собственный ответ",
			content: "Отдельный материал Анны",
			updatedAt: "2026-10-14",
		},
	],
};
const library = {
	categories: [
		{ id: "common", name: "Общее", ownerId: null, order: 1, updatedAt: "v" },
		{
			id: "private",
			name: "Личная база",
			ownerId: "anna",
			order: 2,
			updatedAt: "v",
		},
	],
	folders: [
		{
			id: "folder",
			categoryId: "common",
			name: "Поддержка",
			ownerId: null,
			order: 1,
			updatedAt: "v",
		},
		{
			id: "nested",
			categoryId: "common",
			parentId: "folder",
			name: "Приветствия",
			ownerId: null,
			order: 1,
			updatedAt: "v",
		},
		{
			id: "private-folder",
			categoryId: "private",
			name: "Мои шаблоны",
			ownerId: "anna",
			order: 1,
			updatedAt: "v",
		},
	],
	binds: [base, own, standalone],
};
let client: QueryClient;
beforeEach(() => {
	vi.resetAllMocks();
	localStorage.clear();
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	useAuthStore.setState({
		session: {
			accessToken: "synthetic",
			user: {
				id: "manager",
				email: "manager@example.test",
				role: "qc",
				access: {
					status: "active",
					roles: [],
					permissions: ["binds.read", "binds.manage"],
					version: 1,
					display_name: "",
				},
			},
		},
	});
	mock.users.mockResolvedValue({ total: 2, users: [anna, boris] });
	mock.employeeLibrary.mockResolvedValue(library);
	mock.savePersonal.mockResolvedValue({ ...own, updatedAt: "new" });
	mock.resetPersonal.mockResolvedValue({ ok: true });
});
afterEach(() => {
	cleanup();
	client.clear();
	useAuthStore.setState({ session: undefined });
});
function mount() {
	render(
		<QueryClientProvider client={client}>
			<EmployeeBindsWorkbench onCommon={vi.fn()} />
		</QueryClientProvider>,
	);
}
async function chooseAnna() {
	mount();
	fireEvent.click(
		await screen.findByRole("button", { name: "Открыть бинды: Анна Иванова" }),
	);
	await screen.findByRole("tree");
}
function selectOwn() {
	fireEvent.change(screen.getByLabelText("Поиск в дереве сотрудника"), {
		target: { value: "Личный ответ" },
	});
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Личный ответ",
		}),
	);
}

it("opens employee cards then a nested tree with standalone private materials and version comparison", async () => {
	await chooseAnna();
	expect(mock.employeeLibrary).toHaveBeenCalledWith(
		"anna",
		expect.any(AbortSignal),
	);
	expect(screen.getByRole("treeitem", { name: "Мои шаблоны" })).toBeTruthy();
	expect(screen.queryByText("Текст Анны")).toBeNull();
	selectOwn();
	expect(
		screen.getByRole("heading", { name: "Личный ответ", level: 1 }),
	).toBeTruthy();
	expect(screen.getByText("Личная версия сотрудника")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Сравнить с общей" }));
	const comparison = screen.getByRole("region", { name: "Сравнение версий" });
	expect(within(comparison).getByText("Общий текст")).toBeTruthy();
	expect(within(comparison).getByText("Текст Анны")).toBeTruthy();
	fireEvent.change(screen.getByLabelText("Поиск в дереве сотрудника"), {
		target: { value: "Собственный ответ" },
	});
	fireEvent.click(
		within(screen.getByRole("tree")).getByRole("button", {
			name: "Собственный ответ",
		}),
	);
	expect(
		screen.getByRole("heading", { name: "Собственный ответ", level: 1 }),
	).toBeTruthy();
	expect(screen.getByText("Отдельный материал Анны")).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: "Редактировать личную версию" }),
	).toBeNull();
});
it("saves the exact personal branch for the selected employee inline without publishing a shared write", async () => {
	await chooseAnna();
	selectOwn();
	fireEvent.click(
		screen.getByRole("button", { name: "Редактировать личную версию" }),
	);
	expect(screen.getByRole("tree")).toBeTruthy();
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Новый текст Анны" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Сохранить личную версию" }),
	);
	await waitFor(() =>
		expect(mock.savePersonal).toHaveBeenCalledWith(
			expect.objectContaining({
				source: base,
				original: own,
				userId: "anna",
				translations: [
					expect.objectContaining({ content: "Новый текст Анны" }),
				],
			}),
		),
	);
});
it("does not show the previous employee's content while another library is pending", async () => {
	await chooseAnna();
	selectOwn();
	fireEvent.click(
		screen.getByRole("button", { name: "Выбрать другого сотрудника" }),
	);
	mock.employeeLibrary.mockReturnValue(new Promise(() => {}));
	fireEvent.click(
		within(screen.getByRole("dialog")).getByRole("button", {
			name: "Открыть бинды: Борис Петров",
		}),
	);
	await screen.findByText("Загружаем папки и бинды сотрудника…");
	expect(screen.queryByText("Текст Анны")).toBeNull();
	expect(screen.queryByRole("heading", { name: "Личный ответ" })).toBeNull();
	expect(mock.employeeLibrary).toHaveBeenLastCalledWith(
		"boris",
		expect.any(AbortSignal),
	);
});
it("guards a dirty draft before switching employees", async () => {
	await chooseAnna();
	selectOwn();
	fireEvent.click(
		screen.getByRole("button", { name: "Редактировать личную версию" }),
	);
	fireEvent.change(screen.getByLabelText("Текст ответа"), {
		target: { value: "Черновик" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Выбрать другого сотрудника" }),
	);
	expect(
		screen.getByRole("dialog", { name: "Перейти без сохранения?" }),
	).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Остаться" }));
	expect(
		(screen.getByLabelText("Текст ответа") as HTMLTextAreaElement).value,
	).toBe("Черновик");
});
it("confirms a reset before changing only the selected employee's branch", async () => {
	await chooseAnna();
	selectOwn();
	fireEvent.click(screen.getByRole("button", { name: "Вернуть общую" }));
	const dialog = screen.getByRole("dialog", { name: "Вернуть общую версию?" });
	expect(mock.resetPersonal).not.toHaveBeenCalled();
	fireEvent.click(
		within(dialog).getByRole("button", { name: "Вернуть общую" }),
	);
	await waitFor(() =>
		expect(mock.resetPersonal).toHaveBeenCalledWith(base, own, "anna"),
	);
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("keeps cached employee materials visible if refresh fails", async () => {
	await chooseAnna();
	selectOwn();
	mock.employeeLibrary.mockRejectedValue(new Error("offline"));
	fireEvent.click(
		screen.getByRole("button", { name: "Обновить бинды сотрудника" }),
	);
	await screen.findByRole("alert");
	expect(screen.getByText("Текст Анны")).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: "Редактировать личную версию" }),
	).toBeNull();
});
it("does not fetch employee identities without management permission", () => {
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
	expect(screen.getByRole("alert").textContent).toContain("Нет доступа");
	expect(mock.users).not.toHaveBeenCalled();
	expect(mock.employeeLibrary).not.toHaveBeenCalled();
});
