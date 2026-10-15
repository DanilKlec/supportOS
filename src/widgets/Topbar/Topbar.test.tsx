// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bind } from "@/entities/bind";
import { useModalStore } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	contentApi: vi.fn(async () => null),
	copyToClipboard: vi.fn(async () => true),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouterState: () => "/",
	Link: ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/services/shared-content.service", () => ({
	contentApi: mocks.contentApi,
}));
vi.mock("@/shared/lib/clipboard", () => ({
	copyToClipboard: mocks.copyToClipboard,
}));
vi.mock("@/features/shared-binds/Inbox", () => ({ Inbox: () => null }));
vi.mock("@/features/shared-binds/SharedBindEditor", () => ({
	SharedBindEditor: () => null,
}));
vi.mock("@/features/productivity/KnowledgeSignals", () => ({
	KnowledgeGapButton: () => null,
}));
vi.mock("@/features/spaces/ComposerLauncher", () => ({
	ComposerLauncher: () => null,
}));
vi.mock("./ToolsMenu", () => ({ ToolsMenu: () => null }));

import { Topbar } from "./Topbar";

const fullPermissions = [
	"work",
	"users.manage",
	"projects.read",
	"bonuses.read",
	"binds.read",
	"composer.use",
	"knowledge.write",
];
const source: Bind = {
	id: "material",
	slug: "material",
	categoryId: "payments",
	tags: [],
	favorite: false,
	archived: false,
	translations: [
		{
			language: "ru",
			title: "Материал клиента",
			content: "Ответ клиенту",
			updatedAt: "2026-10-01",
		},
	],
	createdAt: "2026-10-01",
	updatedAt: "2026-10-01",
};
let client: QueryClient;

function setAccess(
	permissions: string[],
	status: "active" | "pending" | "disabled" = "active",
) {
	useAuthStore.setState({
		configured: false,
		session: {
			accessToken: "synthetic-test-token",
			user: {
				id: "test",
				email: "test@example.com",
				role: "support",
				access: {
					status,
					permissions,
					roles: [],
					version: 1,
					display_name: "",
				},
			},
		},
	});
}

function setup(permissions = fullPermissions) {
	setAccess(permissions);
	render(
		<QueryClientProvider client={client}>
			<Topbar />
		</QueryClientProvider>,
	);
	const input = screen.getByRole("textbox", { name: "Глобальный поиск" });
	fireEvent.focus(input);
	return input;
}

beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false })),
	);
	useKnowledgeStore.setState({
		search: "",
		language: "ru",
		binds: [source],
		remoteBinds: [],
		categories: [{ id: "payments", name: "Платежи", order: 0 }],
		folders: [
			{ id: "deposits", name: "Депозиты", categoryId: "payments", order: 0 },
		],
		selectedCategory: "payments",
		selectedFolder: "deposits",
	});
	useModalStore.setState({ activeModal: null });
});

afterEach(() => {
	cleanup();
	client.clear();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

it("keeps Russian global navigation labels on the existing routes", () => {
	setup();
	const navigation = within(
		screen.getByRole("navigation", { name: "Пространства" }),
	);
	expect(
		navigation.getByRole("link", { name: "Бинды" }).getAttribute("href"),
	).toBe("/");
	expect(
		navigation
			.getByRole("link", { name: "Администрирование" })
			.getAttribute("href"),
	).toBe("/admin");
	expect(navigation.queryByRole("link", { name: "Workspace" })).toBeNull();
	expect(navigation.queryByRole("link", { name: "Admin" })).toBeNull();
});

it("shows one Commands group above content results in the existing search", () => {
	const input = setup();
	expect(
		within(screen.getByRole("group", { name: "Команды" })).getAllByRole(
			"option",
		),
	).toHaveLength(6);
	fireEvent.change(input, { target: { value: "материал" } });
	const list = screen.getByRole("listbox", { name: "Результаты поиска" });
	const groups = within(list).getAllByRole("group");
	expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
		"Команды",
		"Разделы",
		"Материалы",
	]);
	expect(
		within(list).getByRole("option", { name: /Материал клиента/ }),
	).toBeTruthy();
	expect(screen.getAllByRole("listbox")).toHaveLength(1);
	expect(screen.queryByRole("dialog")).toBeNull();
});

