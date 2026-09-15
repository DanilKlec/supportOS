// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { knowledgeService } from "@/services/knowledge.service";
import { ModalRoot } from "@/shared/modals/ModalRoot";
import { modalManager, useModalStore } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";
import { Sidebar } from "@/widgets/Sidebar/Sidebar";
import { Tree } from "@/widgets/Sidebar/Tree";
import { BindViewer } from "./BindViewer";

vi.mock("@/features/shared-binds/WorkspaceSharedBinds", () => ({
	WorkspaceSharedTree: () => null,
}));
const mock = vi.hoisted(() => ({
	session: {
		user: {
			id: "u",
			access: { status: "active", permissions: ["knowledge.write"] },
		},
	},
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { getSession: () => mock.session },
}));
vi.mock("@/services/cloud-knowledge.service", () => ({
	cloudKnowledgeService: new Proxy({}, { get: () => vi.fn() }),
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
const initial = useKnowledgeStore.getState();
beforeEach(() => {
	useKnowledgeStore.setState({
		...initial,
		categories: [],
		folders: [],
		binds: [],
		remoteBinds: [],
		tree: [],
		expandedFolders: [],
		openedTabs: [],
		pinnedTabs: [],
		selectedBind: undefined,
		activeTab: undefined,
		selectedFolder: undefined,
		selectedCategory: undefined,
	});
	mock.session.user.access.permissions = ["knowledge.write"];
});
afterEach(() => {
	cleanup();
	useModalStore.setState({ activeModal: null });
	useKnowledgeStore.setState(initial);
	vi.restoreAllMocks();
});
function Workspace() {
	const tree = useKnowledgeStore((s) => s.tree);
	return (
		<>
			<div
				data-testid="scrolling-tree"
				style={{ overflow: "hidden", height: 200 }}
			>
				<Tree nodes={tree} />
			</div>
			<BindViewer />
			<ModalRoot />
		</>
	);
}
function field(name: string, value: string, role = "textbox") {
	fireEvent.change(
		within(screen.getByRole("group", { name })).getByRole(role),
		{ target: { value } },
	);
}
function treeAction(name: string, action: string) {
	fireEvent.click(screen.getByRole("button", { name: `Действия: ${name}` }));
	fireEvent.click(
		within(screen.getByRole("menu")).getByRole("button", { name: action }),
	);
}
function viewerAction(name: string) {
	fireEvent.click(screen.getByRole("button", { name: "Действия бинда" }));
	fireEvent.click(
		within(screen.getByRole("menu")).getByRole("menuitem", { name }),
	);
}
function category(name: string) {
	act(() => modalManager.open("createCategory"));
	field("Название", name);
	fireEvent.click(screen.getByRole("button", { name: "Создать" }));
	return useKnowledgeStore.getState().categories.at(-1)!;
}
it("creates nested content through menus, edits Viewer and Tree, moves to category root and archives without reload", () => {
	render(<Workspace />);
	const cat = category("Работа");
	treeAction("Работа", "Новая папка");
	field("Название", "Финансы");
	fireEvent.click(screen.getByRole("button", { name: "Создать" }));
	treeAction("Финансы", "Новая папка");
	field("Название", "Вывод");
	fireEvent.click(screen.getByRole("button", { name: "Создать" }));
	const child = useKnowledgeStore
		.getState()
		.folders.find((f) => f.name === "Вывод")!;
	expect(child.parentId).toBe(
		useKnowledgeStore.getState().folders.find((f) => f.name === "Финансы")?.id,
	);
	treeAction("Вывод", "Новый бинд");
	field("Заголовок", "Выплата");
	field("Содержание", "Проверьте статус выплаты.");
	fireEvent.click(screen.getByRole("button", { name: "Создать" }));
	const bind = useKnowledgeStore.getState().binds[0];
	expect(bind.folderId).toBe(child.id);
	expect(bind.categoryId).toBe(cat.id);
	expect(
		screen.getByRole("heading", { level: 1, name: "Выплата" }),
	).toBeTruthy();
	viewerAction("Редактировать");
	field("Заголовок", "Обновлённая выплата");
	fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
	expect(
		screen.getByRole("heading", { name: "Обновлённая выплата" }),
	).toBeTruthy();
	expect(
		screen.getByRole("button", { name: "Действия: Обновлённая выплата" }),
	).toBeTruthy();
	viewerAction("Переместить");
	fireEvent.change(screen.getByLabelText("Куда переместить"), {
		target: { value: JSON.stringify([cat.id, ""]) },
	});
	fireEvent.click(screen.getByRole("button", { name: "Переместить" }));
	expect(useKnowledgeStore.getState().selectedBind).toBe(bind.id);
	expect(useKnowledgeStore.getState().selectedFolder).toBeUndefined();
	expect(useKnowledgeStore.getState().binds[0].folderId).toBeUndefined();
	viewerAction("Архивировать");
	fireEvent.click(screen.getByRole("button", { name: "Архивировать" }));
	expect(useKnowledgeStore.getState().binds[0].archived).toBe(true);
	expect(useKnowledgeStore.getState().activeTab).toBeUndefined();
	act(() => {
		knowledgeService.restoreArchivedBind(bind.id);
		useKnowledgeStore.getState().openBind(bind.id);
	});
	expect(
		screen.getByRole("heading", { name: "Обновлённая выплата" }),
	).toBeTruthy();
});
it("portals tree menus outside sidebar clipping and supports folder rename, move, count and delete", () => {
	render(<Workspace />);
	const a = category("A"),
		b = category("B");
	let parent: string, child: string;
	act(() => {
		parent = knowledgeService.createFolder({
			categoryId: a.id,
			name: "Parent",
		}).id;
		child = knowledgeService.createFolder({
			categoryId: a.id,
			parentId: parent,
			name: "Child",
		}).id;
	});
	fireEvent.click(screen.getByRole("button", { name: "Действия: Parent" }));
	expect(screen.getByRole("menu").parentElement).toBe(document.body);
	expect(
		screen.getByTestId("scrolling-tree").contains(screen.getByRole("menu")),
	).toBe(false);
	fireEvent.click(
		within(screen.getByRole("menu")).getByRole("button", {
			name: "Переместить",
		}),
	);
	expect(
		(screen.getByRole("option", { name: /↳ Parent/ }) as HTMLOptionElement)
			.disabled,
	).toBe(true);
	expect(
		(screen.getByRole("option", { name: /↳ Child/ }) as HTMLOptionElement)
			.disabled,
	).toBe(true);
	fireEvent.change(screen.getByLabelText("Куда переместить"), {
		target: { value: JSON.stringify([b.id, ""]) },
	});
	fireEvent.click(screen.getByRole("button", { name: "Переместить" }));
	expect(
		useKnowledgeStore.getState().folders.find((f) => f.id === child)
			?.categoryId,
	).toBe(b.id);
	treeAction("Parent", "Переименовать");
	field("Название", "Переименована");
	fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
	treeAction("Переименована", "Удалить");
	expect(screen.getByText("Будет удалено папок: 2, биндов: 0.")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
	expect(useKnowledgeStore.getState().folders).toHaveLength(0);
	expect(useKnowledgeStore.getState().selectedCategory).toBe(b.id);
});
it("moves multiple binds with one target, expands all ancestors and prevents folder cycles", () => {
	render(<Workspace />);
	const cat = category("A");
	let parent = "",
		child = "",
		ids: string[] = [];
	act(() => {
		parent = knowledgeService.createFolder({
			categoryId: cat.id,
			name: "Parent",
		}).id;
		child = knowledgeService.createFolder({
			categoryId: cat.id,
			parentId: parent,
			name: "Child",
		}).id;
		ids = ["One", "Two"].map(
			(title) =>
				knowledgeService.createBind({
					categoryId: cat.id,
					title,
					content: "Text",
				}).id,
		);
		useKnowledgeStore.setState({ expandedFolders: [] });
		modalManager.open("moveBind", { bindIds: ids });
	});
	fireEvent.change(screen.getByLabelText("Куда переместить"), {
		target: { value: JSON.stringify([cat.id, child]) },
	});
	fireEvent.click(screen.getByRole("button", { name: "Переместить" }));
	expect(
		useKnowledgeStore.getState().binds.every((b) => b.folderId === child),
	).toBe(true);
	expect(useKnowledgeStore.getState().expandedFolders).toEqual(
		expect.arrayContaining([cat.id, parent, child]),
	);
	expect(useKnowledgeStore.getState().selectedBind).toBe(ids[1]);
	expect(() =>
		knowledgeService.moveFolderTo(parent, {
			categoryId: cat.id,
			parentId: parent,
		}),
	).toThrow();
	expect(() =>
		knowledgeService.moveFolderTo(parent, {
			categoryId: cat.id,
			parentId: child,
		}),
	).toThrow();
});
it("renames, reorders and deletes categories through existing actions", () => {
	render(<Workspace />);
	category("A");
	const b = category("B");
	treeAction("B", "Выше");
	expect(
		[...useKnowledgeStore.getState().categories].sort(
			(a, b) => a.order - b.order,
		)[0].id,
	).toBe(b.id);
	treeAction("B", "Переименовать");
	field("Название", "BB");
	fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
	treeAction("BB", "Удалить");
	fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
	expect(useKnowledgeStore.getState().categories.map((c) => c.name)).toEqual([
		"A",
	]);
});
it("creates a personal override when moving shared local content and rejects remote-only ids", () => {
	const cat = knowledgeService.createCategory({ name: "A" });
	const common = knowledgeService.createBind({
		categoryId: cat.id,
		title: "Common",
		content: "Text",
		ownerId: null,
	});
	const folder = knowledgeService.createFolder({
		categoryId: cat.id,
		name: "Target",
	});
	mock.session.user.access.permissions = [];
	const moved = knowledgeService.moveBind(common.id, {
		categoryId: cat.id,
		folderId: folder.id,
	});
	expect(moved.id).not.toBe(common.id);
	expect(moved.ownerId).toBe("u");
	expect(moved.sourceBindId).toBe(common.id);
	expect(common.folderId).toBeUndefined();
	expect(() =>
		knowledgeService.moveBind("remote-only", { categoryId: cat.id }),
	).toThrow();
});
it("offers bulk move from real tree selection and keeps drag and drop working", () => {
	const cat = knowledgeService.createCategory({ name: "A" });
	const target = knowledgeService.createFolder({
		categoryId: cat.id,
		name: "Target",
	});
	const ids = ["One", "Two"].map(
		(title) =>
			knowledgeService.createBind({
				categoryId: cat.id,
				title,
				content: "Text",
			}).id,
	);
	render(
		<>
			<Sidebar />
			<ModalRoot />
		</>,
	);
	for (const button of screen.getAllByTitle("Выделить бинд"))
		fireEvent.click(button);
	fireEvent.click(
		screen.getByRole("button", { name: "Переместить выбранные" }),
	);
	fireEvent.change(screen.getByLabelText("Куда переместить"), {
		target: { value: JSON.stringify([cat.id, target.id]) },
	});
	fireEvent.click(screen.getByRole("button", { name: "Переместить" }));
	expect(
		useKnowledgeStore.getState().binds.every((b) => b.folderId === target.id),
	).toBe(true);
	const dataTransfer = {
		types: ["application/x-supportos-bind"],
		getData: () => JSON.stringify({ type: "bind", id: ids[0], ids: [ids[0]] }),
		dropEffect: "move",
	};
	fireEvent.drop(screen.getByRole("button", { name: "A" }), { dataTransfer });
	expect(
		useKnowledgeStore.getState().binds.find((b) => b.id === ids[0])?.folderId,
	).toBeUndefined();
});
it("keeps duplicate, favorite, pin, history and duplicate search reachable from the viewer", () => {
	const cat = knowledgeService.createCategory({ name: "A" });
	knowledgeService.createBind({
		categoryId: cat.id,
		title: "Reply",
		content: "Original",
	});
	render(<Workspace />);
	viewerAction("В избранное");
	expect(useKnowledgeStore.getState().binds[0].favorite).toBe(true);
	viewerAction("Закрепить");
	expect(useKnowledgeStore.getState().binds[0].pinned).toBe(true);
	viewerAction("Дублировать");
	expect(useKnowledgeStore.getState().binds).toHaveLength(2);
	viewerAction("История");
	expect(screen.getByRole("dialog")).toBeTruthy();
	act(() => modalManager.close());
	viewerAction("Найти дубликаты");
	expect(screen.getByRole("dialog", { name: "Найти дубликаты" })).toBeTruthy();
});
it("hides destructive shared folder actions and prevents moving shared structure without permission", () => {
	const cat = knowledgeService.createCategory({ name: "Shared" }),
		folder = knowledgeService.createFolder({
			categoryId: cat.id,
			name: "Public",
			ownerId: null,
		});
	mock.session.user.access.permissions = [];
	render(<Workspace />);
	fireEvent.click(screen.getByRole("button", { name: "Действия: Public" }));
	const menu = within(screen.getByRole("menu"));
	expect(menu.queryByRole("button", { name: "Переместить" })).toBeNull();
	expect(menu.queryByRole("button", { name: "Удалить" })).toBeNull();
	expect(menu.queryByRole("button", { name: "Переименовать" })).toBeNull();
	expect(menu.getByRole("button", { name: "Новый бинд" })).toBeTruthy();
	expect(() =>
		knowledgeService.moveFolderTo(folder.id, { categoryId: cat.id }),
	).toThrow("Нет права");
});
