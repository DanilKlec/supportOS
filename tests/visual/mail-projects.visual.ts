import { accessToken, knowledge } from "./data";
import { expect, test } from "./fixture";

test("organize accessible mailboxes into project folders", async ({ context, page }, info) => {
	const mailboxes = Array.from({ length: 50 }, (_, index) => ({
		id: `mailbox-${index}`,
		address: `desk${index}@example.invalid`,
		provider: "gmail",
	}));
	const requestedFolders = new Set<string>();
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
		expect(request.method()).toBe("GET");
		switch (url.searchParams.get("action")) {
			case "list": return route.fulfill({ json: { configured: true, admin: false, mailboxes } });
			case "stats":
				await waitingForStats;
				return route.fulfill({ json: { stats: mailboxes.map(({ id }, index) => ({
					id, unread: index === 0 ? 2 : index === 49 ? 5 : 0, recentDate: null,
				})) } });
			case "labels": return route.fulfill({ json: { labels: [] } });
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
	const group = (name: string) => rail.getByRole("region", { name, exact: true });
	const shortcut = (name: RegExp) => rail.getByRole("navigation", { name: "Проекты" }).getByRole("button", { name });
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
		await expect(group(name)).toBeVisible();
	};
	const first = "desk0@example.invalid";
	const second = "desk49@example.invalid";
	await newFolder("VIP-поддержка", [first, second]);
	await expect(shortcut(/^VIP-поддержка · 7 непрочитанных$/)).toBeVisible();
	await expect(shortcut(/^VIP-поддержка/).locator(".mail-project-mark")).toHaveText("VIP");
	await expect(group("VIP-поддержка").getByRole("button", { name: /desk49@example/ })).toBeVisible();
	await page.screenshot({ path: info.outputPath("mail-project-folders.png"), animations: "disabled" });
	await group("VIP-поддержка").getByRole("button", { name: /desk49@example/ }).click();
	await expect(page.getByRole("button", { name: "Почтовый ящик", exact: true })).toHaveAccessibleDescription(second);
	await expect.poll(() => [...requestedFolders]).toEqual(["mailbox-0", "mailbox-49"]);

	await newFolder("Вторая линия", [second]);
	await expect(shortcut(/^Вторая линия · 5 непрочитанных$/)).toHaveAttribute("data-active", "true");
	await shortcut(/^VIP-поддержка · 2 непрочитанных$/).click();
	await expect(group("VIP-поддержка").getByRole("button", { name: /desk49@example/ })).toHaveCount(0);
	await group("VIP-поддержка").getByRole("button", { name: "Настроить папку", exact: true }).click();
	const editor = page.getByRole("dialog", { name: "Настроить папку проекта" });
	await editor.getByRole("textbox", { name: "Название папки" }).fill("Первый проект");
	await editor.getByRole("button", { name: "Сохранить", exact: true }).click();

	await page.reload();
	await shortcut(/^Первый проект · 2 непрочитанных$/).click();
	await expect(group("Первый проект").getByRole("button", { name: /desk0@example/ })).toBeVisible();
	await group("Первый проект").getByRole("button", { name: "Настроить папку", exact: true }).click();
	await editor.getByRole("button", { name: "Удалить настройки папки", exact: true }).click();
	await editor.getByRole("button", { name: "Удалить папку", exact: true }).click();
	const unassigned = group("Без проекта");
	await unassigned.getByRole("searchbox", { name: "Найти ящик в папке" }).fill(first);
	await expect(unassigned.getByRole("button", { name: /desk0@example/ })).toBeVisible();
	await expect(shortcut(/^Первый проект/)).toHaveCount(0);
	await expect(shortcut(/^Вторая линия · 5 непрочитанных$/)).toBeVisible();
});
