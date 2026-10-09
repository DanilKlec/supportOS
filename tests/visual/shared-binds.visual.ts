import { accessToken, bindRows, fixedTime, knowledge, userId } from "./data";
import { expect, test } from "./fixture";

test("common material location/color survives publication and navigation without production writes", async ({
	page,
	context,
	isMobile,
}) => {
	const rows = structuredClone(bindRows);
	let writes = 0;
	await context.route("**/api/binds**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (
			url.origin !== "http://127.0.0.1:4173" ||
			request.headers().authorization !== `Bearer ${accessToken}`
		)
			return route.fallback();
		if (
			request.method() === "GET" &&
			url.searchParams.get("action") === "shared"
		)
			return route.fulfill({ json: { rows } });
		if (request.method() !== "POST") return route.fallback();
		const body = request.postDataJSON();
		// Only this exact synthetic operation is accepted. Never forward writes.
		if (body.action !== "shared-save") return route.fallback();
		expect(body).toMatchObject({
			categoryId: "visual-category",
			folderId: "visual-folder",
			color: "#10B981",
		});
		writes++;
		const row = {
			...bindRows[0],
			id: "published-fixture",
			slug: "published-fixture",
			color: body.color,
			translations: body.translations,
			updated_at: fixedTime,
		};
		rows.push(row);
		return route.fulfill({ json: row });
	});
	await page.goto("/qc#materials");
	await page
		.getByRole("button", { name: "Добавить бинд", exact: true })
		.click();
	const editor = page.getByRole("dialog", { name: "Новый общий бинд" });
	await editor
		.getByLabel("Название", { exact: true })
		.fill("Новый ответ команды");
	await editor
		.getByLabel("Текст ответа", { exact: true })
		.fill("Синтетический ответ команды для проверки публикации.");
	await editor
		.getByRole("combobox", { name: "Раздел", exact: true })
		.selectOption("visual-category");
	await editor
		.getByRole("combobox", { name: "Папка", exact: true })
		.selectOption("visual-folder");
	await editor
		.getByRole("button", { name: "Цвет #10B981", exact: true })
		.click();
	const overflow = await editor.evaluate((element) => ({
		modal: element.scrollWidth > element.clientWidth,
		page: document.documentElement.scrollWidth > innerWidth,
	}));
	expect(overflow).toEqual({ modal: false, page: false });
	await editor
		.getByRole("button", { name: "Проверить изменения", exact: true })
		.click();
	expect(writes).toBe(0);
	await editor
		.getByRole("button", { name: "Опубликовать для всех", exact: true })
		.click();
	await expect(editor).toBeHidden();
	expect(writes).toBe(1);
	await page.goto("/");
	if (isMobile)
		await page
			.getByRole("button", { name: "Свернуть папки", exact: true })
			.click();
	const common = page.getByRole("region", { name: "Общие бинды", exact: true });
	await expect(
		common.getByRole("button", { name: "Общие", exact: true }),
	).toBeVisible();
	await expect(
		common.getByRole("button", { name: "Новый ответ команды", exact: true }),
	).toHaveCount(1);
	await expect(
		common.getByRole("button", { name: "Материалы команды", exact: true }),
	).toBeVisible();
	await expect(
		common.getByRole("button", { name: "Работа с обращениями", exact: true }),
	).toBeVisible();
	await expect(
		common.getByRole("button", { name: "Новый ответ команды", exact: true }),
	).toBeVisible();
	await expect(
		common
			.getByRole("button", { name: "Новый ответ команды", exact: true })
			.locator("svg.lucide-file-text"),
	).toHaveCSS("color", "rgb(16, 185, 129)");
	await common
		.getByRole("button", { name: "Новый ответ команды", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "Новый ответ команды", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Общая", exact: true }),
	).toHaveAttribute("aria-pressed", "true");
});

