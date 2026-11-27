// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mfa = vi.hoisted(() => ({
	factors: vi.fn(),
	enroll: vi.fn(),
	verify: vi.fn(),
}));
vi.mock("@/services/mfa.service", () => ({ mfaService: mfa }));

import { AuthenticatorForm } from "./AuthenticatorForm";

beforeEach(() => {
	vi.resetAllMocks();
	mfa.factors.mockResolvedValue([{ id: "verified-factor" }]);
	mfa.verify.mockResolvedValue(undefined);
});
afterEach(cleanup);
it("keeps enrollment in settings when the account has no second factor", async () => {
	mfa.factors.mockResolvedValue([]);
	render(<AuthenticatorForm onVerified={vi.fn()} />);
	const settings = await screen.findByRole("link", {
		name: "настройках безопасности",
	});
	expect(settings.getAttribute("href")).toBe("/settings#security");
	expect(screen.queryByText("Подключить Google Authenticator")).toBeNull();
	expect(mfa.enroll).not.toHaveBeenCalled();
});
it("requires a valid code and does not enroll over an existing authenticator", async () => {
	const done = vi.fn();
	render(<AuthenticatorForm onVerified={done} />);
	const input = (
		await screen.findAllByRole("textbox", { name: /Цифра \d из 6/ })
	)[0];
	expect(mfa.enroll).not.toHaveBeenCalled();
	expect(done).not.toHaveBeenCalled();
	fireEvent.paste(input, { clipboardData: { getData: () => "123 456" } });
	fireEvent.click(screen.getByText("Подтвердить код"));
	await waitFor(() =>
		expect(mfa.verify).toHaveBeenCalledWith("verified-factor", "123456"),
	);
	await waitFor(() => expect(done).toHaveBeenCalledOnce());
});
it("shows QR and manual key only after explicit enrollment and requires verification", async () => {
	mfa.factors.mockResolvedValue([]);
	mfa.enroll.mockResolvedValue({
		id: "new-factor",
		totp: { qr_code: "<svg/>", secret: "SYNTHETIC-SECRET" },
	});
	const done = vi.fn();
	render(<AuthenticatorForm enroll onVerified={done} />);
	fireEvent.click(await screen.findByText("Подключить Google Authenticator"));
	await screen.findByAltText("QR-код подключения Google Authenticator");
	expect(screen.getByText("SYNTHETIC-SECRET")).toBeTruthy();
	expect(done).not.toHaveBeenCalled();
	const firstDigit = screen.getByLabelText("Цифра 1 из 6");
	fireEvent.change(firstDigit, {
		target: { value: "123456" },
	});
	mfa.verify.mockRejectedValueOnce(new Error("Неверный код"));
	fireEvent.click(screen.getByText("Подтвердить код"));
	await screen.findByText("Неверный код");
	expect(done).not.toHaveBeenCalled();
	expect(firstDigit).toHaveProperty("value", "");
	expect(document.activeElement).toBe(firstDigit);
});

it("advances while typing and keeps a missing digit from submitting", async () => {
	render(<AuthenticatorForm onVerified={vi.fn()} submitLabel="Войти" />);
	const cells = await screen.findAllByRole("textbox", {
		name: /Цифра \d из 6/,
	});
	expect(document.activeElement).toBe(cells[0]);
	fireEvent.change(cells[0], { target: { value: "0" } });
	expect(document.activeElement).toBe(cells[1]);
	fireEvent.keyDown(cells[1], { key: "Backspace" });
	expect(document.activeElement).toBe(cells[0]);
	expect(cells[0]).toHaveProperty("value", "");
	fireEvent.paste(cells[2], { clipboardData: { getData: () => "012345" } });
	fireEvent.change(cells[2], { target: { value: "" } });
	const signIn = screen.getByRole("button", { name: "Войти" });
	expect(signIn).toHaveProperty("disabled", true);
	fireEvent.change(cells[2], { target: { value: "2" } });
	fireEvent.click(signIn);
	await waitFor(() => expect(mfa.verify).toHaveBeenCalledOnce());
	expect(mfa.verify).toHaveBeenCalledWith("verified-factor", "012345");
});
