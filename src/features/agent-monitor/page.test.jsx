// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
	getAccessToken: vi.fn(async () => "user-token"),
	signOut: vi.fn(async () => {}),
}));
vi.mock("@/services/supabase.service", () => ({ supabaseService: auth }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options) => ({ options }),
 useRouterState: ({select}) => select({location:{hash:""}}),
}));
import { Route } from "../../routes/agent-monitor";
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
function mount() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const Component = Route.options.component;
	render(
		<QueryClientProvider client={client}>
			<Component />
		</QueryClientProvider>,
	);
	return client;
}
it("hides monitor data when the server rejects the role", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({ error: "Доступ разрешён только руководителям" }),
					{ status: 403 },
				),
		),
	);
	const client = mount();
	await screen.findByText("Доступ разрешён только руководителям");
	expect(screen.queryByText("Agent A")).toBeNull();
	expect(screen.queryByLabelText("Пароль")).toBeNull();
	client.clear();
});
it("uses individual bearer auth and signs out through Supabase", async () => {
	const fetch = vi.fn(async (url, init) => {
		expect(init.headers.get("Authorization")).toBe("Bearer user-token");
		if (new URL(url, "http://localhost").searchParams.get("action") === "sync")
			return new Response("{}");
		return new Response(
			JSON.stringify({
				agents: [
					{
						id: "a",
						name: "Agent A",
						status: "on",
						observed_at: new Date().toISOString(),
						changed_at: new Date().toISOString(),
					},
				],
				observations: [],
				assignments: [],
				audit: [],
				totals: [],
				historyLimited: false,
				lastSync: null,
				serverTime: Date.now(),
			}),
		);
	});
	vi.stubGlobal("fetch", fetch);
	const client = mount();
	fireEvent.change(await screen.findByLabelText("Состав списка"), {
		target: { value: "online" },
	});
	await screen.findByText("Agent A");
	fireEvent.click(screen.getByRole("button", { name: "Выйти из мониторинга" }));
	await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
	client.clear();
});

it("filters offline and stale agents, searches email, and filters reception events", async () => {
	const now = Date.now();
	const agents = [
		{
			id: "anna@example.com",
			name: "Anna",
			status: "on",
			observed_at: new Date(now).toISOString(),
			changed_at: new Date(now - 2000).toISOString(),
		},
		{
			id: "boris@example.com",
			name: "Boris",
			status: "off",
			observed_at: new Date(now).toISOString(),
			changed_at: new Date(now - 1000).toISOString(),
		},
		{
			id: "offline@example.com",
			name: "Offline Person",
			status: "offline",
			observed_at: new Date(now).toISOString(),
			changed_at: new Date(now).toISOString(),
		},
		{
			id: "stale@example.com",
			name: "Stale Person",
			status: "on",
			observed_at: new Date(now - 120000).toISOString(),
			changed_at: new Date(now - 120000).toISOString(),
		},
	];
	const observations = [
		{
			id: 1,
			agent_id: "boris@example.com",
			at: new Date(now - 3000).toISOString(),
			status: "on",
			source: "poll",
			changed: true,
		},
		{
			id: 2,
			agent_id: "boris@example.com",
			at: new Date(now - 1000).toISOString(),
			status: "off",
			source: "webhook",
			changed: true,
		},
	];
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async (url) =>
				new Response(
					JSON.stringify(
						new URL(url, "http://localhost").searchParams.get("action") ===
							"sync"
							? {}
							: {
									agents,
									observations,
									assignments: [],
									audit: [],
									totals: [],
									historyLimited: false,
									lastSync: new Date(now).toISOString(),
									serverTime: now,
								},
					),
				),
		),
	);
	const client = mount();
	fireEvent.change(await screen.findByLabelText("Состав списка"), {
		target: { value: "online" },
	});
	await screen.findByText("Anna");
	fireEvent.change(screen.getByLabelText("Состав списка"), {
		target: { value: "current" },
	});
	expect(screen.queryByText("Anna")).toBeNull();
	expect(screen.queryByText("Boris")).toBeNull();
	fireEvent.change(screen.getByLabelText("Состав списка"), {
		target: { value: "online" },
	});
	expect(screen.queryByText("Offline Person")).toBeNull();
	expect(screen.queryByText("Stale Person")).toBeNull();
	fireEvent.change(screen.getByLabelText("Поиск агента"), {
		target: { value: "boris@example.com" },
	});
	expect(screen.queryByText("Anna")).toBeNull();
	expect(screen.getAllByText("boris@example.com").length).toBeGreaterThan(0);
	fireEvent.change(screen.getByLabelText("События журнала"), {
		target: { value: "off" },
	});
	expect(screen.queryByText("Первое доступное наблюдение")).toBeNull();
	expect(screen.getByText("Журнал приёма чатов · 1")).toBeTruthy();
	client.clear();
});
