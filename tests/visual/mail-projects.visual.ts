import { accessToken, knowledge } from "./data";
import { expect, test } from "./fixture";

test("organize accessible mailboxes into project folders", async ({ context, isMobile, page }, info) => {
	const mailboxes = Array.from({ length: 50 }, (_, index) => ({
		id: `mailbox-${index}`,
		address: `desk${index}@example.invalid`,
		provider: "gmail",
	}));
	const requestedFolders = new Set<string>();
	let gmailFolders = [{ id: "Label_1", type: "user", name: "Обращения" }];
	let canManageFolders = true;
	let releaseStats = () => {};
	const waitingForStats = new Promise<void>((resolve) => { releaseStats = resolve; });
	await context.route("**/api/binds?action=workspace", (route) =>
		route.fulfill({ json: { ...knowledge, branches: { choices: {}, incoming: [], outgoing: [] } } }),
	);
	await context.route("**/api/mail?**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (
			url.origin !== "http://127.0.0.1:4173" ||
			request.headers().authorization !== `Bearer ${accessToken}`
		) return route.fallback();
		const action = url.searchParams.get("action");
		expect(request.method()).toBe(["edit-label", "delete-label"].includes(action ?? "") ? "POST" : "GET");
		switch (url.searchParams.get("action")) {
			case "list": return route.fulfill({ json: { configured: true, admin: false, canManageFolders, mailboxes } });
			case "stats":
				await waitingForStats;
				return route.fulfill({ json: { stats: mailboxes.map(({ id }, index) => ({
					id, unread: index === 0 ? 2 : index === 49 ? 5 : 0, recentDate: null,
				})) } });
			case "labels": return route.fulfill({ json: { labels: gmailFolders } });
			case "edit-label": {
				const { id, name } = request.postDataJSON();
				expect(id).toBe("Label_1");
				gmailFolders = [{ id, type: "user", name }];
				return route.fulfill({ json: gmailFolders[0] });
			}
			case "delete-label":
				expect(request.postDataJSON()).toEqual({ id: "Label_1" });
				gmailFolders = [];
				return route.fulfill({ json: { ok: true } });
			case "label-colors": return route.fulfill({ json: { colors: {} } });
			case "folder":
				requestedFolders.add(url.searchParams.get("box") ?? "");
				return route.fulfill({ json: { rows: [], next: null } });
			case "folder-counts": return route.fulfill({ json: { counts: {} } });
			default: return route.fulfill({ status: 404, json: { error: "Unexpected request" } });
		}
	});
	try {
		await page.goto("/mail");
		await expect(page.getByText("Здесь пока нет писем")).toBeVisible();
		expect([...requestedFolders]).toEqual(["mailbox-0"]);
	} finally {
		releaseStats();
	}
	const rail = page.getByRole("complementary", { name: "Папки проектов" });
	const shortcut = (name: RegExp) => rail.getByRole("navigation", { name: "Проекты" }).getByRole("button", { name });
	const mobilePicker = page.getByRole("button", { name: "Почтовый ящик", exact: true });
	const mailboxesColumn = isMobile
		? page.getByRole("region", { name: "Выбор почтового ящика" })
		: page.getByRole("navigation", { name: "Ящики", exact: true });
	const mailbox = (address: string) => mailboxesColumn.getByRole("button", { name: new RegExp(address.replaceAll(".", "\\.")) });
	const visibleMailboxes = async (count: number) => {
		if (isMobile) await mobilePicker.click();
		await expect(mailboxesColumn.getByRole("list").getByRole("button")).toHaveCount(count);
		await expect(mailboxesColumn).not.toContainText("@example.invalid");
	};
	const newFolder = async (name: string, addresses: string[]) => {
		await rail.getByRole("button", { name: "Создать папку проекта", exact: true }).click();
		const dialog = page.getByRole("dialog", { name: "Новая папка проекта" });
		await dialog.getByRole("textbox", { name: "Название папки" }).fill(name);
		await dialog.getByRole("radio", { name: "Зелёный", exact: true }).check();
		for (const address of addresses) {
			await dialog.getByRole("searchbox", { name: "Найти ящик для папки" }).fill(address);
			await dialog.getByRole("checkbox", { name: address, exact: true }).check();
		}
		await dialog.getByRole("button", { name: "Создать папку", exact: true }).click();
		await expect(dialog).toBeHidden();
	};
	const first = "desk0@example.invalid";
	await expect(shortcut(/^Без проекта/)).toHaveCount(0);
	const second = "desk49@example.invalid";
	await newFolder("VIP-поддержка", [first, second]);
	await expect(shortcut(/^VIP-поддержка · 7 непрочитанных$/)).toBeVisible();
	await expect(shortcut(/^VIP-поддержка/).locator(".mail-project-mark")).toHaveText("VIP");
	await visibleMailboxes(2);
	await expect(mailbox(second)).toBeVisible();
	await expect(mailbox("desk1@example.invalid")).toHaveCount(0);
	await page.screenshot({ path: info.outputPath("mail-project-folders.png"), animations: "disabled" });
	await mailbox(second).click();
	if (isMobile) {
		await expect(mobilePicker).toHaveAccessibleDescription(second);
	} else {
		const selected = mailbox(second);
		await expect(selected).toHaveAttribute("aria-pressed", "true");
		await expect(selected).toBeInViewport();
		await expect(selected).toHaveAccessibleName(/Непрочитанных: 5/);
	}
	await expect.poll(() => [...requestedFolders]).toEqual(["mailbox-0", "mailbox-49"]);

	await newFolder("Вторая линия", [second]);
	await expect(shortcut(/^Вторая линия · 5 непрочитанных$/)).toHaveAttribute("data-active", "true");
	await shortcut(/^VIP-поддержка · 2 непрочитанных$/).click();
	await visibleMailboxes(1);
	await expect(mailbox(second)).toHaveCount(0);
	if (isMobile) await mobilePicker.click();
	await shortcut(/^Все ящики$/).click();
	await rail.getByRole("button", { name: "Управление папками" }).click();
	await page.getByRole("button", { name: "Редактировать папку «VIP-поддержка»" }).click();
	const editor = page.getByRole("dialog", { name: "Настроить папку проекта" });
	await editor.getByRole("textbox", { name: "Название папки" }).fill("Первый проект");
	await editor.getByRole("button", { name: "Сохранить", exact: true }).click();

	await page.reload();
	await shortcut(/^Первый проект · 2 непрочитанных$/).click();
	await visibleMailboxes(1);
	await expect(mailbox(first)).toBeVisible();
	if (isMobile) await mobilePicker.click();
	await rail.getByRole("button", { name: "Настроить папку", exact: true }).click();
	await editor.getByRole("button", { name: "Удалить папку", exact: true }).click();
	await editor.getByRole("button", { name: "Удалить папку", exact: true }).click();
	await expect(shortcut(/^Без проекта/)).toHaveAttribute("aria-pressed", "true");
	await visibleMailboxes(49);
	await expect(mailbox(first)).toBeVisible();
	if (isMobile) await mobilePicker.click();
	await expect(shortcut(/^Первый проект/)).toHaveCount(0);
	await expect(shortcut(/^Вторая линия · 5 непрочитанных$/)).toBeVisible();
	await shortcut(/^Все ящики$/).click();
	await visibleMailboxes(50);
	if (isMobile) await mobilePicker.click();
	await newFolder("Пустой проект", []);
	await expect(page.getByRole("heading", { name: "В папке нет доступных ящиков" })).toBeVisible();
	await expect(page.getByRole("region", { name: "Список писем" })).toHaveCount(0);
	await shortcut(/^Все ящики$/).click();
	await expect(page.getByRole("region", { name: "Список писем" })).toBeVisible();
	const navigation = page.getByRole("navigation", { name: "Папки ящика" });
	if (isMobile) await navigation.getByRole("button", { name: "Папки", exact: true }).click();
	await navigation.getByTitle("Изменить папку «Обращения»").click();
	const edit = page.getByRole("dialog", { name: "Изменить папку" });
	await edit.getByLabel("Название папки").fill("Заявки");
	await edit.getByRole("button", { name: "Сохранить" }).click();
	await navigation.getByTitle("Заявки", { exact: true }).click();
	await navigation.getByTitle("Изменить папку «Заявки»").click();
	await edit.getByRole("button", { name: "Удалить папку…" }).click();
	await page.getByRole("dialog", { name: "Удалить папку?" }).getByRole("button", { name: "Удалить папку", exact: true }).click();
	await expect(navigation.getByText("Нет пользовательских папок")).toBeVisible();
	canManageFolders = false;
	gmailFolders = [{ id: "Label_2", type: "user", name: "Оплаты" }];
	await page.reload();
	await expect(shortcut(/^Вторая линия/)).toBeVisible();
	await expect(rail.getByRole("button", { name: "Создать папку проекта" })).toHaveCount(0);
	await expect(rail.getByRole("button", { name: "Управление папками" })).toHaveCount(0);
	if (isMobile) await navigation.getByRole("button", { name: "Папки", exact: true }).click();
	await expect(navigation.getByTitle("Оплаты", { exact: true })).toBeVisible();
	await expect(navigation.getByTitle("Изменить папку «Оплаты»")).toHaveCount(0);
	await expect(navigation.getByRole("button", { name: "Новая папка" })).toHaveCount(0);
});
