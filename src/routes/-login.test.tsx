// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const mock = vi.hoisted(() => ({ signUp: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({ useSearch: () => ({ redirect: "/" }) }),
	useNavigate: () => mock.navigate,
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { isConfigured: () => true, signUp: mock.signUp },
}));
vi.mock("@/components/brand/AmbientBackground", () => ({
	AmbientBackground: () => null,
	AmbientMotionButton: () => null,
}));

import { LoginPage } from "./login";

beforeEach(() => {
	vi.clearAllMocks();
	useAuthStore.setState({ session: undefined, loading: false });
	mock.signUp.mockResolvedValue(undefined);
});
afterEach(cleanup);
function fill(confirmation: string) {
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
it("prevents signup with mismatched passwords", async () => {
	fill("different-password");
	expect(await screen.findByRole("alert")).toHaveProperty(
		"textContent",
		"Пароли не совпадают",
	);
	expect(mock.signUp).not.toHaveBeenCalled();
});
it("explains email confirmation and admin approval without entering the app", async () => {
	fill("long-password");
	expect(await screen.findByText(/Регистрация отправлена/)).toBeTruthy();
	expect(mock.signUp).toHaveBeenCalledWith("new@example.com", "long-password");
	expect(mock.navigate).not.toHaveBeenCalled();
});
