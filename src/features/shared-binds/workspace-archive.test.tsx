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
import { ArchivePage } from "@/routes/archive";
import { knowledgeService } from "@/services/knowledge.service";
import { ModalRoot } from "@/shared/modals/ModalRoot";
import { useModalStore } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { useBindLinksStore } from "@/store/bind-links.store";
import { Sidebar } from "@/widgets/Sidebar/Sidebar";
import { WorkspaceSharedBindsSync } from "./WorkspaceSharedBinds";

const mock = vi.hoisted(() => ({
	fetch: vi.fn(),
	navigate: vi.fn(),
	toast: vi.fn(),
}));
vi.mock("@/app/bootstrap", () => ({ bootstrapApp: async () => undefined }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
	useNavigate: () => mock.navigate,
	useRouterState: () => "/archive",
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
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: mock.toast }),
}));

const initial = useKnowledgeStore.getState(),
	initialAuth = useAuthStore.getState();
const category = { id: "cat", name: "Материалы", ownerId: null, order: 1 };
const makeBind = (
	id: string,
	ownerId: string | null,
	title: string,
	archived = false,
): Bind => ({
	id,
	ownerId,
	slug: id,
	categoryId: "cat",
	favorite: false,
	archived,
	tags: [],
	createdAt: "2026-10-01",
	updatedAt: "2026-10-19",
	translations: [
		{ language: "ru", title, content: "Русский личный текст", updatedAt: "" },
		{
			language: "en",
			title,
			content: "Personal English answer",
			updatedAt: "",
		},
	],
});
let rows: Bind[],
	clients: QueryClient[] = [];
beforeEach(() => {
	vi.clearAllMocks();
	useAuthStore.setState({
		session: {
			user: {
				id: "actor",
				access: { status: "active", permissions: ["binds.read"] },
			},
		} as never,
	});
	rows = [
		makeBind("base", null, "Общий исходник"),
		{ ...makeBind("own", "actor", "Личный ответ"), sourceBindId: "base" },
		makeBind("shared-archived", null, "Общий архив", true),
		makeBind("other", "other", "Чужой архив", true),
	];
	useBindLinksStore.setState({ accounts: {} });
	useKnowledgeStore.setState({
		...initial,
		remoteBinds: [],
		expandedFolders: ["cat"],
	});
	useKnowledgeStore.getState().setKnowledge({
		categories: [category],
		folders: [],
		binds: rows.filter((bind) => bind.id !== "base"),
	});
	useModalStore.setState({ activeModal: null });
	mock.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
		if (!init?.body)
			return Response.json({
				categories: [category],
				folders: [],
				binds: rows,
				branches: { choices: {}, incoming: [], outgoing: [] },
			});
		const body = JSON.parse(String(init.body));
		if (body.action === "personal-archive") {
			rows = rows.map((bind) =>
				bind.id === body.id
					? {
							...bind,
							archived: body.archived,
							favorite: false,
							updatedAt: "2026-10-19T12:00:00Z",
						}
					: bind,
			);
			return Response.json(rows.find((bind) => bind.id === body.id));
		}
		return Response.json({ ok: true });
	});
});
afterEach(() => {
	cleanup();
	clients.forEach((client) => client.clear());
	clients = [];
	useKnowledgeStore.setState(initial);
	useAuthStore.setState(initialAuth);
	useModalStore.setState({ activeModal: null });
	useBindLinksStore.setState({ accounts: {} });
});
function mount() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	clients.push(client);
	return {
		...render(
			<QueryClientProvider client={client}>
				<WorkspaceSharedBindsSync />
				<Sidebar />
				<ArchivePage />
				<ModalRoot />
			</QueryClientProvider>,
		),
		client,
	};
}

