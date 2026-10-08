import { expect, test } from "./fixture";

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
