import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	listFactors: vi.fn(),
	enroll: vi.fn(),
	challengeAndVerify: vi.fn(),
	unenroll: vi.fn(),
	refreshSessionIdentity: vi.fn(),
}));
vi.mock("./supabase-client", () => ({ supabase: { auth: { mfa: mock } } }));
vi.mock("./supabase.service", () => ({ supabaseService: mock }));

import { mfaService } from "./mfa.service";

beforeEach(() => {
	vi.resetAllMocks();
	mock.challengeAndVerify.mockResolvedValue({ error: null });
	mock.listFactors.mockResolvedValue({
		data: { totp: [{ id: "existing" }] },
		error: null,
	});
});
it("does not accept a malformed code or refresh identity after a rejected code", async () => {
	await expect(mfaService.verify("existing", "123")).rejects.toThrow(
		"шестизначный",
	);
	expect(mock.challengeAndVerify).not.toHaveBeenCalled();
	mock.challengeAndVerify.mockResolvedValue({ error: { message: "invalid" } });
	await expect(mfaService.verify("existing", "123456")).rejects.toThrow(
		"Не удалось подтвердить",
	);
	expect(mock.refreshSessionIdentity).not.toHaveBeenCalled();
});
it("uses the Auth verification and then reloads the elevated session", async () => {
	await mfaService.verify("existing", "123456");
	expect(mock.challengeAndVerify).toHaveBeenCalledWith({
		factorId: "existing",
		code: "123456",
	});
	expect(mock.refreshSessionIdentity).toHaveBeenCalledOnce();
});
it("preserves the last device until another verified factor exists", async () => {
	await expect(mfaService.remove("existing")).rejects.toThrow(
		"Сначала подключите",
	);
	expect(mock.unenroll).not.toHaveBeenCalled();
	mock.listFactors.mockResolvedValue({
		data: { totp: [{ id: "existing" }, { id: "replacement" }] },
		error: null,
	});
	mock.unenroll.mockResolvedValue({ error: null });
	await mfaService.remove("existing");
	expect(mock.unenroll).toHaveBeenCalledWith({ factorId: "existing" });
});
