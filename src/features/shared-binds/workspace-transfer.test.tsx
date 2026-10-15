// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { knowledgeService } from "@/services/knowledge.service";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { useBindLinksStore } from "@/store/bind-links.store";
import { ModalRoot } from "@/shared/modals/ModalRoot";
import { useModalStore } from "@/shared/modals/modal.store";
import { Sidebar } from "@/widgets/Sidebar/Sidebar";
import { WorkspaceSharedBindsSync } from "./WorkspaceSharedBinds";

const mock = vi.hoisted(() => ({
	fetch: vi.fn(),
	list: vi.fn(),
	personal: vi.fn(),
	toast: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouterState: () => "/",
}));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.fetch,
}));
vi.mock("@/services/supabase.service", async () => {
	const { useAuthStore } = await import("@/store/auth.store");
	return {
		supabaseService: { getSession: () => useAuthStore.getState().session },
	};
});
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: {
		list: mock.list,
		personal: mock.personal,
		branches: async () => ({ choices: {}, incoming: [], outgoing: [] }),
	},
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: mock.toast }),
}));

const initial = useKnowledgeStore.getState(),
	auth = useAuthStore.getState();
const categories = [
	{ id: "cat", name: "Материалы", ownerId: null, order: 1 },
	{ id: "private", name: "Личные ответы", ownerId: "actor", order: 2 },
];
const folders = [
	{ id: "old", name: "Исходная", categoryId: "cat", ownerId: null, order: 1 },
	{
		id: "new",
		name: "Новая папка",
		categoryId: "cat",
		ownerId: null,
		order: 2,
	},
];
let rows: Bind[],
	clients: QueryClient[] = [];