it.each([
	["Открыть пользователя", "/admin", "users"],
	["Открыть проект", "/project-emails", ""],
	["Открыть настройки", "/settings", ""],
	["Открыть Помощник", "/", "composer-answer"],
	["Открыть QC → Материалы", "/qc", "materials"],
])("executes %s through existing navigation and closes search", (name, to, hash) => {
	setup();
	fireEvent.click(screen.getByRole("option", { name }));
	expect(mocks.navigate).toHaveBeenCalledWith({ to, hash });
	expect(screen.queryByRole("listbox")).toBeNull();
});

it("opens the existing bind form with the current category/folder for personal creation", () => {
	setup(["work", "binds.read"]);
	fireEvent.click(screen.getByRole("option", { name: "Создать бинд" }));
	expect(useModalStore.getState().activeModal).toEqual({
		type: "createBind",
		payload: { categoryId: "payments", folderId: "deposits" },
	});
	expect(useKnowledgeStore.getState().binds).toEqual([source]);
	expect(mocks.navigate).not.toHaveBeenCalled();
	expect(mocks.contentApi).not.toHaveBeenCalled();
	expect(screen.queryByRole("listbox")).toBeNull();
});

it("keeps one keyboard sequence across commands, sections and content", () => {
	const input = setup();
	fireEvent.change(input, { target: { value: "материал" } });
	const list = screen.getByRole("listbox");
	const options = within(list).getAllByRole("option");
	for (let index = 0; index < options.length; index++) {
		expect(options[index].getAttribute("aria-selected")).toBe("true");
		fireEvent.keyDown(input, { key: "ArrowDown" });
	}
	expect(options[0].getAttribute("aria-selected")).toBe("true");
	fireEvent.keyDown(input, { key: "ArrowUp" });
	expect(options.at(-1)?.getAttribute("aria-selected")).toBe("true");
	fireEvent.keyDown(input, { key: "Enter" });
	expect(screen.getByRole("dialog", { name: "Материал клиента" })).toBeTruthy();
});

it("filters commands and executes the first match with Enter", () => {
	const input = setup();
	fireEvent.change(input, { target: { value: "открыть настройки" } });
	expect(screen.getAllByRole("option")).toHaveLength(1);
	expect(screen.queryByText(/Ничего не найдено/)).toBeNull();
	fireEvent.keyDown(input, { key: "Enter" });
	expect(mocks.navigate).toHaveBeenCalledWith({ to: "/settings", hash: "" });
});

it("preserves keyboard navigation for existing section-only searches", () => {
	const input = setup();
	fireEvent.change(input, { target: { value: "оформление" } });
	expect(screen.queryByRole("group", { name: "Команды" })).toBeNull();
	fireEvent.keyDown(input, { key: "Enter" });
	expect(mocks.navigate).toHaveBeenCalledWith({
		to: "/settings",
		hash: "appearance",
	});
});

it("hides unauthorized commands and reacts to permission revocation while open", () => {
	const input = setup(["work", "binds.read"]);
	expect(
		screen
			.getAllByRole("option")
			.map((option) => option.getAttribute("aria-label")),
	).toEqual(["Открыть настройки", "Создать бинд"]);
	fireEvent.keyDown(input, { key: "ArrowDown" });
	act(() => setAccess(["work"]));
	expect(screen.queryByRole("option", { name: "Создать бинд" })).toBeNull();
	fireEvent.keyDown(input, { key: "Enter" });
	expect(mocks.navigate).toHaveBeenCalledWith({ to: "/settings", hash: "" });
	expect(useModalStore.getState().activeModal).toBeNull();
});

it("shows the same commands inside the existing mobile dialog and restores scrolling", () => {
	setup();
	fireEvent.click(screen.getByRole("button", { name: "Поиск" }));
	const dialog = screen.getByRole("dialog", { name: "Поиск материалов" });
	expect(screen.getAllByRole("listbox")).toHaveLength(1);
	expect(within(dialog).getAllByRole("option")).toHaveLength(6);
	expect(document.body.style.overflow).toBe("hidden");
	const input = within(dialog).getByRole("textbox", {
		name: "Глобальный поиск",
	});
	fireEvent.change(input, { target: { value: "новый бинд" } });
	fireEvent.keyDown(input, { key: "Enter" });
	expect(useModalStore.getState().activeModal?.type).toBe("createBind");
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(document.body.style.overflow).toBe("");
});

it("rechecks access when a command is clicked before the UI rerenders", () => {
	setup();
	const create = screen.getByRole("option", { name: "Создать бинд" });
	act(() => {
		setAccess(fullPermissions, "disabled");
		fireEvent.click(create);
	});
	expect(useModalStore.getState().activeModal).toBeNull();
	expect(mocks.navigate).not.toHaveBeenCalled();
	expect(screen.queryByRole("group", { name: "Команды" })).toBeNull();
});

