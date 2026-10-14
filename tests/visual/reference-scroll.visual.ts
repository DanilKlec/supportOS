import type { BrowserContext, Locator, Page } from "@playwright/test";
import { accessToken, fixedTime } from "./data";
import { expect, test } from "./fixture";

const project = {
	id: "visual-project",
	name: "Тестовый проект",
	slug: "visual-project",
};
const addresses = Array.from({ length: 35 }, (_, order) => ({
	id: `address-${order}`,
	type: `Адрес ${order + 1}`,
	email: `team-${order + 1}@example.test`,
	order,
}));
const datasets: Record<string, unknown[]> = {
	emails: Array.from({ length: 45 }, (_, index) => ({
		id: index === 0 ? project.id : `email-project-${index}`,
		projectName: `Проект ${String(index + 1).padStart(2, "0")}`,
		slug: `project-${index}`,
		updatedAt: fixedTime,
		addresses: index === 0 || index === 44 ? addresses : [addresses[0]],
	})),
	bonuses: [
		{
			...project,
			updatedAt: fixedTime,
			bonuses: Array.from({ length: 12 }, (_, index) => ({
				id: `bonus-${index}`,
				name: `Бонус ${index + 1}`,
				order: index,
				content: "Проверенные условия тестового бонуса.\n\n".repeat(8),
				minDepositAmount: 20,
				minDepositCurrency: "EUR",
				checkedAt: fixedTime,
			})),
		},
	],
	"bonus-tools": [
		{
			id: "rules",
			loadedAt: fixedTime,
			sourceUrl: "",
			warnings: [],
			rules: Array.from({ length: 45 }, (_, index) => ({
				id: `rule-${index}`,
				projectId: project.id,
				site: `Проект ${index + 1}`,
				group: "Welcome",
				welcomeWager: "x30",
				welcomeMaxWin: "1000 EUR",
				noDeposit: "-",
				retentionWager: "x30",
				retentionMaxWin: "1000 EUR",
				events: "Условия проверены",
				map: "100 EUR",
				note: "Тестовые данные",
				searchText: `Проект ${index + 1}`,
			})),
			currencyTables: [
				{
					name: "CurrencyTest",
					currencies: ["EUR", "USD"],
					rows: Array.from({ length: 35 }, (_, index) => ({
						base: `${(index + 1) * 100} EUR`,
						baseAmount: (index + 1) * 100,
						values: {
							EUR: `${(index + 1) * 100} EUR`,
							USD: `${(index + 1) * 110} USD`,
						},
					})),
				},
			],
		},
	],
};

async function installLongDirectories(context: BrowserContext) {
	await context.addInitScript(
		({ time }) => {
			if (location.origin !== "http://127.0.0.1:4173") return;
			localStorage.setItem(
				"supportos:currency-rates:v1",
				JSON.stringify({
					base: "USD",
					date: "2026-01-15",
					updatedAt: time,
					source: "test fixture",
					rates: { USD: 1, EUR: 0.9 },
				}),
			);
		},
		{ time: fixedTime },
	);
	// Reuse isolated auth/RBAC and deny-by-default network guards from fixture.ts.
	// Only read-only synthetic data differs; no production backend is contacted.
	await context.route("**/api/**", async (route) => {
		const request = route.request();
		if (
			request.method() !== "GET" ||
			request.headers().authorization !== `Bearer ${accessToken}`
		)
			return route.fallback();
		const url = new URL(request.url());
		if (url.origin !== "http://127.0.0.1:4173") return route.fallback();
		const dataset = url.searchParams.get("dataset");
		if (url.pathname === "/api/projects")
			return route.fulfill({ json: { projects: [project] } });
		if (
			url.pathname !== "/api/content" ||
			!dataset ||
			!Object.hasOwn(datasets, dataset)
		)
			return route.fallback();
		return route.fulfill({
			json: {
				id: "scroll-fixture",
				data: datasets[dataset],
				version: 1,
				updated_at: fixedTime,
			},
		});
	});
}

