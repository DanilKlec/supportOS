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
	navigate: vi.fn(),
	fetch: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({ useSearch: () => ({ redirect: "/" }) }),
	useNavigate: () => mock.navigate,
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { isConfigured: () => true, signIn: mock.signIn },
}));
vi.mock("@/components/brand/AmbientBackground", () => ({
	AmbientBackground: () => null,
	AmbientMotionButton: () => null,
}));

import { LoginPage } from "./login";

const challenge = {
	login: "operator",
	browserToken: "a".repeat(43),
	telegramUrl: `https://t.me/GetSupportOSBot?start=${"b".repeat(43)}`,
	expiresAt: new Date(Date.now() + 1200000).toISOString(),
};
beforeEach(() => {
	vi.resetAllMocks();
	sessionStorage.clear();
	useAuthStore.setState({ session: undefined, loading: false });
	vi.stubGlobal("fetch", mock.fetch);
	mock.fetch.mockImplementation(
		async (url) =>
			new Response(
				JSON.stringify(
					String(url).endsWith("begin")
						? challenge
						: String(url).endsWith("status")
							? { verified: false }
							: { login: "operator" },
				),
			),
	);
	mock.signIn.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
function fill(confirmation: string) {
	render(<LoginPage />);
	fireEvent.click(screen.getByRole("button", { name: "Регистрация" }));
	fireEvent.change(screen.getByLabelText("Логин"), {
		target: { value: "operator" },
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
	expect(mock.fetch).not.toHaveBeenCalled();
});
it("opens Telegram confirmation without sending or persisting the password", async () => {
	fill("long-password");
	expect(
		await screen.findByRole("heading", { name: "Давайте познакомимся." }),
	).toBeTruthy();
	expect(
		screen
			.getByRole("link", { name: "Подтвердить через Telegram" })
			.getAttribute("href"),
	).toBe(challenge.telegramUrl);
	expect(JSON.parse(mock.fetch.mock.calls[0][1].body)).toEqual({
		login: "operator",
	});
	expect(
		sessionStorage.getItem("supportos:telegram-registration"),
	).not.toContain("long-password");
	fireEvent.click(
		screen.getByRole("button", { name: "Завершить регистрацию" }),
	);
	await screen.findByText(/Откройте бота, нажмите/);
	expect(mock.signIn).not.toHaveBeenCalled();
	expect(
		mock.fetch.mock.calls.some(([url]) => String(url).endsWith("complete")),
	).toBe(false);
});
it("completes only after confirmation and signs in with the chosen login", async () => {
	fill("long-password");
	await screen.findByRole("heading", { name: "Давайте познакомимся." });
	mock.fetch
		.mockResolvedValueOnce(new Response(JSON.stringify({ verified: true })))
		.mockResolvedValueOnce(new Response(JSON.stringify({ login: "operator" })));
	fireEvent.click(
		screen.getByRole("button", { name: "Завершить регистрацию" }),
	);
	await waitFor(() =>
		expect(mock.signIn).toHaveBeenCalledWith("operator", "long-password"),
	);
	expect(JSON.parse(mock.fetch.mock.calls[2][1].body)).toEqual({
		browserToken: challenge.browserToken,
		password: "long-password",
	});
	await waitFor(() =>
		expect(
			sessionStorage.getItem("supportos:telegram-registration"),
		).toBeNull(),
	);
});
it("restores a challenge after reload but requires password reentry", async () => {
	sessionStorage.setItem(
		"supportos:telegram-registration",
		JSON.stringify(challenge),
	);
	render(<LoginPage />);
	expect(screen.getByLabelText("Пароль")).toHaveProperty("value", "");
	fireEvent.click(screen.getByRole("button", { name: "Вернуться ко входу" }));
	expect(
		screen.getByRole("button", { name: "Войти в пространство" }),
	).toBeTruthy();
	expect(sessionStorage.getItem("supportos:telegram-registration")).toBeNull();
});
it("shows server configuration errors without claiming registration succeeded", async () => {
	mock.fetch.mockResolvedValueOnce(
		new Response(JSON.stringify({ error: "Регистрация ещё не настроена" }), {
			status: 503,
		}),
	);
	fill("long-password");
	expect(await screen.findByRole("alert")).toHaveProperty(
		"textContent",
		"Регистрация ещё не настроена",
	);
	expect(
		screen.queryByRole("heading", { name: "Давайте познакомимся." }),
	).toBeNull();
});
