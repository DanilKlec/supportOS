import type { Page } from "@playwright/test";
import { expect, test } from "./fixture";

async function ready(page: Page) {
	await page.evaluate(() => document.fonts.ready);
	await expect(page.locator(".app-shell")).toBeVisible();
	await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
	await page.mouse.move(0, 0);
}

async function screenshot(page: Page, name: string) {
	await ready(page);
	const overflow = await page.evaluate(() =>
		[
			document.documentElement,
			...document.querySelectorAll<HTMLElement>(
				".workspace-main, .ops-content, .settings-page, .modal-body",
			),
		]
			.filter(
				(element) =>
					element.clientWidth > 0 &&
					element.scrollWidth > element.clientWidth + 1,
			)
			.map((element) => element.className || element.tagName),
	);
	expect(
		overflow,
		"Page containers must not overflow horizontally; tables may scroll internally",
	).toEqual([]);
	// Keep shell, headers, toolbars and all controls visible. Content comes from
	// small synthetic fixtures, never live records/timestamps/provider responses.
	await expect(page).toHaveScreenshot(name);
}

test("workspace shell and mobile sidebar", async ({
	page,
	network,
	isMobile,
}) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Пространство биндов" }),
	).toBeVisible();
	await expect
		.poll(() => network.reads.has("/api/binds?action=knowledge"))
		.toBe(true);
	await expect(
		page
			.getByRole("button", { name: "Ответ на обращение", exact: true })
			.last(),
	).toBeVisible();
	await screenshot(page, "workspace.png");
	if (isMobile) {
		await page
			.getByRole("button", { name: "Свернуть папки", exact: true })
			.click();
		await expect(
			page
				.getByRole("complementary")
				.getByRole("button", { name: "Закрыть папки" }),
		).toBeVisible();
		await screenshot(page, "workspace-sidebar.png");
		await page
			.getByRole("complementary")
			.getByRole("button", { name: "Закрыть папки" })
			.click();
	}
	await page
		.locator(".workspace-main")
		.getByRole("button", { name: "Ответ на обращение", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Ответ на обращение", level: 1 }),
	).toBeVisible();
	await screenshot(page, "workspace-bind.png");
	expect(network.reads).toContain("auth/user");
	expect(network.reads).toContain("/api/accounts?action=me");
});

test("admin users registry and toolbar", async ({ page }) => {
	await page.goto("/admin#users");
	await expect(
		page.getByRole("table", { name: "Реестр пользователей" }),
	).toBeVisible();
	await expect(
		page.getByText("Тестовый сотрудник", { exact: true }),
	).toBeVisible();
	await screenshot(page, "admin-users.png");
	const toolbar = page.locator(".user-registry-filters");
	await toolbar.scrollIntoViewIfNeeded();
	await page.mouse.move(0, 0);
	await expect(toolbar).toHaveScreenshot("admin-users-toolbar.png");
});

for (const pending of [false, true]) {
	test(`admin ${pending ? "pending" : "active"} user drawer and action footer`, async ({
		page,
	}) => {
		await page.goto("/admin#users");
		const row = page
			.getByRole("row")
			.filter({ hasText: pending ? "Новый сотрудник" : "Тестовый сотрудник" });
		await row.getByRole("button", { name: "Изменить", exact: true }).click();
		const drawer = page.getByRole("dialog", {
			name: "Профиль и доступы сотрудника",
		});
		await expect(
			drawer.getByRole("textbox", { name: "Имя сотрудника" }),
		).toBeVisible();
		await screenshot(page, `user-drawer-${pending ? "pending" : "active"}.png`);
		const footer = drawer.locator(".employee-access-footer");
		await footer.scrollIntoViewIfNeeded();
		await expect(
			footer.getByRole("button", {
				name: pending ? "Подтвердить и выдать роли" : "Сохранить доступ",
			}),
		).toBeVisible();
		await page.mouse.move(0, 0);
		await expect(drawer).toHaveScreenshot(
			`user-drawer-${pending ? "pending" : "active"}-footer.png`,
		);
	});
}

test("qc materials navigation and toolbar", async ({ page }) => {
	await page.goto("/qc#materials");
	await expect(
		page.getByRole("heading", { name: "Общие бинды" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Обновить общие бинды" }),
	).toBeEnabled();
	await expect(
		page.getByText("Спасибо за обращение.", { exact: false }).first(),
	).toBeVisible();
	await screenshot(page, "qc-materials.png");
	const toolbar = page
		.locator("div")
		.filter({
			has: page.getByPlaceholder("Найти ответ, название или тег…"),
		})
		.filter({ has: page.getByRole("combobox", { name: "Язык ответа" }) })
		.last();
	await toolbar.scrollIntoViewIfNeeded();
	await page.mouse.move(0, 0);
	await expect(toolbar).toHaveScreenshot("qc-materials-toolbar.png");
});

test("settings header and controls", async ({ page }) => {
	await page.goto("/settings");
	await expect(
		page.getByRole("heading", { name: "Общие", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Выйти", exact: true }),
	).toBeVisible();
	await screenshot(page, "settings.png");
});

test("open SupportComposer header, settings and actions", async ({ page }) => {
	await page.goto("/#composer-answer");
	const composer = page.getByRole("complementary", { name: "Помощник ответа" });
	await expect(composer).toBeVisible();
	await expect(
		composer.getByText("AI · OpenAI", { exact: true }).first(),
	).toBeVisible();
	await expect(
		composer.getByRole("textbox", { name: "Сообщение клиента" }),
	).toBeVisible();
	await screenshot(page, "composer.png");
	await composer
		.getByRole("button", { name: "Подготовить ответ", exact: true })
		.scrollIntoViewIfNeeded();
	await page.mouse.move(0, 0);
	await expect(composer).toHaveScreenshot("composer-actions.png");
});
