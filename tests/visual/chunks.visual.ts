import type { Page } from "@playwright/test";
import { expect, test } from "./fixture";

const workflowChunk =
	/\/(AccountsPanel|AIControlCenter|SharedBindsPage|DepositBonusesPage|ProjectEmailsPage|BonusToolsPage)-[^/]+\.js$/;
function workflowRequests(page: Page) {
	const names = new Set<string>();
	page.on("request", (request) => {
		const match = new URL(request.url()).pathname.match(workflowChunk);
		if (match) names.add(match[1]);
	});
	return names;
}
async function section(
	page: Page,
	isMobile: boolean,
	id: string,
	label: string,
) {
	if (isMobile) await page.locator(".ops-mobile-nav select").selectOption(id);
	else
		await page
			.locator(".ops-sidebar")
			.getByRole("button", { name: label, exact: true })
			.click();
}

test("home never requests large management workflow chunks", async ({
	page,
}) => {
	const requests = workflowRequests(page);
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Пространство биндов" }),
	).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect([...requests]).toEqual([]);
});

test("admin overview defers the users screen until section navigation", async ({
	page,
	isMobile,
}) => {
	const requests = workflowRequests(page);
	await page.goto("/admin");
	await expect(
		page
			.locator(".ops-heading")
			.getByRole("heading", { name: "Панель администратора" }),
	).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect([...requests]).toEqual([]);
	await section(page, isMobile, "users", "Пользователи");
	await expect(
		page.getByRole("table", { name: "Реестр пользователей" }),
	).toBeVisible();
	expect([...requests]).toEqual(["AccountsPanel"]);
});

test("QC loads only the selected materials workflow, not AI or bonus management", async ({
	page,
	isMobile,
}) => {
	const requests = workflowRequests(page);
	await page.goto("/qc");
	await expect(page.locator(".qc-metrics")).toBeVisible();
	await page.waitForLoadState("networkidle");
	expect([...requests]).toEqual([]);
	await section(page, isMobile, "materials", "Материалы");
	await expect(
		page.getByRole("button", { name: "Общая база", exact: true }),
	).toBeVisible();
	expect([...requests]).toEqual(["SharedBindsPage"]);
	if (isMobile)
		await page.locator(".qc-tab-select select").selectOption("emails");
	else
		await page
			.locator(".qc-tabs")
			.getByRole("button", { name: "Почты", exact: true })
			.click();
	await expect.poll(() => requests.has("ProjectEmailsPage")).toBe(true);
	await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
	expect([...requests]).toEqual(["SharedBindsPage", "ProjectEmailsPage"]);
});

test("quick project emails does not download either bonus workflow", async ({
	page,
}) => {
	const requests = workflowRequests(page);
	await page.goto("/project-emails");
	await expect.poll(() => requests.has("ProjectEmailsPage")).toBe(true);
	await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
	await page.waitForLoadState("networkidle");
	expect([...requests]).toEqual(["ProjectEmailsPage"]);
});
