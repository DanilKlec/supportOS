// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const mocks = vi.hoisted(() => ({ begin: vi.fn(), request: vi.fn() }));
vi.mock("@/services/critical-confirmation.service", () => ({
	beginCritical: mocks.begin,
	criticalRequest: mocks.request,
}));

import { CriticalConfirmationModal } from "./CriticalConfirmationModal";

let client: QueryClient;
const proof = { id: "synthetic-id", token: "synthetic-one-time-token" };
const request = {
	action: "user.update",
	payload: {
		id: "employee",
		roles: ["support"],
		status: "disabled",
		version: 3,
	},
};
const execute = vi.fn(),
	close = vi.fn();
const state = (status: string) => ({
	id: proof.id,
	status,
	expiresAt: new Date(Date.now() + 300000).toISOString(),
});
const show = () =>
	render(
		<QueryClientProvider client={client}>
			<CriticalConfirmationModal
				request={request}
				onExecute={execute}
				onClose={close}
			/>
		</QueryClientProvider>,
	);
beforeEach(() => {
	vi.resetAllMocks();
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	useAuthStore.setState({
		session: {
			sessionId: "current-session",
			accessToken: "synthetic-access-token",
			user: { id: "actor", email: "actor@example.test", role: "admin" },
		},
	});
	mocks.begin.mockResolvedValue({ ...state("pending"), token: proof.token });
	mocks.request.mockResolvedValue(state("approved"));
	execute.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	client.clear();
	useAuthStore.setState({ session: undefined });
});

it("does not send or execute automatically; only an explicit click uses approved one-time proof", async () => {
	show();
	expect(mocks.begin).not.toHaveBeenCalled();
	expect(execute).not.toHaveBeenCalled();
	fireEvent.click(
		screen.getByRole("button", { name: "Отправить подтверждение" }),
	);
	await screen.findByText("Подтверждено в Telegram. Можно выполнить действие.");
	expect(mocks.begin).toHaveBeenCalledWith(request);
	expect(execute).not.toHaveBeenCalled();
	expect(mocks.request.mock.calls[0][0]).toEqual({
		operation: "status",
		id: proof.id,
	});
	expect(document.body.textContent).not.toContain(proof.token);
	fireEvent.click(screen.getByRole("button", { name: "Выполнить действие" }));
	await waitFor(() => expect(execute).toHaveBeenCalledExactlyOnceWith(proof));
	expect(
		(
			screen.getByRole("button", {
				name: "Выполнить действие",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
});
it.each([
	"pending",
	"rejected",
	"expired",
])("does not execute %s confirmation", async (status) => {
	mocks.request.mockResolvedValue(state(status));
	show();
	fireEvent.click(
		screen.getByRole("button", { name: "Отправить подтверждение" }),
	);
	const button = await screen.findByRole("button", {
		name: "Выполнить действие",
	});
	await waitFor(() =>
		expect((button as HTMLButtonElement).disabled).toBe(true),
	);
	fireEvent.click(button);
	expect(execute).not.toHaveBeenCalled();
});
it("cancels the current request on dismissal and never sends a proof in status/cancel requests", async () => {
	show();
	fireEvent.click(
		screen.getByRole("button", { name: "Отправить подтверждение" }),
	);
	await screen.findByText("Подтверждено в Telegram. Можно выполнить действие.");
	fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
	await waitFor(() => expect(close).toHaveBeenCalledOnce());
	expect(mocks.request).toHaveBeenCalledWith({
		operation: "cancel",
		id: proof.id,
	});
	expect(execute).not.toHaveBeenCalled();
});
it("does not silently retry an action after failure or keep an executable permit", async () => {
	execute.mockRejectedValue(new Error("Данные изменились"));
	show();
	fireEvent.click(
		screen.getByRole("button", { name: "Отправить подтверждение" }),
	);
	await screen.findByText("Подтверждено в Telegram. Можно выполнить действие.");
	fireEvent.click(screen.getByRole("button", { name: "Выполнить действие" }));
	await screen.findByRole("alert");
	expect(screen.getByRole("alert").textContent).toBe("Данные изменились");
	fireEvent.click(screen.getByRole("button", { name: "Выполнить действие" }));
	expect(execute).toHaveBeenCalledOnce();
});
