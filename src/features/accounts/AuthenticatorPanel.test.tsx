// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	factors: vi.fn(),
	enroll: vi.fn(),
	verify: vi.fn(),
	remove: vi.fn(),
}));
vi.mock("@/services/mfa.service", () => ({ mfaService: mock }));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { linkGoogle: vi.fn() },
}));

import { AuthenticatorPanel } from "./AuthenticatorPanel";

beforeEach(() => {
	vi.resetAllMocks();
	mock.factors.mockResolvedValue([]);
});
afterEach(cleanup);
it("activates 2FA only after an explicit settings action and a verified code", async () => {
	mock.enroll.mockResolvedValue({
		id: "new",
		totp: { qr_code: "<svg/>", secret: "SYNTHETIC" },
	});
	mock.verify.mockResolvedValue(undefined);
	render(<AuthenticatorPanel />);
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "Включить 2FA" })).toHaveProperty(
			"disabled",
			false,
		),
	);
	expect(mock.enroll).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Включить 2FA" }));
	fireEvent.click(await screen.findByText("Подключить Google Authenticator"));
	await screen.findByAltText("QR-код подключения Google Authenticator");
	expect(screen.queryByText(/2FA включена\./)).toBeNull();
	mock.factors.mockResolvedValue([{ id: "new" }]);
	fireEvent.change(screen.getByLabelText("Код Google Authenticator"), {
		target: { value: "123456" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Подтвердить код" }));
	await screen.findByText(/2FA включена\./);
	expect(mock.verify).toHaveBeenCalledWith("new", "123456");
});
