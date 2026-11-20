import { accessToken, knowledge } from "./data";
import { expect, test } from "./fixture";

test("search 32 mailboxes, page Gmail history, reply and grant access", async ({
	context,
	page,
	isMobile,
}, info) => {
	let sends = 0;
	let unread = true;
	let received = false;
	let recentDate = Date.UTC(2026, 10, 19, 10);
	let activeMailboxes = 0;
	const mailboxes = Array.from({ length: 32 }, (_, i) => ({
		id: `test-${i}`,
		address: `desk${i}@example.invalid`,
		provider: "gmail",
	}));
	const message = {
		id: "mid",
		threadId: "tid",
		date: recentDate,
		labels: ["INBOX"],
		from: "player@example.invalid",
		to: "desk31@example.invalid",
		cc: "",
		bcc: "",
		subject: "Заявка игрока",
		replyTo: null,
		messageId: "<original@example.invalid>",
		snippet: "Тестовый предпросмотр",
		count: 1,
		text: "Последнее письмо",
		html: "",
		attachments: [],
	};
	const recipients: { id: string; email: string; display_name: string }[] = [];
	await context.route("**/api/binds?action=workspace", (route) =>
		route.fulfill({
			json: {
				...knowledge,
				branches: { choices: {}, incoming: [], outgoing: [] },
			},
		}),
	);
	await context.route("**/api/mail?**", (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (
			url.origin !== "http://127.0.0.1:4173" ||
			request.headers().authorization !== `Bearer ${accessToken}`
		)
			return route.fallback();
		const box = url.searchParams.get("box");
		switch (url.searchParams.get("action")) {
			case "list":
				return route.fulfill({
					json: { configured: true, admin: true, mailboxes },
				});
			case "stats":
				activeMailboxes++;
				return route.fulfill({
					json: {
						stats: mailboxes.map(({ id }) => ({
							id,
							unread: received && id === "test-31" ? 1 : 0,
							recentDate,
						})),
					},
				});
			case "labels":
				return route.fulfill({
					json: {
						labels: [{ id: "Label_1", name: "Проекты/Платежи", type: "user" }],
					},
				});
			case "folder":
				return route.fulfill({
					json: {
						rows:
							box === "test-31"
								? [
										url.searchParams.get("page")
											? {
													...message,
													id: "historic",
													subject: "Старое обращение",
												}
											: {
													...message,
													labels: unread ? ["INBOX", "UNREAD"] : ["INBOX"],
												},
									]
								: [],
						next: url.searchParams.get("page") ? null : "testcursor",
					},
				});
			case "change-thread": {
				const { id, operation } = request.postDataJSON();
				expect(box).toBe("test-31");
				expect(id).toBe(message.threadId);
				expect(["read", "unread"]).toContain(operation);
				unread = operation === "unread";
				return route.fulfill({ json: { ok: true } });
			}
			case "thread":
				return route.fulfill({
					json: {
						id: message.threadId,
						messages: url.searchParams.get("before")
							? [
									{
										...message,
										id: "old",
										from: "other@example.invalid",
										text: "Раннее письмо",
									},
								]
							: [message],
						before: url.searchParams.get("before") ? null : message.id,
					},
				});
			case "send":
				expect(box).toBe("test-31");
				expect(request.postDataJSON()).toMatchObject({
					to: "player@example.invalid",
					subject: "Re: Заявка игрока",
					replyId: "<original@example.invalid>",
					threadId: "tid",
					text: "Тестовый ответ",
				});
				sends++;
				return route.fulfill({ json: { id: "sent-mock" } });
			case "members":
				return route.fulfill({ json: { members: recipients } });
			case "grant":
				expect(request.postDataJSON()).toMatchObject({
					email: "agent@example.invalid",
				});
				recipients.push({
					id: "agent",
					email: "agent@example.invalid",
					display_name: "Тестовый сотрудник почты",
				});
				return route.fulfill({ json: { ok: true } });
			default:
				return route.fulfill({
					status: 404,
					json: { error: "Тестовое действие не определено" },
				});
		}
	});
	await page.goto("/mail");
	const mail = page.getByRole("region", { name: "Почтовые ящики" });
	if (isMobile)
		await mail
			.getByRole("combobox", { name: "Почтовый ящик" })
			.selectOption("test-31");
	else {
		await mail.getByRole("textbox", { name: "Найти ящик" }).fill("desk31");
		await mail
			.getByRole("button", { name: "desk31@example.invalid", exact: true })
			.click();
	}
	await expect(
		mail
			.getByRole("navigation", { name: "Папки Gmail" })
			.getByRole("button", { name: "Проекты/Платежи" }),
	).toBeVisible();
	await expect(
		mail.getByRole("button", { name: "Форумы", exact: true }),
	).toBeVisible();
	await mail.getByRole("button", { name: "Следующая страница" }).click();
	await expect(mail.getByText("Старое обращение")).toBeVisible();
	await expect(mail.getByText("Непрочитано", { exact: true })).toHaveCount(0);
	await mail.getByRole("button", { name: "Предыдущая страница" }).click();
	const incoming = mail.getByRole("button", { name: /Заявка игрока/ });
	const unreadBadge = incoming.getByText("Непрочитано", { exact: true });
	await expect(unreadBadge).toBeVisible();
	await expect(unreadBadge).toBeInViewport({ ratio: 1 });
	await page.screenshot({
		path: info.outputPath("mail-unread.png"),
		animations: "disabled",
	});
	await incoming.click();
	const actions = mail.getByRole("combobox", { name: "Действия с перепиской" });
	await expect(
		actions.getByRole("option", {
			name: "Отметить непрочитанным",
			exact: true,
		}),
	).toHaveCount(1);
	await expect(unreadBadge).toHaveCount(0);
	await actions.selectOption("unread");
	if (isMobile)
		await mail.getByRole("button", { name: "К списку писем" }).click();
	await expect(unreadBadge).toBeVisible();
	if (isMobile) await incoming.click();
	await mail.getByRole("button", { name: "Более ранние письма" }).click();
	await expect(mail.getByText("Раннее письмо")).toBeVisible();
	await expect(mail.getByText("Последнее письмо")).toBeVisible();
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(info.project.use.viewport?.width ?? 1440);
	await page.screenshot({
		path: info.outputPath("mail-thread.png"),
		animations: "disabled",
	});
	await mail
		.getByRole("article")
		.filter({ hasText: "Последнее письмо" })
		.getByRole("button", { name: "Ответить", exact: true })
		.click();
	const composer = mail.getByRole("region", { name: "Ответ на письмо" });
	await composer
		.getByRole("textbox", { name: "Сообщение" })
		.fill("Тестовый ответ");
	await composer
		.getByRole("button", { name: "Отправить", exact: true })
		.click();
	await expect.poll(() => sends).toBe(1);
	await expect(mail.getByText("Письмо отправлено")).toBeVisible();
	if (isMobile)
		await mail.getByRole("button", { name: "К списку писем" }).click();
	await mail.getByRole("button", { name: "Доступ к ящику" }).click();
	const admin = mail.getByRole("region", { name: "Доступ к ящику" });
	await admin
		.getByRole("textbox", { name: "Адрес сотрудника" })
		.fill("agent@example.invalid");
	await admin.getByRole("button", { name: "Выдать доступ" }).click();
	await expect(admin.getByText("Тестовый сотрудник почты")).toBeVisible();
	await admin.getByRole("button", { name: "Закрыть настройки почты" }).click();
	await expect.poll(() => activeMailboxes).toBeGreaterThan(0);
	received = true;
	recentDate += 10_000;
	await mail.getByRole("button", { name: "Обновить письма" }).click();
	await expect(
		mail.getByText("Новая почта в desk31@example.invalid", { exact: true }),
	).toBeVisible();
});
