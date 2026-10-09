import type { BrowserContext, Page } from "@playwright/test";
import * as fixtureData from "./data";
import { expect, test } from "./fixture";

const longWord = "customerSupportProjectReference".repeat(4);
const project = {
	id: "visual-project",
	name: `Проект поддержки · ${longWord}`,
	slug: "visual-project",
};
const title = `Ответ на обращение · ${longWord}`;
const email = `support-${"team".repeat(18)}@example.test`;
const content = `Условия обращения: https://example.test/policy/${longWord}

| Материал | Статус | Примечание |
| --- | --- | --- |
| ${longWord} | Проверен | ${longWord} |`;
const knowledge = structuredClone(fixtureData.knowledge);
knowledge.binds[0].translations[0] = {
	...knowledge.binds[0].translations[0],
	title,
	content,
};
const datasets: Record<string, unknown[]> = {
	emails: [
		{
			id: project.id,
			projectName: project.name,
			updatedAt: fixtureData.fixedTime,
			addresses: [
				{
					id: "visual-email",
					type: "Responsible Gaming",
					email,
					note: `Ссылка: https://example.test/policy/${longWord}`,
					order: 0,
				},
			],
		},
	],
	bonuses: [
		{
			...project,
			updatedAt: fixtureData.fixedTime,
			bonuses: [
				{
					id: "visual-bonus",
					name: `Приветственный бонус · ${longWord}`,
					content,
					order: 0,
					minDepositAmount: 20,
					minDepositCurrency: "EUR",
					translations: [
						{ language: "ru", content, updatedAt: fixtureData.fixedTime },
					],
					checkedAt: fixtureData.fixedTime,
				},
			],
		},
	],
	"bonus-tools": [
		{
			id: "rules",
			sourceUrl: `https://example.test/source/${longWord}`,
			loadedAt: fixtureData.fixedTime,
			warnings: [],
			rules: [
				{
					id: "visual-rule",
					projectId: project.id,
					group: "Welcome",
					site: project.name,
					welcomeWager: "x30",
					welcomeMaxWin: "10000 EUR",
					noDeposit: "-",
					retentionWager: "x30",
					retentionMaxWin: "10000 EUR",
					events: "Проверенные условия",
					map: "100 EUR",
					note: longWord,
					searchText: longWord,
				},
			],
			currencyTables: [
				{
					name: `Таблица валют · ${longWord}`,
					currencies: ["EUR", "USD", "CAD", "AUD", "BRL", "TRY", "PLN", "GBP"],
					rows: [
						{
							base: "100 EUR",
							baseAmount: 100,
							values: {
								EUR: "100 EUR",
								USD: "110 USD",
								CAD: "150 CAD",
								AUD: "160 AUD",
								BRL: "500 BRL",
								TRY: "3000 TRY",
								PLN: "400 PLN",
								GBP: "90 GBP",
							},
						},
					],
				},
			],
		},
	],
};

