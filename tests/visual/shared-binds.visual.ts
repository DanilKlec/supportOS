import { accessToken, bindRows, fixedTime } from "./data";
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
