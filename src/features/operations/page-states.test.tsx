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
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bind } from "@/entities/bind";
import { useAuthStore } from "@/store/auth.store";

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
	list: vi.fn(),
	proposals: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	Link: ({
		to,
		hash,
		children,
		...props
	}: ComponentProps<"a"> & { to: string; hash?: string }) => (
		<a href={`${to}${hash ? `#${hash}` : ""}`} {...props}>
			{children}
		</a>
	),
}));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mocks.fetch,
}));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: { list: mocks.list, proposals: mocks.proposals },
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/features/shared-binds/CommonBindImport", () => ({
	CommonBindImport: () => null,
}));
vi.mock("@/features/admin/AIWorkflowGuide", () => ({
	AIWorkflowGuide: () => null,
}));

import { AIControlCenter } from "@/features/admin/AIControlCenter";
import { DashboardPage } from "@/features/admin/pages/PlatformPages";
import { QCOverview } from "@/features/qc/QualityPages";
import { SharedBindsPage } from "@/features/shared-binds/SharedBindsPage";

let client: QueryClient;
const material: Bind = {
	id: "published-material",
	slug: "published-material",
	categoryId: "common",
	ownerId: null,
	tags: [],
	favorite: false,
	archived: false,
	createdAt: "2026-10-01",
	updatedAt: "2026-10-01",
	translations: [
		{
			language: "ru",
			title: "Проверенный ответ",
			content: "Уточните общую тему обращения.",
			updatedAt: "2026-10-01",
		},
	],
};
const dashboard = () => <DashboardPage onUser={vi.fn()} onSection={vi.fn()} />;
function mount(node: ReactNode) {
	return render(
		<QueryClientProvider client={client}>{node}</QueryClientProvider>,
	);
}

beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	useAuthStore.setState({
		configured: false,
		session: {
			accessToken: "synthetic-test-token",
			user: {
				id: "state-test",
				email: "state@example.test",
				role: "admin",
				access: {
					status: "active",
					roles: [],
					permissions: [
						"work",
						"users.manage",
						"binds.read",
						"knowledge.write",
						"ai.train",
					],
					version: 1,
					display_name: "",
				},
			},
		},
	});
	mocks.fetch.mockImplementation(
		async (path: string) =>
			new Response(
				JSON.stringify(
					path.startsWith("/api/accounts")
						? { users: [], total: 0 }
						: path === "/api/projects"
							? { projects: [] }
							: path.includes("quality-signals")
								? { feedback: [], gaps: [] }
								: {
										version: 1,
										content: "",
										document: { entries: [], feedback: [] },
									},
				),
			),
	);
	mocks.list.mockResolvedValue([]);
	mocks.proposals.mockResolvedValue([]);
});

afterEach(() => {
	cleanup();
	client.clear();
	vi.resetAllMocks();
	useAuthStore.setState({ session: undefined });
});

it("uses LoadingState in the existing Admin dashboard while accounts are pending", () => {
	mocks.fetch.mockReturnValue(new Promise<Response>(() => {}));
	mount(dashboard());
	expect(screen.getByRole("status").textContent).toBe("Загружаем данные…");
	expect(
		screen.queryByText("В загруженной выборке нет запросов доступа."),
	).toBeNull();
});

it("retries the same Admin API request and shows EmptyState only after success", async () => {
	mocks.fetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ error: "Backend unavailable" }), {
			status: 500,
		}),
	);
	mount(dashboard());
	await screen.findByRole("alert");
	expect(screen.queryByText("Backend unavailable")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
	await screen.findByText("В загруженной выборке нет запросов доступа.");
	expect(mocks.fetch.mock.calls.map(([path]) => path)).toEqual([
		"/api/accounts?action=users&page=1",
		"/api/accounts?action=users&page=1",
	]);
});

it("shows the shared empty state for a successfully loaded QC overview", async () => {
	mount(<QCOverview onSelect={vi.fn()} />);
	const empty = await screen.findByText(
		"Сейчас нет материалов, требующих проверки.",
	);
	expect(empty.parentElement?.classList.contains("ops-empty")).toBe(true);
	expect(screen.queryByRole("status")).toBeNull();
});

it("does not show an empty material library while its existing query is pending", () => {
	mocks.list.mockReturnValue(new Promise<Bind[]>(() => {}));
	mount(<SharedBindsPage />);
	expect(screen.getByRole("status").textContent).toBe(
		"Загружаем материалы команды…",
	);
	expect(screen.queryByText("Общих материалов пока нет")).toBeNull();
});

it("shows an error instead of a false empty library and retries the existing material query", async () => {
	mocks.list.mockRejectedValueOnce(new Error("Failed to fetch"));
	mount(<SharedBindsPage />);
	const alert = await screen.findByRole("alert");
	expect(alert.textContent).toContain("Не удалось загрузить общие материалы.");
	expect(screen.queryByText("Failed to fetch")).toBeNull();
	expect(screen.queryByText("Общих материалов пока нет")).toBeNull();
	fireEvent.click(within(alert).getByRole("button", { name: "Повторить" }));
	await screen.findByText("Общих материалов пока нет");
	expect(mocks.list).toHaveBeenCalledTimes(2);
});

it("preserves cached material content if the existing background refresh fails", async () => {
	mocks.list
		.mockResolvedValueOnce([material])
		.mockRejectedValue(new Error("Источник временно недоступен"));
	mount(<SharedBindsPage />);
	await screen.findByRole("button", { name: /Проверенный ответ/ });
	fireEvent.click(screen.getByRole("button", { name: "Обновить общие бинды" }));
	await screen.findByRole("alert");
	expect(
		screen.getByRole("button", { name: /Проверенный ответ/ }),
	).toBeTruthy();
	expect(screen.queryByText("Общих материалов пока нет")).toBeNull();
});

it("uses EmptyState for a material search with no matches without fetching again", async () => {
	mocks.list.mockResolvedValue([material]);
	mount(<SharedBindsPage />);
	await screen.findByRole("button", { name: /Проверенный ответ/ });
	fireEvent.change(
		screen.getByRole("textbox", { name: "Поиск общих биндов" }),
		{ target: { value: "Несуществующий материал" } },
	);
	expect(screen.getByText("Ничего не найдено")).toBeTruthy();
	expect(mocks.list).toHaveBeenCalledOnce();
});

it("uses the shared states for AI knowledge in QC Materials without changing its API", async () => {
	mocks.fetch.mockImplementation(
		async (path: string) =>
			new Response(
				JSON.stringify(
					path === "/api/projects"
						? { projects: [] }
						: { error: "Provider offline" },
				),
				{ status: path === "/api/projects" ? 200 : 503 },
			),
	);
	mount(<AIControlCenter section="knowledge" onSection={vi.fn()} />);
	expect(screen.getByRole("status").textContent).toBe(
		"Загружаем знания и правила Помощника…",
	);
	await screen.findByRole("alert");
	expect(screen.queryByText("Provider offline")).toBeNull();
	expect(screen.queryByText("В этом разделе пока нет записей")).toBeNull();
	mocks.fetch.mockResolvedValue(
		new Response(
			JSON.stringify({
				version: 1,
				content: "",
				document: { entries: [], feedback: [] },
			}),
		),
	);
	fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
	await screen.findByText("В этом разделе пока нет записей");
	await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
	expect(
		mocks.fetch.mock.calls.filter(([path]) => path === "/api/ai/knowledge"),
	).toHaveLength(2);
});
