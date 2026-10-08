// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bind } from "@/entities/bind";
import { useKnowledgeStore, useProjectEmailStore } from "@/store";
import { ModalRoot } from "./ModalRoot";
import { modalManager, useModalStore } from "./modal.store";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	showToast: vi.fn(),
	copy: vi.fn(),
	service: {
		createBind: vi.fn(),
		updateBind: vi.fn(),
		deleteFolder: vi.fn(),
		archiveBind: vi.fn(),
		restoreDeletedItems: vi.fn(),
		restoreBindHistory: vi.fn(),
		recordBindCopied: vi.fn(),
	},
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock("@/shared/lib/clipboard", () => ({ copyToClipboard: mocks.copy }));
vi.mock("@/services/knowledge.service", () => ({
	knowledgeService: mocks.service,
}));

const initialKnowledge = useKnowledgeStore.getState();
const initialEmails = useProjectEmailStore.getState();
const presetKey = "supportos:variable-presets:v1";
let originalPreset: string | null;

function bind(id: string, patch: Partial<Bind> = {}): Bind {
	return {
		id,
		slug: id,
		categoryId: "category",
		folderId: "folder",
		tags: [],
		translations: [
			{
				language: "ru",
				title: `Название ${id}`,
				content: `Текст ${id}`,
				updatedAt: "2026-10-01T12:00:00Z",
			},
		],
		favorite: false,
		archived: false,
		createdAt: "2026-10-01T12:00:00Z",
		updatedAt: "2026-10-01T12:00:00Z",
		...patch,
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.copy.mockResolvedValue(true);
	originalPreset = localStorage.getItem(presetKey);
	localStorage.removeItem(presetKey);
	useModalStore.setState({ activeModal: null });
	useKnowledgeStore.setState({
		...initialKnowledge,
		categories: [{ id: "category", name: "Категория", order: 0 }],
		folders: [
			{ id: "folder", name: "Папка", categoryId: "category", order: 0 },
			{
				id: "child",
				name: "Вложенная папка",
				categoryId: "category",
				parentId: "folder",
				order: 0,
			},
		],
		binds: [bind("first"), bind("second")],
		remoteBinds: [],
		language: "ru",
	});
	useProjectEmailStore.setState({ records: [] });
});

afterEach(() => {
	cleanup();
	useModalStore.setState({ activeModal: null });
	useKnowledgeStore.setState(initialKnowledge);
	useProjectEmailStore.setState(initialEmails);
	if (originalPreset === null) localStorage.removeItem(presetKey);
	else localStorage.setItem(presetKey, originalPreset);
});

function field(name: string) {
	return within(screen.getByRole("group", { name })).getByRole("textbox");
}
function fill(name: string, value: string) {
	fireEvent.change(field(name), { target: { value } });
}

it("keeps a single router and resets the form when the bind payload changes", () => {
	render(<ModalRoot />);
	expect(screen.queryByRole("dialog")).toBeNull();
	act(() => modalManager.open("editBind", { bindId: "first" }));
	fill("Заголовок", "Несохранённый заголовок");
	act(() => modalManager.open("editBind", { bindId: "second" }));
	expect((field("Заголовок") as HTMLInputElement).value).toBe(
		"Название second",
	);
	expect(screen.queryByText("Unsaved changes")).toBeNull();
	expect(screen.getAllByRole("dialog")).toHaveLength(1);
	fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
	expect(screen.queryByRole("dialog")).toBeNull();
});