beforeEach(() => {
	vi.clearAllMocks();
	rows = ["a", "b", "c"].map((id, i) => ({
		id,
		slug: id,
		ownerId: null,
		categoryId: "cat",
		folderId: i === 2 ? "new" : "old",
		order: i + 1,
		tags: [],
		translations: [
			{
				language: "ru",
				title: "Ответ " + id,
				content: "Текст " + id,
				updatedAt: "",
			},
		],
		favorite: false,
		archived: false,
		createdAt: "",
		updatedAt: "",
	}));
	useAuthStore.setState({
		session: {
			user: {
				id: "actor",
				access: {
					status: "active",
					permissions: ["binds.read", "knowledge.write"],
				},
			},
		} as never,
	});
	useBindLinksStore.setState({ accounts: {} });
	useModalStore.setState({ activeModal: null });
	useKnowledgeStore.setState({
		...initial,
		remoteBinds: [],
		expandedFolders: ["cat", "old", "new", "private"],
		language: "ru",
	});
	useKnowledgeStore
		.getState()
		.setKnowledge({ categories, folders, binds: rows });
	mock.list.mockImplementation(async () =>
		rows.filter((b) => b.ownerId === null).map((b) => ({ ...b })),
	);
	mock.personal.mockImplementation(async () =>
		rows.filter((b) => b.ownerId === "actor").map((b) => ({ ...b })),
	);
});
afterEach(() => {
	cleanup();
	clients.forEach((c) => c.clear());
	clients = [];
	useKnowledgeStore.setState(initial);
	useAuthStore.setState(auth);
	useBindLinksStore.setState({ accounts: {} });
});
function mount() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	clients.push(client);
	const view = render(
		<QueryClientProvider client={client}>
			<WorkspaceSharedBindsSync />
			<Sidebar />
			<ModalRoot />
		</QueryClientProvider>,
	);
	return { ...view, client };
}
function drag(id: string, target: string) {
	const data = new Map<string, string>();
	const dataTransfer = {
		setData: (k: string, v: string) => data.set(k, v),
		getData: (k: string) => data.get(k) ?? "",
		get types() {
			return [...data.keys()];
		},
		setDragImage: vi.fn(),
		effectAllowed: "",
		dropEffect: "",
	};
	fireEvent.dragStart(screen.getByRole("button", { name: "Ответ " + id }), {
		dataTransfer,
	});
	fireEvent.dragEnter(
		screen
			.getByRole("button", { name: target })
			.closest(".workspace-tree-row")!,
		{ dataTransfer },
	);
	fireEvent.drop(
		screen
			.getByRole("button", { name: target })
			.closest(".workspace-tree-row")!,
		{ dataTransfer },
	);
}
function children(name: string) {
	return within(screen.getByRole("treeitem", { name }))
		.queryAllByRole("treeitem")
		.map((e) => e.getAttribute("aria-label"));
}
it("renders confirmed moves and sibling order in the real shared tree immediately and after refetch/reload", async () => {
	const { client, unmount } = mount();
	await screen.findByRole("button", { name: "Ответ a" });
	let finish!: (response: Response) => void;
	mock.fetch.mockImplementationOnce(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	drag("a", "Новая папка");
	await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(1));
	expect(children("Исходная")).toContain("Ответ a");
	expect(mock.toast).not.toHaveBeenCalled();
	expect(JSON.parse(mock.fetch.mock.calls[0][1].body)).toMatchObject({
		action: "knowledge-transfer",
		payload: {
			sources: [{ id: "a", categoryId: "cat", folderId: "old" }],
			categoryId: "cat",
			folderId: "new",
		},
	});
	rows = rows.map((b) => ({
		...b,
		folderId: b.id === "a" ? "new" : b.folderId,
		order: b.id === "a" ? 2 : b.id === "c" ? 1 : b.order,
	}));
	await act(async () =>
		finish(
			new Response(
				JSON.stringify({
					binds: rows.filter((b) => b.folderId === "new"),
					replacements: {},
				}),
			),
		),
	);
	await waitFor(() =>
		expect(children("Новая папка")).toEqual(["Ответ c", "Ответ a"]),
	);
	expect(children("Исходная")).not.toContain("Ответ a");
	expect(
		client
			.getQueryData<Bind[]>(["shared-binds", "actor"])
			?.find((b) => b.id === "a")?.folderId,
	).toBe("new");
	mock.fetch.mockImplementationOnce(async () => {
		rows = rows.map((b) => ({
			...b,
			order: b.id === "a" ? 1 : b.id === "c" ? 2 : b.order,
		}));
		return new Response(
			JSON.stringify({
				binds: rows.filter((b) => b.folderId === "new"),
				replacements: {},
			}),
		);
	});
	drag("a", "Ответ c");
	await waitFor(() =>
		expect(children("Новая папка")).toEqual(["Ответ a", "Ответ c"]),
	);
	await act(async () => {
		await client.invalidateQueries({ queryKey: ["shared-binds", "actor"] });
	});
	expect(children("Новая папка")).toEqual(["Ответ a", "Ответ c"]);
	unmount();
	useKnowledgeStore
		.getState()
		.setKnowledge({ categories, folders, binds: rows });
	mount();
	await screen.findByRole("button", { name: "Ответ a" });
	expect(children("Новая папка")).toEqual(["Ответ a", "Ответ c"]);
});
it("keeps the existing tree and reports a failed save instead of announcing a move", async () => {
	mount();
	await screen.findByRole("button", { name: "Ответ a" });
	mock.fetch.mockResolvedValueOnce(
		new Response(
			JSON.stringify({ error: "Бинд уже перемещён другим сотрудником" }),
			{ status: 409 },
		),
	);
	drag("a", "Новая папка");
	await waitFor(() =>
		expect(mock.toast).toHaveBeenCalledWith(
			"Бинд уже перемещён другим сотрудником",
		),
	);
	expect(children("Исходная")).toContain("Ответ a");
	expect(children("Новая папка")).toEqual(["Ответ c"]);
	expect(
		useKnowledgeStore.getState().binds.find((b) => b.id === "a")?.folderId,
	).toBe("old");
});
it("moves a shared response into a personal branch without duplicating it or modifying the shared original", async () => {
	useAuthStore.setState({
		session: {
			user: {
				id: "actor",
				access: { status: "active", permissions: ["binds.read"] },
			},
		} as never,
	});
	const { client } = mount();
	await screen.findByRole("button", { name: "Ответ a" });
	const original = { ...rows[0] };
	mock.fetch.mockImplementationOnce(async () => {
		const personal = {
			...original,
			id: "personal-a",
			ownerId: "actor",
			sourceBindId: "a",
			categoryId: "private",
			folderId: undefined,
			order: 1,
		};
		rows.push(personal);
		return new Response(
			JSON.stringify({ binds: [personal], replacements: { a: "personal-a" } }),
		);
	});
	drag("a", "Личные ответы");
	await waitFor(() => expect(children("Личные ответы")).toEqual(["Ответ a"]));
	expect(screen.getAllByRole("button", { name: "Ответ a" })).toHaveLength(1);
	expect(rows.find((b) => b.id === "a")).toEqual(original);
	expect(useBindLinksStore.getState().accounts.actor.a).toBe("personal-a");
	await act(async () => {
		await client.invalidateQueries({ queryKey: ["shared-binds", "actor"] });
	});
	expect(screen.getAllByRole("button", { name: "Ответ a" })).toHaveLength(1);
});
it("does not apply a confirmed response to another account after a session switch", async () => {
	let finish!: (response: Response) => void;
	mock.fetch.mockImplementationOnce(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	const request = knowledgeService.transferBinds(["a"], {
		categoryId: "cat",
		folderId: "new",
	});
	const rejection = expect(request).rejects.toThrow("Аккаунт изменился");
	await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(1));
	useAuthStore.setState({ session: { user: { id: "another" } } as never });
	finish(
		new Response(
			JSON.stringify({
				binds: [{ ...rows[0], folderId: "new" }],
				replacements: {},
			}),
		),
	);
	await rejection;
	expect(
		useKnowledgeStore.getState().binds.find((b) => b.id === "a")?.folderId,
	).toBe("old");
});