it("archives through the tree, survives reload, previews translations and restores the personal branch without changing its source", async () => {
	const first = mount();
	await waitFor(() =>
		expect(first.client.getQueryData(["shared-binds", "actor"])).toBeDefined(),
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Действия: Личный ответ" }),
	);
	fireEvent.click(
		within(screen.getByRole("menu")).getByRole("button", {
			name: "Архивировать",
		}),
	);
	fireEvent.click(
		within(screen.getByRole("dialog")).getByRole("button", {
			name: "Архивировать",
		}),
	);
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(rows.find((bind) => bind.id === "own")?.archived).toBe(true);
	expect(rows.find((bind) => bind.id === "base")?.archived).toBe(false);
	expect(
		screen.queryByRole("button", { name: "Действия: Личный ответ" }),
	).toBeNull();
	expect(
		screen.queryByRole("button", { name: "Действия: Общий исходник" }),
	).toBeNull();
	expect(
		first.client
			.getQueryData<Bind[]>(["personal-binds", "actor", "actor"])
			?.find((bind) => bind.id === "own")?.archived,
	).toBe(true);
	expect(
		screen.getByRole("button", { name: /Личный архив/ }).textContent,
	).toContain("1");
	first.unmount();
	useBindLinksStore.setState({ accounts: {} });
	useKnowledgeStore
		.getState()
		.setKnowledge({ binds: rows.filter((bind) => bind.id !== "base") });
	const second = mount();
	await waitFor(() =>
		expect(second.client.getQueryData(["shared-binds", "actor"])).toBeDefined(),
	);
	expect(
		screen.queryByRole("button", { name: "Действия: Общий исходник" }),
	).toBeNull();
	expect(screen.queryByText("Чужой архив")).toBeNull();
	expect(screen.queryByText("Общий архив")).toBeNull();
	fireEvent.click(screen.getByText("Посмотреть текст"));
	fireEvent.click(screen.getByRole("button", { name: "EN" }));
	expect(screen.getByText("Personal English answer")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
	await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith({ to: "/" }));
	expect(useKnowledgeStore.getState().activeTab).toBe("own");
	expect(useKnowledgeStore.getState().getBind("own")?.archived).toBe(false);
	expect(
		screen.getByRole("button", { name: "Действия: Личный ответ" }),
	).toBeTruthy();
	expect(rows.find((bind) => bind.id === "base")?.archived).toBe(false);
	expect(
		second.client
			.getQueryData<Bind[]>(["personal-binds", "actor", "actor"])
			?.find((bind) => bind.id === "own")?.archived,
	).toBe(false);
});

it("keeps an archived bind visible and shows the error when the database refuses restoration", async () => {
	useKnowledgeStore
		.getState()
		.setBinds(
			rows.map((bind) =>
				bind.id === "own" ? { ...bind, archived: true } : bind,
			),
		);
	mount();
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "Восстановить" })).toBeTruthy(),
	);
	mock.fetch.mockResolvedValueOnce(
		Response.json({ error: "База временно недоступна" }, { status: 503 }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Восстановить" }));
	await waitFor(() =>
		expect(screen.getByRole("alert").textContent).toContain(
			"База временно недоступна",
		),
	);
	expect(
		useKnowledgeStore.getState().binds.find((bind) => bind.id === "own")
			?.archived,
	).toBe(true);
	expect(mock.navigate).not.toHaveBeenCalled();
});

it("rejects attempts to restore a common or another employee bind before dispatch", async () => {
	await expect(
		knowledgeService.setPersonalBindArchived("shared-archived", false),
	).rejects.toThrow("свой личный архив");
	await expect(
		knowledgeService.setPersonalBindArchived("other", false),
	).rejects.toThrow("свой личный архив");
	expect(mock.fetch).not.toHaveBeenCalled();
});

it("does not hydrate the next account when the archive response arrives after switching accounts", async () => {
	let finish!: (response: Response) => void;
	mock.fetch.mockImplementationOnce(
		() =>
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
	);
	const request = knowledgeService.setPersonalBindArchived("own", true);
	await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(1));
	useAuthStore.setState({ session: { user: { id: "next" } } as never });
	finish(Response.json({ ...rows[1], archived: true }));
	await expect(request).rejects.toThrow("Аккаунт изменился");
	expect(
		useKnowledgeStore.getState().binds.find((bind) => bind.id === "own")
			?.archived,
	).toBe(false);
});