it("preserves validation and the multilingual create payload, omitting empty drafts", () => {
	render(<ModalRoot />);
	act(() =>
		modalManager.open("createBind", {
			categoryId: "category",
			folderId: "child",
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: "Создать" }));
	expect(mocks.service.createBind).not.toHaveBeenCalled();
	expect(
		screen.getByText("Добавьте заголовок и содержание хотя бы на одном языке"),
	).toBeTruthy();
	fill("Заголовок", "  Ответ  ");
	fill("Содержание", "  Текст ответа  ");
	fill("Инструкция для агента", "  Внутренние шаги  ");
	fireEvent.change(screen.getByPlaceholderText("es"), {
		target: { value: " PT_BR " },
	});
	fireEvent.click(screen.getByRole("button", { name: "Добавить язык" }));
	fill("Заголовок", "Resposta");
	fill("Содержание", "Texto");
	fireEvent.click(screen.getByText("Metadata"));
	fill("Теги", "bonus, kyc, bonus, ");
	fireEvent.click(screen.getByRole("button", { name: "Создать" }));
	expect(mocks.service.createBind).toHaveBeenCalledWith({
		slug: "Ответ",
		categoryId: "category",
		folderId: "child",
		color: undefined,
		tags: ["bonus", "kyc"],
		title: "Ответ",
		content: "Текст ответа",
		language: "ru",
		translations: [
			{
				language: "ru",
				title: "Ответ",
				content: "Текст ответа",
				agentInstructions: "Внутренние шаги",
				updatedAt: expect.any(String),
			},
			{
				language: "pt-br",
				title: "Resposta",
				content: "Texto",
				agentInstructions: undefined,
				updatedAt: expect.any(String),
			},
		],
	});
	expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
	expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps unsaved-change confirmation and service errors without losing the draft", () => {
	mocks.service.updateBind.mockImplementation(() => {
		throw new Error("409: версия изменилась");
	});
	render(<ModalRoot />);
	act(() => modalManager.open("editBind", { bindId: "first" }));
	fill("Заголовок", "Новый заголовок");
	fireEvent.keyDown(window, { key: "Escape" });
	expect(screen.getByRole("alertdialog")).toBeTruthy();
	fireEvent.click(
		screen.getByRole("button", { name: "Продолжить редактирование" }),
	);
	expect(screen.queryByRole("alertdialog")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
	expect(screen.getByText("409: версия изменилась")).toBeTruthy();
	expect((field("Заголовок") as HTMLInputElement).value).toBe(
		"Новый заголовок",
	);
	expect(mocks.service.updateBind).toHaveBeenCalledWith(
		"first",
		expect.objectContaining({
			slug: "first",
			categoryId: "category",
			folderId: "folder",
			translations: [expect.objectContaining({ title: "Новый заголовок" })],
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
	fireEvent.click(screen.getByRole("button", { name: "Discard" }));
	expect(screen.queryByRole("dialog")).toBeNull();
});

it("copies template variables with project email search and merges the existing preset", async () => {
	useKnowledgeStore.setState({
		binds: [
			bind("template", {
				translations: [
					{
						language: "ru",
						title: "Шаблон",
						content: "Здравствуйте, {client}. Напишите на ##Email##.",
						agentInstructions: "Не копировать внутреннюю инструкцию",
						updatedAt: "2026-10-01T12:00:00Z",
					},
				],
			}),
		],
	});
	useProjectEmailStore.setState({
		records: [
			{
				id: "project",
				projectName: "Проект Ёлка",
				slug: "elka",
				updatedAt: "2026-10-01T12:00:00Z",
				addresses: [
					{
						id: "support",
						type: "Support",
						email: "support@example.test",
						order: 0,
					},
					{
						id: "finance",
						type: "Finance",
						email: "finance@example.test",
						order: 1,
					},
				],
			},
		],
	});
	localStorage.setItem(
		presetKey,
		JSON.stringify({ client: "Имя", other: "Сохранить" }),
	);
	render(<ModalRoot />);
	act(() => modalManager.open("copyBind", { bindId: "template" }));
	expect((field("{client}") as HTMLInputElement).value).toBe("Имя");
	fill("{client}", "Клиент");
	fireEvent.change(screen.getByRole("searchbox"), {
		target: { value: "елка finance" },
	});
	expect(screen.queryByRole("button", { name: /support@example/ })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /finance@example/ }));
	fireEvent.click(screen.getByRole("button", { name: "Copy" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(mocks.copy).toHaveBeenCalledWith(
		"Здравствуйте, Клиент. Напишите на finance@example.test.",
	);
	expect(mocks.service.recordBindCopied).toHaveBeenCalledWith("template");
	expect(JSON.parse(localStorage.getItem(presetKey)!)).toEqual({
		client: "Клиент",
		Email: "finance@example.test",
		other: "Сохранить",
	});
});

it("keeps the copy dialog pending and does not record or persist a failed copy", async () => {
	let finish!: (value: boolean) => void;
	mocks.copy.mockImplementation(
		() =>
			new Promise<boolean>((resolve) => {
				finish = resolve;
			}),
	);
	localStorage.setItem(presetKey, JSON.stringify({ other: "Не менять" }));
	render(<ModalRoot />);
	act(() => modalManager.open("copyBind", { bindId: "first" }));
	fireEvent.click(screen.getByRole("button", { name: "Copy" }));
	const saving = screen.getByRole("button", { name: "Сохранение…" });
	expect((saving as HTMLButtonElement).disabled).toBe(true);
	expect(saving.getAttribute("aria-busy")).toBe("true");
	await act(async () => finish(false));
	expect(screen.getByRole("dialog")).toBeTruthy();
	expect(mocks.showToast).toHaveBeenCalledWith("Copy failed");
	expect(mocks.service.recordBindCopied).not.toHaveBeenCalled();
	expect(JSON.parse(localStorage.getItem(presetKey)!)).toEqual({
		other: "Не менять",
	});
});

it("shows the requested history language and restores the selected version", () => {
	useKnowledgeStore.setState({
		language: "de",
		binds: [
			bind("first", {
				history: [
					{
						id: "version",
						createdAt: "2026-10-01T12:00:00Z",
						slug: "previous",
						tags: [],
						translations: [
							{
								language: "ru",
								title: "Прошлый ответ",
								content: "Прошлый текст",
								updatedAt: "2026-10-01T12:00:00Z",
							},
							{
								language: "de",
								title: "Vorherige Antwort",
								content: "Vorheriger Text",
								updatedAt: "2026-10-01T12:00:00Z",
							},
						],
					},
				],
			}),
		],
	});
	render(<ModalRoot />);
	act(() => modalManager.open("bindHistory", { bindId: "first" }));
	expect(screen.getByText("Vorherige Antwort")).toBeTruthy();
	expect(screen.getByText("Vorheriger Text")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Restore" }));
	expect(mocks.service.restoreBindHistory).toHaveBeenCalledWith(
		"first",
		"version",
	);
	expect(mocks.showToast).toHaveBeenCalledWith("Версия восстановлена");
	expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps the nested deletion snapshot available for the toast restore action", () => {
	useKnowledgeStore.setState({
		binds: [
			bind("first"),
			bind("nested", { folderId: "child" }),
			bind("outside", { folderId: undefined }),
		],
	});
	render(<ModalRoot />);
	act(() => modalManager.open("deleteNode", { type: "folder", id: "folder" }));
	expect(screen.getByText("Будет удалено папок: 2, биндов: 2.")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
	expect(mocks.service.deleteFolder).toHaveBeenCalledWith("folder");
	expect(screen.queryByRole("dialog")).toBeNull();
	const toast = mocks.showToast.mock.calls[0][1];
	expect(toast.duration).toBe(6000);
	act(() => toast.action.onClick());
	expect(mocks.service.restoreDeletedItems).toHaveBeenCalledWith({
		folders: useKnowledgeStore.getState().folders,
		binds: useKnowledgeStore.getState().binds.slice(0, 2),
	});
});

it("archives a bind and keeps the existing unarchive action instead of deleting it", () => {
	render(<ModalRoot />);
	act(() => modalManager.open("deleteNode", { type: "bind", id: "first" }));
	fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
	expect(mocks.service.archiveBind).toHaveBeenCalledWith("first");
	expect(mocks.service.restoreDeletedItems).not.toHaveBeenCalled();
	act(() => mocks.showToast.mock.calls[0][1].action.onClick());
	expect(mocks.service.updateBind).toHaveBeenCalledWith("first", {
		archived: false,
	});
});

it("finds multilingual target duplicates, excludes archived binds and opens the candidate", () => {
	const target = bind("target");
	const duplicate = bind("duplicate", {
		translations: [
			{
				language: "en",
				title: "  НАЗВАНИЕ   target  ",
				content: "Other content",
				updatedAt: "2026-10-01T12:00:00Z",
			},
		],
	});
	useKnowledgeStore.setState({
		binds: [
			target,
			duplicate,
			bind("archived", { ...duplicate, id: "archived", archived: true }),
			bind("other"),
		],
	});
	render(<ModalRoot />);
	act(() => modalManager.open("findDuplicates", { bindId: "target" }));
	const candidates = within(screen.getByRole("dialog"))
		.getAllByRole("button")
		.filter((button) => button.className.includes("text-left"));
	expect(candidates).toHaveLength(1);
	fireEvent.click(candidates[0]);
	expect(useKnowledgeStore.getState().selectedBind).toBe("duplicate");
	expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
	expect(screen.queryByRole("dialog")).toBeNull();
});

it("finds library-wide duplicates by normalized content without merging or changing binds", () => {
	const target = bind("target");
	const duplicate = bind("duplicate", {
		translations: [
			{
				language: "en",
				title: "Другой заголовок",
				content: " ТЕКСТ  target ",
				updatedAt: "2026-10-01T12:00:00Z",
			},
		],
	});
	const binds = [target, duplicate, bind("other")];
	useKnowledgeStore.setState({ binds });
	render(<ModalRoot />);
	act(() => modalManager.open("findDuplicates"));
	expect(
		screen.getByRole("button", { name: "Название target target" }),
	).toBeTruthy();
	expect(
		screen.getByRole("button", { name: "Другой заголовок duplicate" }),
	).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: "Название other other" }),
	).toBeNull();
	expect(useKnowledgeStore.getState().binds).toEqual(binds);
	expect(mocks.service.updateBind).not.toHaveBeenCalled();
});
