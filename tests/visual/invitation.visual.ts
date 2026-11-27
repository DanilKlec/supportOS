import { defaultInvitation } from "../../shared/staff-invitation.js";
import { accessToken, authUser, knowledge } from "./data";
import { expect, test } from "./fixture";

test("edit, preview and save an invitation from administration", async ({ context, page }, info) => {
	const sender = { id: "invites", address: "invites@example.invalid" };
	let settings = { senderId: null as string | null, revision: 1, template: { ...defaultInvitation } };
	await context.route("**/api/binds?action=workspace", (route) =>
		route.fulfill({ json: { ...knowledge, branches: { choices: {}, incoming: [], outgoing: [] } } }),
	);
	await context.route("**/api/accounts?action=invitation-template", (route) => {
		const request = route.request();
		expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
		if (request.method() === "GET")
			return route.fulfill({ json: { ...settings, senders: [sender], gmailConfigured: true } });
		expect(request.method()).toBe("POST");
		const changes = request.postDataJSON() as typeof settings;
		expect(changes.revision).toBe(settings.revision);
		settings = { ...changes, revision: settings.revision + 1 };
		return route.fulfill({ json: settings });
	});
	await page.goto("/admin#invitation-template");
	await expect(page.getByRole("heading", { name: "Письмо-приглашение", exact: true })).toBeVisible();
	await page.getByRole("combobox", { name: "Отправитель" }).selectOption(sender.id);
	await page.getByRole("textbox", { name: "Тема письма" }).fill("Доступ к SupportOS");
	await page.getByRole("textbox", { name: "Заголовок", exact: true }).fill("Рады видеть вас, {{name}}");
	await page.getByRole("textbox", { name: "Текст кнопки" }).fill("Начать работу");
	const preview = page.frameLocator('iframe[title="Предпросмотр письма-приглашения"]');
	await expect(preview.getByRole("heading", { name: "Рады видеть вас, Анна" })).toBeVisible();
	await expect(preview.getByText("Начать работу", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Сохранить шаблон" }).click();
	await expect(page.getByText("Шаблон сохранён")).toBeVisible();
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Тема письма" })).toHaveValue("Доступ к SupportOS");
	await expect(page.getByRole("combobox", { name: "Отправитель" })).toHaveValue(sender.id);
	await expect(page.locator("html")).toHaveJSProperty("scrollWidth", await page.evaluate(() => document.documentElement.clientWidth));
	await page.screenshot({ path: info.outputPath("invitation-builder.png"), animations: "disabled" });
});

test("enter Google Authenticator digits in the sign-in screen", async ({ context, page }, info) => {
	const factor = "00000000-0000-4000-8000-000000000123";
	const factors = [{ id: factor, status: "verified", factor_type: "totp", friendly_name: "Телефон" }];
	await context.route("**/api/accounts?action=me", (route) =>
		route.fulfill({ status: 403, json: { code: "mfa_required" } }),
	);
	await context.route("https://supportos-visual.invalid/auth/v1/user", (route) =>
		route.fulfill({ json: { ...authUser, factors } }),
	);
	await context.route(`https://supportos-visual.invalid/auth/v1/factors/${factor}/challenge`, (route) =>
		route.fulfill({ json: { id: "challenge", type: "totp", expires_at: 4102444800 } }),
	);
	let verified = false;
	await context.route(`https://supportos-visual.invalid/auth/v1/factors/${factor}/verify`, (route) => {
		expect(route.request().postDataJSON()).toMatchObject({ code: "012345", challenge_id: "challenge" });
		verified = true;
		return route.fulfill({ status: 400, json: { code: "mfa_verification_failed", message: "Synthetic error" } });
	});
	await page.goto("/login");
	await expect(page.getByRole("heading", { name: "Подтвердите вход" })).toBeVisible();
	const digits = page.getByRole("textbox", { name: /Цифра \d из 6/ });
	await expect(digits).toHaveCount(6);
	await expect(digits.first()).toBeFocused();
	const signIn = page.getByRole("button", { name: "Войти", exact: true });
	await expect(signIn).toBeDisabled();
	await page.keyboard.type("012345");
	for (let index = 0; index < 6; index++) await expect(digits.nth(index)).toHaveValue(String(index));
	await expect(signIn).toBeEnabled();
	await page.screenshot({ path: info.outputPath("sign-in-2fa.png"), animations: "disabled" });
	await signIn.click();
	await expect(page.getByRole("alert")).toContainText("Не удалось подтвердить код");
	expect(verified).toBe(true);
	await expect(digits.first()).toHaveValue("");
	await expect(digits.first()).toBeFocused();
});

test("set and confirm a new password in the recovery screen", async ({ context, page }, info) => {
	let submissions = 0;
	await context.route("https://supportos-visual.invalid/auth/v1/user", (route) => {
		if (route.request().method() !== "PUT") return route.fallback();
		expect(route.request().postDataJSON()).toMatchObject({ password: "Synthetic-password-2026" });
		submissions++;
		return route.fulfill({ status: 422, json: { code: "weak_password", message: "Тестовый ответ сервера" } });
	});
	await page.goto("/login?recovery=1");
	await expect(page.getByRole("heading", { name: "Новый пароль" })).toBeVisible();
	const password = page.getByLabel("Новый пароль", { exact: true }).and(page.locator("input"));
	const confirmation = page.getByLabel("Повторите пароль", { exact: true });
	const save = page.getByRole("button", { name: "Сохранить пароль" });
	await expect(password).toHaveAttribute("type", "password");
	await page.screenshot({ path: info.outputPath("new-password.png"), animations: "disabled" });
	await password.fill("Synthetic-password-2026");
	await page.getByRole("button", { name: /Показать поле «Новый пароль»/ }).click();
	await expect(password).toHaveAttribute("type", "text");
	await page.getByRole("button", { name: /Скрыть поле «Новый пароль»/ }).click();
	await confirmation.fill("Different-password-2026");
	await save.click();
	await expect(page.getByRole("alert")).toHaveText("Пароли не совпадают");
	expect(submissions).toBe(0);
	await confirmation.fill("Synthetic-password-2026");
	await save.click();
	await expect(page.getByRole("alert")).toHaveText("Тестовый ответ сервера");
	expect(submissions).toBe(1);
});

test("show the new password form from an invitation link", async ({ context, page }) => {
	const invitedUser = {
		...authUser,
		app_metadata: { ...authUser.app_metadata, supportos_invitation: true },
	};
	await context.route("https://supportos-visual.invalid/auth/v1/user", (route) =>
		route.fulfill({ json: invitedUser }),
	);
	const fragment = new URLSearchParams({
		access_token: accessToken,
		refresh_token: "visual-invite-token",
		expires_in: "3600",
		token_type: "bearer",
		type: "invite",
	});
	await page.goto(`/login?invite=1#${fragment}`);
	await expect(page.getByRole("heading", { name: "Активируйте аккаунт SupportOS" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Сохранить пароль" })).toBeVisible();
});
