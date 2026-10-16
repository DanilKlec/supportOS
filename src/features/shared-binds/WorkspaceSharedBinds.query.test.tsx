// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const mock = vi.hoisted(() => ({
	fetch: vi.fn(),
	list: vi.fn(),
	personal: vi.fn(),
	branches: vi.fn(),
}));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.fetch,
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { getSession: () => useAuthStore.getState().session },
}));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: mock,
}));

import { useWorkspaceSharedBinds } from "./WorkspaceSharedBinds";

let client: QueryClient;
const initialAuth = useAuthStore.getState();
beforeEach(() => {
	vi.useFakeTimers();
	vi.resetAllMocks();
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	useAuthStore.setState({
		session: {
			accessToken: "test",
			user: {
				id: "actor",
				email: "actor@example.test",
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
	mock.fetch.mockImplementation(async () =>
		Response.json({
			categories: [],
			folders: [],
			binds: [{ id: "answer", ownerId: null, translations: [], tags: [] }],
			branches: { choices: {}, incoming: [], outgoing: [] },
		}),
	);
});
afterEach(() => {
	cleanup();
	client.clear();
	useAuthStore.setState(initialAuth);
	vi.useRealTimers();
});
function Consumer({ poll = false }: { poll?: boolean }) {
	const { common } = useWorkspaceSharedBinds({ poll });
	return <output>{common.data?.length ?? 0}</output>;
}
it("uses one initial request and one polling timer across multiple workspace observers", async () => {
	const view = render(
		<QueryClientProvider client={client}>
			<Consumer poll />
			<Consumer />
			<Consumer />
		</QueryClientProvider>,
	);
	await act(() => vi.advanceTimersByTimeAsync(10));
	expect(mock.fetch).toHaveBeenCalledTimes(1);
	expect(screen.getAllByText("1")).toHaveLength(3);
	expect(mock.list).not.toHaveBeenCalled();
	expect(mock.personal).not.toHaveBeenCalled();
	expect(mock.branches).not.toHaveBeenCalled();
	await act(() => vi.advanceTimersByTimeAsync(20000));
	view.rerender(
		<QueryClientProvider client={client}>
			<Consumer poll />
			<Consumer />
			<Consumer />
			<Consumer />
		</QueryClientProvider>,
	);
	await act(() => vi.advanceTimersByTimeAsync(10));
	expect(mock.fetch).toHaveBeenCalledTimes(1);
	await act(() => vi.advanceTimersByTimeAsync(10000));
	expect(mock.fetch).toHaveBeenCalledTimes(2);
	// Writes can still invalidate the existing feature keys immediately.
	mock.list.mockResolvedValue([{ id: "updated", ownerId: null }]);
	await act(async () => {
		await client.invalidateQueries({ queryKey: ["shared-binds", "actor"] });
	});
	expect(mock.list).toHaveBeenCalledTimes(1);
	expect(client.getQueryData(["shared-binds", "actor"])).toEqual([
		{ id: "updated", ownerId: null },
	]);
});
