// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildKnowledgeTree } from "@/entities/knowledge";
import { useKnowledgeStore } from "@/store";
const mock = vi.hoisted(() => ({
	navigate: vi.fn(),
	canManageStructure: vi.fn(() => true),
	moveBind: vi.fn((id: string) => ({ id })),
	transferBinds: vi.fn(async () => ({ binds: [], replacements: {} })),
	moveFolderTo: vi.fn(),
	showToast: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mock.navigate }));
vi.mock("@/services/knowledge.service", () => ({ knowledgeService: mock }));
vi.mock("@/shared/hooks/useToast", () => ({ useToast: () => mock }));
import { Tree } from "./Tree";
const categories = [
	{ id: "cat", name: "Материалы", order: 1, ownerId: "owner" },
];
const folders = [
	{
		id: "source",
		name: "Исходная",
		categoryId: "cat",
		order: 1,
		ownerId: "owner",
	},
	{
		id: "destination",
		name: "Новая папка",
		categoryId: "cat",
		order: 2,
		ownerId: "owner",
	},
];
const binds = ["one", "two"].map((id) => ({
	id,
	ownerId: "owner",
	slug: id,
	categoryId: "cat",
	folderId: "source",
	tags: [],
	translations: [
		{ language: "ru", title: "Ответ " + id, content: "Текст", updatedAt: "" },
		{ language: "en", title: "Answer " + id, content: "Text", updatedAt: "" },
	],
	favorite: false,
	archived: false,
	createdAt: "",
	updatedAt: "",
}));
beforeEach(() => {
	vi.clearAllMocks();
	useKnowledgeStore.setState({
		categories,
		folders,
		binds,
		remoteBinds: [],
		expandedFolders: ["cat", "source"],
		selectedBind: undefined,
		activeTab: undefined,
		selectedCategory: undefined,
		selectedFolder: undefined,
		language: "ru",
		favoriteFolders: [],
	});
});
afterEach(() => cleanup());
function mount(ids: string[] = []) {
	const toggle = vi.fn();
	render(
		<Tree
			nodes={buildKnowledgeTree(categories, folders, binds)}
			selectedBindIds={ids}
			onToggleBindSelection={toggle}
		/>,
	);
	return toggle;
}
function transfer() {
	const data = new Map<string, string>();
	return {
		setData: (type: string, value: string) => data.set(type, value),
		getData: (type: string) => data.get(type) ?? "",
		get types() {
			return [...data.keys()];
		},
		setDragImage: vi.fn(),
		effectAllowed: "",
		dropEffect: "",
	};
}
it("expands independently from navigation, supports arrow keys, and opens the localized bind", () => {
	mount();
	const folder = within(screen.getByRole("treeitem", { name: "Новая папка" }));
	fireEvent.click(folder.getByRole("button", { name: "Раскрыть Новая папка" }));
	expect(useKnowledgeStore.getState().expandedFolders).toContain("destination");
	expect(mock.navigate).not.toHaveBeenCalled();
	const first = screen.getByRole("button", { name: "Ответ one" });
	first.focus();
	fireEvent.keyDown(first, { key: "ArrowDown" });
	expect(document.activeElement).toBe(
		screen.getByRole("button", { name: "Ответ two" }),
	);
	fireEvent.click(first);
	expect(useKnowledgeStore.getState().activeTab).toBe("one");
	expect(mock.navigate).toHaveBeenCalledWith({ to: "/" });
	expect(
		screen
			.getByRole("treeitem", { name: "Ответ one" })
			.getAttribute("aria-selected"),
	).toBe("true");
	expect(
		screen
			.getByRole("treeitem", { name: "Материалы" })
			.getAttribute("aria-selected"),
	).toBe("false");
});
it("retains multi-selection dragging and moves every selected bind to the destination", async () => {
	const toggle = mount(["one", "two"]);
	fireEvent.click(
		screen.getByRole("button", { name: "Снять выделение: Ответ one" }),
	);
	expect(toggle).toHaveBeenCalledWith("one");
	expect(useKnowledgeStore.getState().activeTab).not.toBe("one");
	const dataTransfer = transfer();
	fireEvent.dragStart(screen.getByRole("button", { name: "Ответ one" }), {
		dataTransfer,
	});
	expect(
		JSON.parse(dataTransfer.getData("application/x-supportos-bind")),
	).toMatchObject({ id: "one", ids: ["one", "two"] });
	fireEvent.drop(
		screen
			.getByRole("button", { name: "Новая папка" })
			.closest(".workspace-tree-row")!,
		{ dataTransfer },
	);
	expect(mock.transferBinds).toHaveBeenCalledWith(
		["one", "two"],
		{ categoryId: "cat", folderId: "destination" },
		undefined,
	);
});
it("retains folder dragging into another folder", () => {
	mount();
	const dataTransfer = transfer();
	fireEvent.dragStart(screen.getByRole("button", { name: "Исходная" }), {
		dataTransfer,
	});
	fireEvent.drop(
		screen
			.getByRole("button", { name: "Новая папка" })
			.closest(".workspace-tree-row")!,
		{ dataTransfer },
	);
	expect(mock.moveFolderTo).toHaveBeenCalledWith("source", {
		categoryId: "cat",
		parentId: "destination",
	});
});
it("closes the action menu on outside focus or pointer and returns focus on Escape", () => {
	mount();
	const trigger = screen.getByRole("button", { name: "Действия: Ответ one" });
	fireEvent.click(trigger);
	expect(screen.getByRole("menu")).toBeTruthy();
	fireEvent.pointerDown(document.body);
	expect(screen.queryByRole("menu")).toBeNull();
	fireEvent.click(trigger);
	fireEvent.keyDown(window, { key: "Escape" });
	expect(screen.queryByRole("menu")).toBeNull();
	expect(document.activeElement).toBe(trigger);
	fireEvent.click(trigger);
	fireEvent.focusIn(screen.getByRole("button", { name: "Ответ two" }));
	expect(screen.queryByRole("menu")).toBeNull();
});