async function installResponsiveData(context: BrowserContext) {
	// Extend the existing invalid-signature auth fixture, not production access.
	// Only synthetic authenticated GETs are fulfilled; all writes/unknown requests
	// still go through the fixture's deny-by-default network guard.
	await context.addInitScript(
		({ fixedTime }) => {
			if (location.origin !== "http://127.0.0.1:4173") return;
			localStorage.setItem(
				"supportos:currency-rates:v1",
				JSON.stringify({
					base: "USD",
					date: "2026-01-15",
					updatedAt: fixedTime,
					source: "test fixture",
					rates: { USD: 1, EUR: 0.9 },
				}),
			);
		},
		{ fixedTime: fixtureData.fixedTime },
	);
	await context.route("**/*", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const action = url.searchParams.get("action");
		const api =
			url.origin === "http://127.0.0.1:4173" &&
			url.pathname.startsWith("/api/");
		const auth =
			url.origin === "https://supportos-visual.invalid" &&
			url.pathname === "/auth/v1/user";
		if (
			(!api && !auth) ||
			request.method() !== "GET" ||
			request.headers().authorization !== `Bearer ${fixtureData.accessToken}`
		)
			return route.fallback();
		let data: unknown;
		if (auth) data = { ...fixtureData.authUser, email };
		if (url.pathname === "/api/projects") data = { projects: [project] };
		const dataset = url.searchParams.get("dataset");
		if (
			url.pathname === "/api/content" &&
			dataset &&
			Object.hasOwn(datasets, dataset)
		)
			data = {
				id: "visual-publication",
				data: datasets[dataset],
				version: 1,
				updated_at: fixtureData.fixedTime,
			};
		if (url.pathname === "/api/binds" && action === "knowledge")
			data = knowledge;
		if (url.pathname === "/api/binds" && action === "shared")
			data = {
				rows: knowledge.binds.map((bind, index) => ({
					...fixtureData.bindRows[index],
					translations: bind.translations,
				})),
			};
		if (url.pathname === "/api/binds" && action === "quality-signals")
			data = {
				feedback: [],
				gaps: [
					{
						id: 1,
						topic: longWord,
						project_id: project.id,
						created_at: fixtureData.fixedTime,
					},
				],
			};
		if (url.pathname === "/api/ai/knowledge")
			data = { version: 1, document: { entries: [], feedback: [], tests: [] } };
		if (url.pathname === "/api/accounts" && action === "me")
			data = {
				access: {
					userId: fixtureData.userId,
					status: "active",
					roles: fixtureData.roles.filter((role) => role.id === "admin"),
					permissions: [
						...fixtureData.permissions.map((permission) => permission.id),
						"technical",
						"ai.playground",
						"ai.tests",
					],
				},
			};
		if (url.pathname === "/api/accounts" && action === "users")
			data = {
				users: fixtureData.users.map((user, index) => ({
					...user,
					email: index ? user.email : email,
				})),
				total: 2,
				hasMore: false,
			};
		if (url.pathname === "/api/accounts" && action === "audit")
			data = { rows: [], hasMore: false };
		if (url.pathname === "/api/accounts" && action === "sessions")
			data = {
				sessions: [
					{
						id: fixtureData.sessionId,
						created_at: fixtureData.fixedTime,
						updated_at: fixtureData.fixedTime,
						user_agent: `Synthetic Browser · ${longWord}`,
						is_current: true,
					},
				],
			};
		if (url.pathname === "/api/accounts" && action === "login-history")
			data = { events: [], nextCursor: null };
		if (data === undefined) return route.fallback();
		return route.fulfill({
			json: data,
			headers: {
				"Access-Control-Allow-Origin": "http://127.0.0.1:4173",
				"Cache-Control": "no-store",
				"X-Supabase-Api-Version": "2024-01-01",
			},
		});
	});
}

async function assertLayout(page: Page, screen: string) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		for (const animation of document.getAnimations()) animation.finish();
	});
	const overflow = await page.evaluate(() => {
		const roots = [
			...document.querySelectorAll<HTMLElement>(
				"html, body, .app-shell, .workspace-main, .ops-content, .ops-page, .settings-page, .supportos-page-scroll, .modal-body, .composer-panel, .composer-panel .supportos-scroll",
			),
		]
			.filter(
				(element) =>
					element.clientWidth > 0 &&
					element.scrollWidth > element.clientWidth + 1,
			)
			.map((element) => element.className || element.tagName);
		const outside = [...document.querySelectorAll<HTMLElement>("body *")]
			.filter((element) => {
				const rect = element.getBoundingClientRect();
				if (!rect.width || rect.right <= innerWidth + 1) return false;
				// Only table descendants inside a bounded, genuine scroll container may
				// extend beyond the viewport. Clipped cards/text are not an exception.
				const parent = element.closest("table")?.parentElement;
				if (!parent || !/auto|scroll/.test(getComputedStyle(parent).overflowX))
					return true;
				const bounds = parent.getBoundingClientRect();
				return (
					bounds.left < 0 ||
					bounds.right > innerWidth + 1 ||
					parent.scrollWidth <= parent.clientWidth
				);
			})
			.map((element) => `${element.tagName}.${element.className}`);
		return { roots, outside };
	});
	expect(overflow, screen).toEqual({ roots: [], outside: [] });
	for (const table of await page.locator("table:visible").all()) {
		const scroll = await table.evaluate((element) => {
			const parent = element.parentElement;
			if (
				!parent ||
				element.getBoundingClientRect().width <= parent.clientWidth + 1
			)
				return null;
			const before = parent.scrollLeft;
			parent.scrollLeft = 100;
			const result = {
				overflow: getComputedStyle(parent).overflowX,
				moves: parent.scrollLeft > 0,
			};
			parent.scrollLeft = before;
			return result;
		});
		if (scroll)
			expect(scroll, `${screen}: wide table must scroll internally`).toEqual({
				overflow: "auto",
				moves: true,
			});
	}
}

