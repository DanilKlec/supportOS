// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreateUser } from "./UserDetails";
afterEach(cleanup);
it("creates only after ordinary confirmation and keeps the selected roles when cancelled", () => {
	const onSave = vi.fn().mockResolvedValue(undefined);
	render(
		<CreateUser
			roles={[
				{
					id: "support",
					name: "Support",
					description: "",
					is_system: true,
					version: 1,
					permissions: ["work"],
				},
			]}
			busy={false}
			onSave={onSave}
			onCancel={vi.fn()}
		/>,
	);
	fireEvent.change(screen.getByLabelText("Почта нового аккаунта"), {
		target: { value: "employee@example.test" },
	});
	fireEvent.change(screen.getByLabelText("Пароль нового аккаунта"), {
		target: { value: "synthetic-password" },
	});
	fireEvent.change(screen.getByLabelText("Имя нового сотрудника"), {
		target: { value: "Employee" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
	expect(screen.getByRole("dialog", { name: "Создать аккаунт?" })).toBeTruthy();
	expect(onSave).not.toHaveBeenCalled();
	expect(screen.queryByText(/Google Authenticator/)).toBeNull();
	fireEvent.click(
		screen
			.getByRole("dialog")
			.querySelector("button.ui-button--secondary") as HTMLButtonElement,
	);
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(onSave).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
	fireEvent.click(screen.getByRole("button", { name: "Да, создать аккаунт" }));
	expect(onSave).toHaveBeenCalledExactlyOnceWith({
		action: "create",
		confirmed: true,
		email: "employee@example.test",
		password: "synthetic-password",
		display_name: "Employee",
		roles: ["support"],
	});
});
