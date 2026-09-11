// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";
const mock = vi.hoisted(() => ({
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
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: mock,
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
import { WorkspaceSharedBindViewer } from "./WorkspaceSharedBinds";
const base = {
	id: "common",
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
	fireEvent.change(await screen.findByLabelText("Ветка бинда"), {
		target: { value: "main" },
	});
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

it("recipient selects a shared branch and can only copy it into their own", async()=>{
 mock.branches.mockResolvedValue({choices:{common:"grant"},incoming:[{id:"grant",sourceId:"common",sender:"Коллега",bind:{...base,id:"theirs",translations:[{language:"ru",title:"Ответ коллеги",content:"Чужая формулировка"}]}}],outgoing:[]});
 show();
 expect(await screen.findByRole("heading",{name:"Ответ коллеги",level:1})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Скопировать в мою ветку"}));
 expect((screen.getByLabelText("Текст ответа") as HTMLTextAreaElement).value).toBe("Чужая формулировка");
 expect(screen.queryByRole("button",{name:"Изменить для всех"})).toBeNull();
});