it("creates a support bind from a common folder menu only in the personal tree, including after reload", async () => {
	useAuthStore.setState({
		session: {
			user: {
				id: "actor",
				role: "support",
				access: { status: "active", permissions: ["binds.read"] },
			},
		} as never,
	});
	const commonBefore = structuredClone(rows);
	mock.fetch.mockImplementation(async (_url, options) => {
		const body = JSON.parse(options.body);
		if (body.action !== "knowledge-save")
			throw new Error("Unexpected operation");
		rows.push(...body.binds);
		return new Response("{}");
	});
	const { unmount } = mount();
	await screen.findByRole("button", { name: "Ответ a" });
	fireEvent.click(screen.getByRole("button", { name: "Действия: Исходная" }));
	fireEvent.click(
		within(screen.getByRole("menu")).getByRole("button", {
			name: "Новый бинд",
		}),
	);
	fireEvent.change(
		within(screen.getByRole("group", { name: "Заголовок" })).getByRole(
			"textbox",
		),
		{ target: { value: "Мой новый ответ" } },
	);
	fireEvent.change(
		within(screen.getByRole("group", { name: "Содержание" })).getByRole(
			"textbox",
		),
		{ target: { value: "Личный текст сотрудника" } },
	);
	fireEvent.click(screen.getByRole("button", { name: "Создать" }));
	await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(1));
	expect(JSON.parse(mock.fetch.mock.calls[0][1].body).binds[0]).toMatchObject({
		ownerId: "actor",
		categoryId: "cat",
		folderId: "old",
	});
	expect(
		within(screen.getByRole("region", { name: "Общие бинды" })).queryByRole(
			"button",
			{ name: "Мой новый ответ" },
		),
	).toBeNull();
	expect(
		within(screen.getByRole("region", { name: "Личные материалы" })).getByRole(
			"button",
			{ name: "Мой новый ответ" },
		),
	).toBeTruthy();
	expect(rows.filter((b) => b.ownerId === null)).toEqual(commonBefore);
	unmount();
	useKnowledgeStore
		.getState()
		.setKnowledge({ categories, folders, binds: rows });
	mount();
	await screen.findByRole("button", { name: "Ответ a" });
	expect(
		within(screen.getByRole("region", { name: "Личные материалы" })).getByRole(
			"button",
			{ name: "Мой новый ответ" },
		),
	).toBeTruthy();
	expect(
		within(screen.getByRole("region", { name: "Общие бинды" })).queryByRole(
			"button",
			{ name: "Мой новый ответ" },
		),
	).toBeNull();
});

it("places a support move into a common folder only under the employee's personal tree", async () => {
	useAuthStore.setState({
		session: {
			user: {
				id: "actor",
				role: "support",
				access: { status: "active", permissions: ["binds.read"] },
			},
		} as never,
	});
	const original = structuredClone(rows);
	mock.fetch.mockImplementationOnce(async () => {
		const own = {
			...rows[0],
			id: "own-a",
			ownerId: "actor",
			sourceBindId: "a",
			folderId: "new",
			order: 1,
		};
		rows.push(own);
		return new Response(
			JSON.stringify({ binds: [own], replacements: { a: "own-a" } }),
		);
	});
	const { client } = mount();
	await screen.findByRole("button", { name: "Ответ a" });
	drag("a", "Новая папка");
	await waitFor(() =>
		expect(
			within(
				screen.getByRole("region", { name: "Личные материалы" }),
			).getByRole("button", { name: "Ответ a" }),
		).toBeTruthy(),
	);
	expect(
		within(screen.getByRole("region", { name: "Общие бинды" })).queryByRole(
			"button",
			{ name: "Ответ a" },
		),
	).toBeNull();
	expect(rows.filter((b) => b.ownerId === null)).toEqual(original);
	expect(client.getQueryData<Bind[]>(["shared-binds", "actor"])).toEqual(
		original,
	);
	await act(async () => {
		await client.invalidateQueries({ queryKey: ["shared-binds", "actor"] });
	});
	expect(
		within(screen.getByRole("region", { name: "Личные материалы" })).getByRole(
			"button",
			{ name: "Ответ a" },
		),
	).toBeTruthy();
});

it("uses the current cloud location when a colleague moved a common bind after local hydration", async () => {
	useKnowledgeStore.setState({
		remoteBinds: [{ ...rows[0], folderId: "new" }],
	});
	mock.fetch.mockResolvedValueOnce(
		new Response(
			JSON.stringify({
				binds: [{ ...rows[0], folderId: undefined }],
				replacements: {},
			}),
		),
	);
	await knowledgeService.transferBinds(["a"], { categoryId: "cat" });
	expect(JSON.parse(mock.fetch.mock.calls[0][1].body).payload.sources).toEqual([
		{ id: "a", categoryId: "cat", folderId: "new" },
	]);
});
