// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LoginEvent } from "@/services/login-history.service";
import { useAuthStore } from "@/store/auth.store";

const loader = vi.hoisted(() => vi.fn());
vi.mock("@/services/login-history.service", () => ({
	loadLoginHistory: loader,
}));

import { LoginHistoryPanel } from "./LoginHistoryPanel";

let client: QueryClient;
const identity = (id = "user", permissions = ["work"]) => ({
	accessToken: "synthetic-token",
	sessionId: "current",
	user: {
		id,
		email: "user@example.test",
		role: "support" as const,
		access: {
			status: "active" as const,
			roles: [],
			permissions,
			version: 1,
			display_name: "",
		},
	},
});
const event = (id: string, type: LoginEvent["event_type"]): LoginEvent => ({
	id,
	user_id: "user",
	session_id: "current",
	event_type: type,
	created_at: "2026-10-07T10:00:00Z",
	ip_hash: "a".repeat(64),
	browser: "Chrome",
	os: "Windows",
	telegram_result: "approved",
});
const show = (target?: string) =>
	render(
		<QueryClientProvider client={client}>
			<LoginHistoryPanel userId={target} />
		</QueryClientProvider>,
	);
beforeEach(() => {
	vi.resetAllMocks();
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	useAuthStore.setState({ session: identity() });
});
afterEach(() => {
	cleanup();
	client.clear();
	useAuthStore.setState({ session: undefined });
});
it("shows Russian event labels, parsed device and explicit Telegram result", async () => {
	loader.mockResolvedValue({
		events: [
			event("1", "login_approved"),
			{ ...event("2", "login_rejected"), telegram_result: "not_confirmed" },
			event("3", "password_changed"),
			event("4", "sessions_revoked"),
		],
		nextCursor: null,
	});
	show();
	await screen.findByText("Вход подтверждён");
	for (const label of [
		"Вход отклонён",
		"Пароль изменён",
		"Сессии завершены",
		"Не подтверждалось",
	])
		expect(screen.getByText(label)).toBeTruthy();
	expect(screen.getAllByText("Chrome · Windows")).toHaveLength(4);
	expect(screen.queryByText("login_approved")).toBeNull();
	expect(loader).toHaveBeenCalledTimes(1);
});
it("loads next pages only after an explicit request", async () => {
	loader
		.mockResolvedValueOnce({
			events: [event("2", "login_approved")],
			nextCursor: "2",
		})
		.mockResolvedValueOnce({
			events: [event("1", "password_changed")],
			nextCursor: null,
		});
	show();
	await screen.findByText("Вход подтверждён");
	fireEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
	await screen.findByText("Пароль изменён");
	expect(loader.mock.calls[1][1]).toBe("2");
	expect(screen.queryByRole("button", { name: "Показать ещё" })).toBeNull();
});
it("requires permission, not an admin role label, before requesting another user history", async () => {
	show("other");
	expect(screen.getByText("Нет доступа к истории входов.")).toBeTruthy();
	expect(loader).not.toHaveBeenCalled();
	loader.mockResolvedValue({ events: [], nextCursor: null });
	act(() =>
		useAuthStore.setState({ session: identity("user", ["users.manage"]) }),
	);
	await screen.findByText("Событий безопасности пока нет.");
	expect(loader.mock.calls[0][0]).toBe("other");
});
it("hides cached metadata when permissions are removed or the session changes", async () => {
	loader.mockResolvedValue({
		events: [event("1", "login_approved")],
		nextCursor: null,
	});
	show("other");
	act(() =>
		useAuthStore.setState({ session: identity("user", ["users.manage"]) }),
	);
	await screen.findByText("Вход подтверждён");
	act(() => useAuthStore.setState({ session: identity() }));
	expect(screen.queryByText("Вход подтверждён")).toBeNull();
	await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
});