test("library actions survive personal save, returning to common and reloading with a stale link", async ({
	page,
	context,
	isMobile,
}) => {
	const source = bindRows[0];
	const own = {
		...source,
		id: "visual-personal-bind",
		owner_id: userId,
		source_bind_id: source.id,
		source_hash: fixedTime,
	};
	let saved = false;
	let choice = "main";
	await context.route("**/api/binds**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (
			url.origin !== "http://127.0.0.1:4173" ||
			request.headers().authorization !== `Bearer ${accessToken}`
		)
			return route.fallback();
		if (request.method() === "GET") {
			if (url.searchParams.get("user_id") === userId)
				return route.fulfill({ json: { rows: saved ? [own] : [] } });
			if (url.searchParams.get("action") === "branches")
				return route.fulfill({
					json: { choices: { [source.id]: choice }, incoming: [], outgoing: [] },
				});
			if (url.searchParams.get("action") === "knowledge" && saved)
				return route.fulfill({
					json: {
						...knowledge,
						binds: [
							knowledge.binds[1],
							{
								...knowledge.binds[0],
								id: own.id,
								ownerId: userId,
								sourceBindId: source.id,
								translations: own.translations,
							},
						],
					},
				});
			return route.fallback();
		}
		if (request.method() !== "POST") return route.fallback();
		const body = request.postDataJSON();
		// Accept only these exact synthetic operations; all other writes stay blocked.
		if (
			body.action === "save" &&
			body.sourceId === source.id &&
			body.userId === userId
		) {
			own.translations = body.translations;
			saved = true;
			return route.fulfill({ json: own });
		}
		if (
			body.action === "choose" &&
			body.sourceId === source.id &&
			["main", "mine"].includes(body.branch)
		) {
			choice = body.branch;
			return route.fulfill({ json: { ok: true } });
		}
		return route.fallback();
	});
	const openSource = async () => {
		const common = page.getByRole("region", { name: "Общие бинды", exact: true });
		if (isMobile && !(await common.isVisible()))
			await page
				.getByRole("button", { name: "Свернуть папки", exact: true })
				.click();
		await common
			.getByRole("button", { name: "Ответ на обращение", exact: true })
			.click();
	};
	const expectActions = async () => {
		await page.getByLabel("Действия бинда", { exact: true }).click();
		const menu = page.getByRole("menu");
		for (const name of [
			"Переместить в папку",
			"Дублировать",
			"В избранное",
			"Закрепить вкладку",
			"В архив",
		])
			await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
		const box = await menu.boundingBox();
		const viewport = page.viewportSize();
		expect(
			box && viewport && box.x >= 0 && box.x + box.width <= viewport.width,
		).toBeTruthy();
		await menu.getByRole("button", { name: "В архив", exact: true }).click();
		const confirmation = page.getByRole("dialog").filter({
			has: page.getByRole("heading", { name: "Удалить", exact: true }),
		});
		await expect(confirmation).toBeVisible();
		await confirmation
			.getByRole("button", { name: "Отмена", exact: true })
			.click();
	};
	await page.goto("/");
	await openSource();
	await page
		.getByRole("button", { name: "Изменить для себя", exact: true })
		.click();
	const editor = page.getByRole("dialog").filter({
		has: page.getByRole("heading", { name: "Личная версия ответа", exact: true }),
	});
	await editor
		.getByRole("textbox", { name: "Текст ответа", exact: true })
		.fill("Мой синтетический ответ.");
	await editor
		.getByRole("button", { name: "Сохранить личную версию", exact: true })
		.click();
	await expect(editor).toBeHidden();
	await expect(page.getByRole("button", { name: "Моя", exact: true })).toHaveAttribute(
		"aria-pressed", "true",
	);
	await page.getByRole("button", { name: "Общая", exact: true }).click();
	await expect(page.getByRole("button", { name: "Общая", exact: true })).toHaveAttribute(
		"aria-pressed", "true",
	);
	await expectActions();
	await page.reload();
	await openSource();
	await expectActions();
});