async function assertBoundedPage(page: Page) {
	const geometry = await page
		.locator(".supportos-page-scroll")
		.evaluate((element) => {
			const main = element.closest(".workspace-main");
			if (!main) throw new Error("Missing workspace container");
			const box = element.getBoundingClientRect();
			const bounds = main.getBoundingClientRect();
			return {
				bounded: box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1,
				horizontalOverflow: [
					document.documentElement,
					document.body,
					main,
					element,
				].some((node) => node.scrollWidth > node.clientWidth + 1),
			};
		});
	expect(geometry).toEqual({ bounded: true, horizontalOverflow: false });
}

async function assertScrollable(page: Page, container: Locator) {
	const size = await container.evaluate((element) => ({
		height: element.clientHeight,
		content: element.scrollHeight,
	}));
	expect(size.height).toBeGreaterThan(100);
	expect(size.content).toBeGreaterThan(size.height + 100);
	const box = await container.boundingBox();
	if (!box) throw new Error("Missing scroll box");
	// Wheel over the left padding, outside nested tables/lists.
	await page.mouse.move(box.x + 5, box.y + Math.min(box.height / 2, 200));
	await page.mouse.wheel(0, 350);
	await expect
		.poll(() => container.evaluate((element) => element.scrollTop))
		.toBeGreaterThan(0);
}

async function assertReachedBottom(container: Locator, lastItem: Locator) {
	await container.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect
		.poll(async () => {
			const bounds = await container.boundingBox();
			const item = await lastItem.boundingBox();
			return Boolean(
				bounds &&
					item &&
					item.y + item.height > bounds.y &&
					item.y + item.height <= bounds.y + bounds.height + 1,
			);
		})
		.toBe(true);
}

for (const role of ["support", "admin"] as const) {
	test.describe(`${role} reference scrolling`, () => {
		test.use({ visualAuth: role });
		test("email directory and addresses remain reachable without project filtering", async ({
			page,
			context,
			isMobile,
		}) => {
			await installLongDirectories(context);
			await page.goto("/project-emails");
			await expect(page.getByText("45 из 45 проектов")).toBeVisible();
			await expect(page.getByRole("combobox")).toHaveCount(0);
			await assertBoundedPage(page);
			const list = page.locator("aside .supportos-scroll");
			await assertScrollable(page, list);
			await assertReachedBottom(
				list,
				list.getByRole("button", { name: /Проект 45/ }),
			);
			await list.getByRole("button", { name: /Проект 45/ }).click();
			const detail = isMobile
				? page.locator(".supportos-page-scroll")
				: page.locator(".supportos-page-scroll main");
			await assertScrollable(page, detail);
			await assertReachedBottom(detail, detail.locator("pre"));
		});
		for (const [url, heading, lastSelector] of [
			["/bonuses", "Приветственные бонусы", ".divide-y > .grid:last-child"],
			[
				"/bonuses#calculator",
				"Инструменты бонусов",
				"table:last-child tbody tr:last-child",
			],
		]) {
			test(`${heading}: page scroll reaches the last item`, async ({
				page,
				context,
			}) => {
				await installLongDirectories(context);
				await page.goto(url);
				await expect(
					page.getByRole("heading", { name: heading, exact: true }),
				).toBeVisible();
				if (heading === "Инструменты бонусов") {
					await expect(
						page.getByRole("button", { name: "Добавить правило", exact: true }),
					).toHaveCount(0);
					await expect(
						page.getByRole("button", { name: "Изменить", exact: true }),
					).toHaveCount(0);
				}
				const scroll = page.locator(".supportos-page-scroll");
				await expect(scroll.locator(lastSelector).last()).toBeAttached();
				await assertBoundedPage(page);
				await assertScrollable(page, scroll);
				await assertReachedBottom(scroll, scroll.locator(lastSelector).last());
			});
		}
	});
}