it("can reopen with Ctrl+K after executing a command without losing input focus", () => {
	const input = setup(["work", "binds.read"]);
	input.focus();
	fireEvent.click(screen.getByRole("option", { name: "Открыть настройки" }));
	expect(screen.queryByRole("listbox")).toBeNull();
	fireEvent.keyDown(window, { ctrlKey: true, key: "k", code: "KeyK" });
	expect(screen.getByRole("group", { name: "Команды" })).toBeTruthy();
});

it("uses the existing Ctrl+K search entry and Escape close behavior", () => {
	setup(["work", "binds.read"]);
	const input = screen.getByRole("textbox", { name: "Глобальный поиск" });
	fireEvent.keyDown(input, { key: "Escape" });
	expect(screen.queryByRole("listbox")).toBeNull();
	fireEvent.keyDown(window, { ctrlKey: true, key: "k", code: "KeyK" });
	expect(document.activeElement).toBe(input);
	expect(screen.getByRole("group", { name: "Команды" })).toBeTruthy();
});

it("opens the existing search with / without stealing text entry or modal shortcuts", () => {
	const input = setup(["work", "binds.read"]);
	fireEvent.keyDown(input, { key: "Escape" });
	fireEvent.keyDown(window, { key: "/", code: "Slash" });
	expect(document.activeElement).toBe(input);
	expect(screen.getByRole("group", { name: "Команды" })).toBeTruthy();
	fireEvent.keyDown(input, { key: "Escape" });
	const field = render(<textarea aria-label="Текст клиента" />);
	const textarea = field.getByRole("textbox", { name: "Текст клиента" });
	textarea.focus();
	expect(fireEvent.keyDown(textarea, { key: "/", code: "Slash" })).toBe(true);
	expect(document.activeElement).toBe(textarea);
	expect(screen.queryByRole("listbox")).toBeNull();
	field.unmount();
	render(<div role="dialog" aria-modal="true" />);
	fireEvent.keyDown(window, { key: "/", code: "Slash" });
	fireEvent.keyDown(window, { ctrlKey: true, code: "KeyK" });
	expect(screen.queryByRole("listbox")).toBeNull();
});

const multilingual: Bind = {
	...source,
	translations: [
		...source.translations,
		{
			language: "en",
			title: "Customer material",
			content: "Customer reply",
			updatedAt: "2026-10-16",
		},
		{
			language: "de",
			title: "Kundenmaterial",
			content: "Antwort an den Kunden",
			updatedAt: "2026-10-16",
		},
	],
};

it("switches and copies the preview language with binds.read alone, without navigation or editing the bind", () => {
	useKnowledgeStore.setState({ binds: [multilingual] });
	const input = setup(["work", "binds.read"]);
	fireEvent.change(input, { target: { value: "материал клиента" } });
	fireEvent.click(screen.getByRole("option", { name: /Материал клиента/ }));
	const dialog = screen.getByRole("dialog", { name: "Материал клиента" });
	const languages = within(dialog).getByRole("group", {
		name: "Язык материала",
	});
	expect(
		within(languages)
			.getByRole("button", { name: "Русский (RU)" })
			.getAttribute("aria-pressed"),
	).toBe("true");
	fireEvent.click(
		within(languages).getByRole("button", { name: "Английский (EN)" }),
	);
	expect(screen.getByRole("dialog", { name: "Customer material" })).toBe(
		dialog,
	);
	expect(within(dialog).getByText("Customer reply")).toBeTruthy();
	expect(within(dialog).queryByText("Ответ клиенту")).toBeNull();
	fireEvent.click(within(dialog).getByRole("button", { name: "Копировать" }));
	expect(mocks.copyToClipboard).toHaveBeenLastCalledWith("Customer reply");
	fireEvent.click(
		within(languages).getByRole("button", { name: "Немецкий (DE)" }),
	);
	expect(screen.getByRole("dialog", { name: "Kundenmaterial" })).toBe(dialog);
	expect(within(dialog).getByText("Antwort an den Kunden")).toBeTruthy();
	fireEvent.click(within(dialog).getByRole("button", { name: "Копировать" }));
	expect(mocks.copyToClipboard).toHaveBeenLastCalledWith(
		"Antwort an den Kunden",
	);
	expect(useKnowledgeStore.getState().language).toBe("ru");
	expect(useKnowledgeStore.getState().binds).toEqual([multilingual]);
	expect(mocks.navigate).not.toHaveBeenCalled();
	act(() => setAccess(["work"]));
	expect(screen.queryByRole("dialog")).toBeNull();
});

