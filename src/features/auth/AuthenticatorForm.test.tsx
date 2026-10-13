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
	const input = await screen.findByLabelText("Код Google Authenticator");
	expect(mfa.enroll).not.toHaveBeenCalled();
	expect(done).not.toHaveBeenCalled();
	fireEvent.change(input, { target: { value: "123456" } });
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
	fireEvent.change(screen.getByLabelText("Код Google Authenticator"), {
		target: { value: "123456" },
	});
	mfa.verify.mockRejectedValueOnce(new Error("Неверный код"));
	fireEvent.click(screen.getByText("Подтвердить код"));
	await screen.findByText("Неверный код");
	expect(done).not.toHaveBeenCalled();
	expect(screen.getByLabelText("Код Google Authenticator")).toHaveProperty(
		"value",
		"",
	);
});
