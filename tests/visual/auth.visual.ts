import { expect, test } from "./fixture";
import {
	accessToken,
	authSession,
	authUser,
	roles,
	supportPermissions,
	userId,
} from "./data";

test("preview cannot serve business APIs without the mock", async ({
	request,
}) => {
	const response = await request.get("/api/accounts?action=me");
	expect(response.status()).toBe(403);
});

test.describe("anonymous", () => {
	test.use({ visualAuth: "anonymous" });
	test("production route guard still requires login", async ({ page }) => {
		await page.goto("/admin#users");
		await expect(page).toHaveURL(/\/login/);
		await expect(
			page.getByRole("table", { name: "Реестр пользователей" }),
		).toHaveCount(0);
	});
	test("accepts an employee invitation in a fresh browser and sets a password", async ({
		context,
		page,
	}) => {
		const invited = {
			...authUser,
			app_metadata: { ...authUser.app_metadata, supportos_invitation: true },
		};
		let passwordWrites = 0;
		const cors = { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" };
		await context.route(
			"https://supportos-visual.invalid/auth/v1/user",
			(route) => {
				if (route.request().method() === "PUT") {
					expect(route.request().postDataJSON()).toMatchObject({
						password: "test-invited-password",
					});
					passwordWrites++;
				}
				return route.fulfill({ headers: cors, json: invited });
			},
		);
		await context.route("**/api/accounts?action=me", (route) =>
			route.fulfill({
				json: {
					id: userId,
					access: {
						status: "active",
						roles: [roles[0]],
						permissions: supportPermissions,
						version: 1,
					},
					mfaEnabled: false,
				},
			}),
		);
		await context.route("**/api/registration?action=logout-all", (route) =>
			route.fulfill({ json: { ok: true } }),
		);
		await context.route(
			"https://supportos-visual.invalid/auth/v1/logout?**",
			(route) => route.fulfill({ headers: cors, status: 204 }),
		);
		const fragment = new URLSearchParams({
			access_token: accessToken,
			refresh_token: authSession.refresh_token,
			expires_in: "3600",
			token_type: "bearer",
			type: "invite",
		});
		await page.goto(`/login?invite=1#${fragment}`);
		await expect(
			page.getByRole("heading", { name: "Активируйте аккаунт SupportOS" }),
		).toBeVisible();
		expect(new URL(page.url()).hash).toBe("");
		await page
			.getByLabel("Новый пароль", { exact: true })
			.fill("test-invited-password");
		await page.getByLabel("Повторите пароль").fill("test-invited-password");
		await page.getByRole("button", { name: "Сохранить пароль" }).click();
		await expect(
			page.getByText("Пароль установлен. Войдите в SupportOS."),
		).toBeVisible();
		expect(passwordWrites).toBe(1);
	});
});

test.describe("unverified SDK session", () => {
	test.use({ visualAuth: "invalid" });
	test("cached token is not enough without getUser verification", async ({
		page,
		network,
	}) => {
		await page.goto("/admin#users");
		await expect(page).toHaveURL(/\/login/);
		expect(network.reads).toContain("auth/user");
		await expect(
			page.getByRole("table", { name: "Реестр пользователей" }),
		).toHaveCount(0);
	});
});

test.describe("support without admin/composer permissions", () => {
	test.use({ visualAuth: "support" });
	test("server access response still controls admin navigation", async ({
		page,
	}) => {
		await page.goto("/admin#users");
		await expect(page).toHaveURL(/\/settings/);
		await expect(
			page.getByRole("table", { name: "Реестр пользователей" }),
		).toHaveCount(0);
	});
	test("composer.use is still required for a direct link", async ({ page }) => {
		await page.goto("/#composer-answer");
		await expect(page).toHaveURL(/\/settings/);
		await expect(
			page.getByRole("complementary", { name: "Помощник ответа" }),
		).toHaveCount(0);
	});
});
