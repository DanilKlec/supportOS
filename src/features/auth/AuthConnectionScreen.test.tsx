// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthConnectionScreen } from "./AuthConnectionScreen";

afterEach(cleanup);

it("explains a timeout and keeps technical details available", () => {
	render(
		<AuthConnectionScreen
			error="signal timed out"
			onRetry={vi.fn()}
			onSignOut={vi.fn()}
		/>,
	);
	expect(
		screen.getByRole("heading", { name: "Сервер немного задумался" }),
	).toBeTruthy();
	expect(screen.getByText("Соединение задерживается")).toBeTruthy();
	expect(screen.getByText("signal timed out").closest("details")).toBeTruthy();
});

it("runs only one action while checking and releases the controls afterwards", async () => {
	let complete!: () => void;
	const retry = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				complete = resolve;
			}),
	);
	const signOut = vi.fn();
	render(<AuthConnectionScreen onRetry={retry} onSignOut={signOut} />);
	fireEvent.click(screen.getByRole("button", { name: "Повторить проверку" }));
	fireEvent.click(screen.getByRole("button", { name: "Проверяем…" }));
	fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
	expect(retry).toHaveBeenCalledTimes(1);
	expect(signOut).not.toHaveBeenCalled();
	expect(
		(screen.getByRole("button", { name: "Выйти" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	await act(async () => complete());
	expect(
		(
			screen.getByRole("button", {
				name: "Повторить проверку",
			}) as HTMLButtonElement
		).disabled,
	).toBe(false);
});

it("shows sign-out failures and lets the user retry without losing the session", async () => {
	const signOut = vi
		.fn()
		.mockRejectedValueOnce(new Error("Не удалось завершить сессию"))
		.mockResolvedValue(undefined);
	render(<AuthConnectionScreen onRetry={vi.fn()} onSignOut={signOut} />);
	await act(async () =>
		fireEvent.click(screen.getByRole("button", { name: "Выйти" })),
	);
	expect(screen.getByRole("alert").textContent).toBe(
		"Не удалось завершить сессию",
	);
	await act(async () =>
		fireEvent.click(screen.getByRole("button", { name: "Выйти" })),
	);
	expect(signOut).toHaveBeenCalledTimes(2);
	expect(screen.queryByRole("alert")).toBeNull();
});
