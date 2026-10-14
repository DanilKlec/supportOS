// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { UserAccountActions } from "./UserAccountActions";
const user = {
	id: "employee",
	email: "employee@example.test",
	display_name: "Employee",
	status: "active",
	version: 4,
	roles: ["support"],
};
afterEach(cleanup);
it("requires matching new passwords and preserves the exact account version", () => {
	const onSave = vi.fn().mockResolvedValue(undefined);
	render(<UserAccountActions user={user} disabled={false} onSave={onSave} />);
	fireEvent.change(screen.getByLabelText("Новый пароль"), {
		target: { value: "synthetic-new-password" },
	});
	fireEvent.change(screen.getByLabelText("Повторите новый пароль"), {
		target: { value: "synthetic-other-password" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
	expect(screen.getByRole("alert").textContent).toBe("Пароли не совпадают");
	expect(onSave).not.toHaveBeenCalled();
	fireEvent.change(screen.getByLabelText("Повторите новый пароль"), {
		target: { value: "synthetic-new-password" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
	expect(onSave).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Да, сменить пароль" }));
	expect(onSave).toHaveBeenCalledWith({
		action: "user.password",
		confirmed: true,
		payload: { id: user.id, version: 4, password: "synthetic-new-password" },
	});
});
it("requests deletion only after the popup confirmation and supports cancelling", () => {
	const onSave = vi.fn().mockResolvedValue(undefined);
	render(<UserAccountActions user={user} disabled={false} onSave={onSave} />);
	fireEvent.click(screen.getByRole("button", { name: "Удалить аккаунт" }));
	expect(screen.getByRole("dialog", { name: "Удалить аккаунт?" })).toBeTruthy();
	expect(onSave).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Удалить аккаунт" }));
	fireEvent.click(screen.getByRole("button", { name: "Да, удалить аккаунт" }));
	expect(onSave).toHaveBeenCalledWith({
		action: "user.delete",
		confirmed: true,
		payload: { id: user.id, version: 4 },
	});
});
it.each([
	["Отключить 2FA", "Отключить 2FA?", "Да, отключить 2FA", "user.mfa.reset"],
	[
		"Завершить все сессии",
		"Завершить все сессии?",
		"Да, завершить все сессии",
		"user.sessions.revoke",
	],
])("confirms %s for the exact employee and supports cancellation", (button, title, confirm, action) => {
	const onSave = vi.fn().mockResolvedValue(undefined);
	render(<UserAccountActions user={user} disabled={false} onSave={onSave} />);
		fireEvent.click(screen.getByRole("button", { name: button }));
	expect(screen.getByRole("dialog", { name: title })).toBeTruthy();
	expect(screen.getByText(user.email, { exact: true })).toBeTruthy();
	expect(screen.queryByLabelText(/Код.*Authenticator/)).toBeNull();
	expect(onSave).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
	expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: button }));
		fireEvent.click(screen.getByRole("button", { name: confirm }));
	expect(onSave).toHaveBeenCalledTimes(1);
	expect(onSave).toHaveBeenCalledWith({
		action,
		confirmed: true,
		payload: { id: user.id, version: 4 },
	});
});
it("disables account actions for protected employees", () => {
	render(<UserAccountActions user={user} disabled={true} onSave={vi.fn()} />);
	for (const name of [
		"Сменить пароль",
		"Удалить аккаунт",
		"Отключить 2FA",
		"Завершить все сессии",
	])
		expect(
			(screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
		).toBe(true);
});
