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
import { useAuthStore } from "@/store/auth.store";

const loader = vi.hoisted(() => vi.fn());
const critical = vi.hoisted(() => ({
	begin: vi.fn(),
	request: vi.fn(),
	action: vi.fn(),
}));
vi.mock("@/services/critical-confirmation.service", () => ({
	beginCritical: critical.begin,
	criticalRequest: critical.request,
	confirmedAccountAction: critical.action,
}));
vi.mock("@/services/active-sessions.service", () => ({
	loadActiveSessions: loader,
}));

import { ActiveSessionsPanel } from "./ActiveSessionsPanel";

let client: QueryClient;
const identity = (user = "user", session = "current") => ({
	accessToken: "synthetic-token",
	sessionId: session,
	user: { id: user, email: "user@example.test", role: "support" as const },
});
const row = (id: string, agent: string | null = null) => ({
	id,
	created_at: "2026-10-01T09:00:00Z",
	updated_at: null,
	refreshed_at: null,
	user_agent: agent,
	is_current: id === "current",
});
const show = () =>
	render(
		<QueryClientProvider client={client}>
			<ActiveSessionsPanel />
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

it("shows the current marker, available timestamps and optional device data", async () => {
	loader.mockResolvedValue([
		{
			...row("current", "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0"),
			updated_at: "2026-10-02T10:00:00Z",
			refreshed_at: "2026-10-02T10:00:00Z",
		},
		row("another"),
	]);
	show();
	expect(screen.getByRole("status").textContent).toBe("Загрузка сессий…");
	await screen.findByText("Текущая сессия");
	expect(screen.getAllByText("Текущая сессия")).toHaveLength(1);
	expect(screen.getByText("Chrome · Windows")).toBeTruthy();
	expect(screen.getByText("Устройство не указано")).toBeTruthy();
	expect(screen.getByText("Авторизация обновлена")).toBeTruthy();
	expect(screen.getByText("Обновлена")).toBeTruthy();
	expect(screen.getByText("another")).toBeTruthy();
	expect(loader).toHaveBeenCalledTimes(1);
});
it("refreshes explicitly and keeps cached sessions isolated between user/session changes", async () => {
	loader.mockResolvedValue([row("current")]);
	show();
	await screen.findByText("current");
	fireEvent.click(screen.getByRole("button", { name: "Обновить список" }));
	await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
	loader.mockResolvedValue([row("new-session")]);
	act(() =>
		useAuthStore.setState({ session: identity("new-user", "new-session") }),
	);
	await screen.findByText("new-session");
	expect(screen.queryByText("current")).toBeNull();
	expect(
		client.getQueryData(["active-sessions", "new-user", "new-session"]),
	).toHaveLength(1);
});
it("does not request or show metadata after sign-out", async () => {
	loader.mockResolvedValue([row("current")]);
	show();
	await screen.findByText("current");
	act(() => useAuthStore.setState({ session: undefined }));
	expect(
		screen.getByText("Войдите в аккаунт, чтобы увидеть активные сессии."),
	).toBeTruthy();
	expect(screen.queryByText("current")).toBeNull();
	expect(loader).toHaveBeenCalledTimes(1);
});
it("shows an error instead of stale metadata when authorization is revoked", async () => {
	loader.mockResolvedValue([row("current")]);
	show();
	await screen.findByText("current");
	loader.mockRejectedValue(new Error("Сессия недействительна. Войдите снова."));
	fireEvent.click(screen.getByRole("button", { name: "Обновить список" }));
	await screen.findByRole("alert");
	expect(screen.queryByText("current")).toBeNull();
	expect(loader).toHaveBeenCalledTimes(2);
});
it("supports an empty result without inventing sessions", async () => {
	loader.mockResolvedValue([]);
	show();
	await screen.findByText("Активные сессии не найдены.");
	expect(screen.queryByText("Текущая сессия")).toBeNull();
});
it("revokes only other sessions through generic confirmation and refreshes the current session", async () => {
	loader
		.mockResolvedValueOnce([row("current"), row("another")])
		.mockResolvedValue([row("current")]);
	const proof = { id: "request", token: "one-time-permit" };
	critical.begin.mockResolvedValue({
		...proof,
		status: "pending",
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	});
	critical.request.mockResolvedValue({
		id: proof.id,
		status: "approved",
		expiresAt: new Date(Date.now() + 300000).toISOString(),
	});
	critical.action.mockResolvedValue({ ok: true });
	show();
	await screen.findByText("another");
	fireEvent.click(
		screen.getByRole("button", { name: "Завершить все остальные сессии" }),
	);
	expect(critical.action).not.toHaveBeenCalled();
	fireEvent.click(
		screen.getByRole("button", { name: "Отправить подтверждение" }),
	);
	await screen.findByText("Подтверждено в Telegram. Можно выполнить действие.");
	expect(critical.begin).toHaveBeenCalledWith({
		action: "sessions.revoke_others",
		payload: {},
	});
	expect(critical.action).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Выполнить действие" }));
	await screen.findByText("Другие сессии завершены. Текущая сессия сохранена.");
	expect(critical.action).toHaveBeenCalledExactlyOnceWith(
		"revoke-other-sessions",
		proof,
	);
	await waitFor(() => expect(screen.queryByText("another")).toBeNull());
	expect(screen.getByText("Текущая сессия")).toBeTruthy();
});
