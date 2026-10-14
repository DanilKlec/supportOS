// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const mock = vi.hoisted(() => ({
	signIn: vi.fn(),
	signUp: vi.fn(),
	signInWithGoogle: vi.fn(),
	resetPassword: vi.fn(),
	navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({
		useSearch: () => ({ redirect: "/agent-monitor" }),
	}),
	useNavigate: () => mock.navigate,
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { isConfigured: () => true, ...mock },
}));
vi.mock("@/components/brand/AmbientBackground", () => ({
	AmbientBackground: () => null,
	AmbientMotionButton: () => null,
}));

import { LoginPage } from "./login";

beforeEach(() => {
	vi.resetAllMocks();
	useAuthStore.setState({
		session: undefined,
		loading: false,
		passwordRecovery: false,
		error: undefined,
	});
});
afterEach(cleanup);
function register(confirmation = "long-password") {
	render(<LoginPage />);
	fireEvent.click(screen.getByRole("button", { name: "Регистрация" }));
	fireEvent.change(screen.getByLabelText("Рабочая почта"), {
		target: { value: "new@example.com" },
	});
	fireEvent.change(screen.getByLabelText("Пароль"), {
		target: { value: "long-password" },
	});
	fireEvent.change(screen.getByLabelText(/Повторите пароль/), {
		target: { value: confirmation },
	});
	fireEvent.submit(
		screen.getByRole("button", { name: "Отправить заявку" }).closest("form")!,
	);
}
it("rejects mismatched passwords without creating an account", async () => {
	register("different-password");
	await screen.findByText("Пароли не совпадают");
	expect(mock.signUp).not.toHaveBeenCalled();
});
it("registers by email and waits for email confirmation without claiming access", async () => {
	mock.signUp.mockResolvedValue(undefined);
	register();
	await waitFor(() =>
		expect(mock.signUp).toHaveBeenCalledWith(
			"new@example.com",
			"long-password",
		),
	);
	await screen.findByText(/Проверьте почту и подтвердите регистрацию/);
	expect(mock.navigate).not.toHaveBeenCalled();
	expect(document.body.textContent).not.toContain("Telegram");
});
it("starts Google OAuth with the intended local destination", async () => {
	mock.signInWithGoogle.mockResolvedValue(undefined);
	render(<LoginPage />);
	fireEvent.click(screen.getByText("Войти через Google"));
	await waitFor(() =>
		expect(mock.signInWithGoogle).toHaveBeenCalledWith("/agent-monitor"),
	);
});
it("shows Google provider errors without granting access", async () => {
	mock.signInWithGoogle.mockRejectedValue(new Error("Google ещё не настроен"));
	render(<LoginPage />);
	fireEvent.click(screen.getByText("Войти через Google"));
	await screen.findByText("Google ещё не настроен");
	expect(mock.navigate).not.toHaveBeenCalled();
});
it("offers Google registration with the same provider icon", async () => {
	mock.signInWithGoogle.mockResolvedValue(undefined);
	render(<LoginPage />);
	fireEvent.click(screen.getByRole("button", { name: "Регистрация" }));
	const button = screen.getByRole("button", {
		name: "Зарегистрироваться через Google",
	});
	expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
	fireEvent.click(button);
	await waitFor(() =>
		expect(mock.signInWithGoogle).toHaveBeenCalledWith("/agent-monitor"),
	);
});
it("uses email recovery without a bot", async () => {
	mock.resetPassword.mockResolvedValue(undefined);
	render(<LoginPage />);
	fireEvent.click(screen.getByText(/Восстановить по почте/));
	fireEvent.change(screen.getByLabelText("Почта"), {
		target: { value: "operator@example.com" },
	});
	fireEvent.click(screen.getByText("Отправить ссылку"));
	await waitFor(() =>
		expect(mock.resetPassword).toHaveBeenCalledWith("operator@example.com"),
	);
});
