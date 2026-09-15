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
import { useAuthStore } from "@/store/auth.store";
import { ShareRecipientPicker } from "./ShareRecipientPicker";

const fetcher = vi.hoisted(() => vi.fn());
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: fetcher,
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
it("loads immediately, excludes self, marks shared recipients, searches and pages", async () => {
	useAuthStore.setState({
		session: {
			accessToken: "test",
			user: { id: "self", email: "self@example.com", role: "support" },
		},
	});
	fetcher.mockImplementation(async (url: string) => ({
		ok: true,
		json: async () => ({
			users: url.includes("search=Maria")
				? [{ id: "m", display_name: "Maria", email: "m@example.com" }]
				: [
						{ id: "self", display_name: "Self", email: "self@example.com" },
						{ id: "i", display_name: "Ivan", email: "i@example.com" },
						{ id: "m", display_name: "Maria", email: "m@example.com" },
					],
			hasMore: !url.includes("page=2"),
		}),
	}));
	const change = vi.fn();
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<ShareRecipientPicker
				value=""
				onChange={change}
				sharedEmails={["i@example.com"]}
				disabled={false}
			/>
		</QueryClientProvider>,
	);
	await screen.findByText("Ivan");
	expect(fetcher.mock.calls[0][0]).toContain("search=");
	expect(screen.queryByText("Self")).toBeNull();
	const shared = screen.getByRole("button", {
		name: /Ivan/,
	}) as HTMLButtonElement;
	expect(shared.disabled).toBe(true);
	expect(screen.getByText("Уже имеет доступ")).toBeTruthy();
	fireEvent.click(shared);
	expect(change).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: /Maria/ }));
	expect(change).toHaveBeenCalledWith("m@example.com");
	fireEvent.click(screen.getByRole("button", { name: "Далее" }));
	await waitFor(() =>
		expect(fetcher.mock.calls.some(([url]) => url.includes("page=2"))).toBe(
			true,
		),
	);
	fireEvent.change(screen.getByLabelText("Поиск по имени или email"), {
		target: { value: "Maria" },
	});
	await waitFor(() => expect(screen.queryByText("Ivan")).toBeNull());
	expect(fetcher.mock.calls.at(-1)?.[0]).toContain("page=1&search=Maria");
	fireEvent.change(screen.getByLabelText("Поиск по имени или email"), {
		target: { value: "" },
	});
	await screen.findByText("Ivan");
});

it("refreshes the active directory when reopened and retries loading errors", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const picker = (
		<QueryClientProvider client={client}>
			<ShareRecipientPicker
				value=""
				onChange={vi.fn()}
				sharedEmails={[]}
				disabled={false}
			/>
		</QueryClientProvider>
	);
	fetcher.mockResolvedValue({
		ok: true,
		json: async () => ({
			users: [{ id: "i", display_name: "Ivan", email: "i@example.com" }],
			hasMore: false,
		}),
	});
	const first = render(picker);
	await screen.findByText("Ivan");
	first.unmount();
	fetcher.mockResolvedValue({
		ok: false,
		json: async () => ({ error: "Сеть недоступна" }),
	});
	render(picker);
	await screen.findByRole("alert");
	expect(fetcher).toHaveBeenCalledTimes(2);
	fetcher.mockResolvedValue({
		ok: true,
		json: async () => ({ users: [], hasMore: false }),
	});
	fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
	await screen.findByText("Сотрудники не найдены.");
	expect(screen.queryByText("Ivan")).toBeNull();
});
