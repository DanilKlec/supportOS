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
	await screen.findByText("Agent A");
	fireEvent.click(screen.getByRole("button", { name: "Выйти из мониторинга" }));
	await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
	client.clear();
});