for (const theme of ["dark", "light"]) {
	test(`responsive layouts contain long data and controlled table overflow (${theme})`, async ({
		page,
		context,
	}) => {
		const consoleErrors: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});
		await context.addInitScript((value) => {
			if (location.origin === "http://127.0.0.1:4173")
				localStorage.setItem("supportos-theme-mode", value);
		}, theme);
		await installResponsiveData(context);
		const screens = [
			["workspace", "/", "Пространство биндов"],
			["qc-overview", "/qc", "Обзор"],
			["qc-inbox", "/qc#inbox", "Очередь проверки"],
			["qc-materials", "/qc#materials", "Общие бинды"],
			["qc-emails", "/qc#emails", "Почты проектов"],
			["qc-bonuses", "/qc#bonuses", "Приветственные бонусы"],
			["qc-knowledge", "/qc#knowledge", "AI знания"],
			["qc-rules", "/qc#rules", "Правила ответов"],
			["qc-glossary", "/qc#glossary", "Глоссарий"],
			["qc-playground", "/qc#playground", "Проверка ответа"],
			["qc-tests", "/qc#tests", "Тесты"],
			["qc-instructions", "/qc#instructions", "Инструкции проектов"],
			["emails", "/project-emails", "Почты проектов"],
			["bonuses", "/bonuses", "Приветственные бонусы"],
			["bonus-tools", "/bonus-tools", "Инструменты бонусов"],
			["settings", "/settings", "Общие"],
			["settings-appearance", "/settings#appearance", "Оформление"],
			["settings-security", "/settings#security", "Безопасность"],
			["settings-data", "/settings#data", "Данные"],
			["settings-integrations", "/settings#integrations", "Интеграции"],
			["assistant", "/#composer-answer", "Помощник ответа"],
			["admin-roles", "/admin#roles", "Роли и доступы"],
			["admin-audit", "/admin#audit", "Аудит"],
			["admin-integrations", "/admin#integrations", "Интеграции"],
			["admin-drawer", "/admin#users", "Пользователи"],
		];
		for (const [screen, url, heading] of screens) {
			await page.goto(url);
			await expect(page.locator(".app-shell")).toBeVisible();
			await expect(
				page.getByRole("heading", { name: heading, exact: true }).first(),
			).toBeVisible();
			if (screen.endsWith("emails")) {
				await expect(
					page.getByText("Responsible Gaming", { exact: true }),
				).toBeVisible();
				const copyAll = page.getByRole("button", {
					name: "Копировать всё",
					exact: true,
				});
				const clipped = await copyAll.evaluate(
					(element) => element.scrollWidth > element.clientWidth + 1,
				);
				expect(clipped, `${screen}: copy action must retain its label`).toBe(
					false,
				);
			}
			if (screen.endsWith("bonuses"))
				await expect(
					page.getByText(`Приветственный бонус · ${longWord}`, { exact: true }),
				).toBeVisible();
			if (screen === "bonus-tools")
				await expect(page.locator("table").first()).toBeVisible();
			if (screen === "admin-drawer") {
				await page
					.getByRole("row")
					.filter({ hasText: "Тестовый сотрудник" })
					.getByRole("button", { name: "Изменить", exact: true })
					.click();
				const drawer = page.getByRole("dialog", {
					name: "Профиль и доступы сотрудника",
				});
				await expect(
					drawer.getByRole("textbox", { name: "Имя сотрудника" }),
				).toBeVisible();
				await assertLayout(page, screen);
				await drawer
					.locator(".employee-access-footer")
					.scrollIntoViewIfNeeded();
			}
			await assertLayout(page, screen);
			if (screen === "settings-integrations") {
				await expect(
					page.getByRole("heading", { name: "Переводчик", exact: true }),
				).toBeVisible();
				await expect(
					page.getByRole("heading", {
						name: "API спортивных событий",
						exact: true,
					}),
				).toBeVisible();
			}
			if (screen === "qc-inbox") {
				await page.locator(".ops-review-item").first().click();
				await expect(page.locator(".qc-queue-detail")).toBeVisible();
				await assertLayout(page, "qc-inbox-detail");
			}
			if (screen === "workspace") {
				await page
					.locator(".workspace-main")
					.getByRole("button", { name: title, exact: true })
					.click();
				await expect(
					page.getByRole("heading", { name: title, exact: true }),
				).toBeVisible();
				await assertLayout(page, "workspace-bind");
			}
		}
		expect(
			consoleErrors,
			"No caught React/API errors may pass a layout check",
		).toEqual([]);
	});
}