it("resets to the workspace language when reopening a result from mobile search", () => {
	useKnowledgeStore.setState({ binds: [multilingual], language: "en" });
	setup(["work", "binds.read"]);
	const openMobilePreview = () => {
		fireEvent.click(screen.getByRole("button", { name: "Поиск" }));
		const search = screen.getByRole("dialog", { name: "Поиск материалов" });
		fireEvent.change(
			within(search).getByRole("textbox", { name: "Глобальный поиск" }),
			{ target: { value: "Customer material" } },
		);
		fireEvent.click(
			within(search).getByRole("option", { name: /Customer material/ }),
		);
	};
	openMobilePreview();
	let preview = screen.getByRole("dialog", { name: "Customer material" });
	expect(screen.getAllByRole("dialog")).toHaveLength(1);
	fireEvent.click(
		within(preview).getByRole("button", { name: "Русский (RU)" }),
	);
	expect(within(preview).getByText("Ответ клиенту")).toBeTruthy();
	fireEvent.keyDown(window, { key: "Escape" });
	openMobilePreview();
	preview = screen.getByRole("dialog", { name: "Customer material" });
	expect(
		within(preview)
			.getByRole("button", { name: "Английский (EN)" })
			.getAttribute("aria-pressed"),
	).toBe("true");
	expect(within(preview).getByText("Customer reply")).toBeTruthy();
});

it("uses the same available fallback for the preview title and text and omits empty translations", () => {
	useKnowledgeStore.setState({
		language: "de",
		binds: [
			{
				...multilingual,
				translations: [
					multilingual.translations[1],
					multilingual.translations[0],
					{ ...multilingual.translations[2], content: "  " },
				],
			},
		],
	});
	const input = setup(["work", "binds.read"]);
	fireEvent.change(input, { target: { value: "материал клиента" } });
	fireEvent.click(screen.getByRole("option", { name: /Kundenmaterial/ }));
	const dialog = screen.getByRole("dialog", { name: "Материал клиента" });
	expect(within(dialog).getByText("Ответ клиенту")).toBeTruthy();
	expect(
		within(dialog).queryByRole("button", { name: "Немецкий (DE)" }),
	).toBeNull();
	expect(
		within(dialog)
			.getByRole("button", { name: "Русский (RU)" })
			.getAttribute("aria-pressed"),
	).toBe("true");
});

it("also switches multilingual bonus previews while keeping single-language binds usable", () => {
	client.setQueryData(["search-bonuses", "test"], {
		data: [
			{
				id: "project",
				name: "Example",
				slug: "example",
				updatedAt: "",
				bonuses: [
					{
						id: "welcome",
						name: "Welcome",
						content: "Бонус",
						order: 0,
						translations: [
							{ language: "ru", content: "Бонус", updatedAt: "" },
							{ language: "en", content: "Deposit reward", updatedAt: "" },
						],
					},
				],
			},
		],
	});
	const input = setup();
	fireEvent.change(input, { target: { value: "Example Welcome" } });
	fireEvent.click(screen.getByRole("option", { name: /Example · Welcome/ }));
	let dialog = screen.getByRole("dialog", { name: "Example · Welcome" });
	fireEvent.click(
		within(dialog).getByRole("button", { name: "Английский (EN)" }),
	);
	expect(within(dialog).getByText("Deposit reward")).toBeTruthy();
	fireEvent.click(within(dialog).getByRole("button", { name: "Копировать" }));
	expect(mocks.copyToClipboard).toHaveBeenLastCalledWith("Deposit reward");
	fireEvent.keyDown(window, { key: "Escape" });
	fireEvent.focus(input);
	fireEvent.change(input, { target: { value: "материал клиента" } });
	fireEvent.click(screen.getByRole("option", { name: /Материал клиента/ }));
	dialog = screen.getByRole("dialog", { name: "Материал клиента" });
	expect(
		within(dialog).getAllByRole("button", { name: /\(RU\)/ }),
	).toHaveLength(1);
	expect(within(dialog).getByText("Ответ клиенту")).toBeTruthy();
	fireEvent.click(
		within(dialog).getByRole("button", { name: "Открыть раздел" }),
	);
	expect(useKnowledgeStore.getState().selectedBind).toBe(source.id);
	expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
	expect(screen.queryByRole("dialog")).toBeNull();
});
