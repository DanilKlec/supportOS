import { accessToken, knowledge } from "./data";
import { expect, test } from "./fixture";

test("browse shared Gmail, organize mail, reuse a recipient and grant access", async ({
	context,
	page,
	isMobile,
}, info) => {
	let sends = 0;
	let unread = true;
	let received = false;
	let recentDate = Date.UTC(2026, 10, 19, 10);
	let activeMailboxes = 0;
	const labels = [
		{ id: "Label_1", name: "Проекты/Платежи", type: "user" },
		{ id: "Label_3", name: "Уточнить", type: "user" },
		{ id: "Label_4", name: "Проекты", type: "user" },
	];
	const colors: Record<string, { backgroundColor: string; textColor: string }> =
		{
			Label_1: { backgroundColor: "#a4c2f4", textColor: "#0d3472" },
		};
	let labelWrites = 0;
	const threadLabels = new Set(["INBOX"]);
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
				return route.fulfill({ json: { labels } });
			case "label-colors":
				return route.fulfill({ json: { colors } });
			case "set-label-color": {
				const { color, id } = request.postDataJSON();
				expect(box).toBe("test-31");
				expect(id).toBe("Label_1");
				expect(color).toEqual({
					backgroundColor: "#89d3b2",
					textColor: "#0b4f30",
				});
				colors[id] = color;
				return route.fulfill({
					json: { ...labels.find((label) => label.id === id), color },
				});
			}
			case "create-label": {
				expect(box).toBe("test-31");
				expect(request.postDataJSON()).toEqual({ name: "Проекты/На проверку" });
				const created = {
					id: "Label_2",
					name: "Проекты/На проверку",
					type: "user",
				};
				labels.push(created);
				return route.fulfill({
					json: created,
				});
			}
			case "folder":
				return route.fulfill({
					json: {
						rows:
							box === "test-31" &&
							threadLabels.has(url.searchParams.get("label") ?? "INBOX")
								? [
										url.searchParams.get("page")
											? {
													...message,
													id: "historic",
													subject: "Старое обращение",
												}
											: {
													...message,
													labels: [
														...threadLabels,
														...(unread ? ["UNREAD"] : []),
													],
												},
									]
								: [],
						next: url.searchParams.get("page") ? null : "testcursor",
					},
				});
			case "change-thread": {
				const { id, operation, label, source, add, remove } =
					request.postDataJSON();
				expect(box).toBe("test-31");
				expect(id).toBe(message.threadId);
				if (operation === "set-labels") {
					expect(add).toEqual(["Label_1", "Label_3"]);
					expect(remove).toEqual([]);
					for (const id of add) threadLabels.add(id);
					labelWrites++;
				} else if (operation === "move-label") {
					expect({ label, source }).toEqual({
						label: "Label_2",
						source: "INBOX",
					});
					threadLabels.add(label);
					threadLabels.delete(source);
				} else {
					expect(["read", "unread"]).toContain(operation);
					unread = operation === "unread";
				}
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
	const boxPicker = mail.getByRole("button", {
		name: "Почтовый ящик",
		exact: true,
	});
	await boxPicker.click();
	const boxes = mail.getByRole("region", { name: "Выбор почтового ящика" });
	await boxes.getByRole("textbox", { name: "Найти ящик" }).fill("desk31");
	await page.screenshot({
		path: info.outputPath("mail-accounts.png"),
		animations: "disabled",
	});
	await boxes
		.getByRole("button", { name: "desk31@example.invalid", exact: true })
		.click();
	await expect(boxes).toHaveCount(0);
	const folderNav = mail.getByRole("navigation", { name: "Папки ящика" });
	if (isMobile)
		await folderNav.getByRole("button", { name: "Папки", exact: true }).click();
	const nestedFolder = folderNav.getByRole("button", {
		name: "Платежи",
		exact: true,
	});
	await expect(nestedFolder).toBeVisible();
	await folderNav
		.getByRole("button", { name: "Свернуть папку Проекты" })
		.click();
	await expect(nestedFolder).toHaveCount(0);
	await folderNav
		.getByRole("button", { name: "Раскрыть папку Проекты" })
		.click();
	await expect(nestedFolder).toBeVisible();
	if (isMobile)
		await folderNav.getByRole("button", { name: "Папки", exact: true }).click();
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
	await expect(unreadBadge).toHaveCount(0);
	const actions = mail.getByRole("button", { name: "Действия с перепиской" });
	await expect(actions).toBeEnabled();
	await actions.press("ArrowDown");
	const markUnread = page.getByRole("menuitem", {
		name: "Отметить непрочитанным",
		exact: true,
	});
	await expect(markUnread).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(
		page.getByRole("menuitem", { name: "В архив", exact: true }),
	).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(actions).toBeFocused();
	await expect(markUnread).toHaveCount(0);
	await actions.click();
	await page.screenshot({
		path: info.outputPath("mail-actions.png"),
		animations: "disabled",
	});
	await markUnread.click();
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
	const openForward = () =>
		mail
			.getByRole("article")
			.filter({ hasText: "Последнее письмо" })
			.getByRole("button", { name: "Переслать", exact: true })
			.click();
	await openForward();
	const forward = mail.getByRole("region", { name: "Редактор письма" });
	await forward.getByRole("button", { name: "Недавние адресаты" }).click();
	await page.screenshot({
		path: info.outputPath("mail-compose.png"),
		animations: "disabled",
	});
	await forward.getByRole("button", { name: "player@example.invalid" }).click();
	await expect(forward.getByRole("textbox", { name: "Кому" })).toHaveValue(
		"player@example.invalid",
	);
	await forward.getByRole("button", { name: "Закрыть редактор" }).click();
	await forward.getByRole("button", { name: "Закрыть без сохранения" }).click();
	await expect(forward).toHaveCount(0);
	const thread = mail.getByRole("region", { name: "Переписка" });
	await thread.getByRole("button", { name: "Ярлыки", exact: true }).click();
	const tag = thread.getByRole("checkbox", { name: "Проекты/Платежи" });
	await tag.click();
	await expect(tag).toBeChecked();
	await tag.click();
	await expect(tag).not.toBeChecked();
	await tag.click();
	await thread.getByRole("checkbox", { name: "Уточнить" }).click();
	expect(labelWrites).toBe(0);
	await thread
		.getByRole("button", { name: "Цвет ярлыка Проекты/Платежи" })
		.click();
	await thread.getByRole("button", { name: "Зелёный", exact: true }).click();
	await expect(
		thread.getByRole("button", { name: "Зелёный", exact: true }),
	).toHaveCount(0);
	await page.screenshot({
		path: info.outputPath("mail-labels.png"),
		animations: "disabled",
	});
	await thread.getByRole("button", { name: "Применить", exact: true }).click();
	await expect.poll(() => labelWrites).toBe(1);
	const chip = thread.getByText("Платежи", { exact: true });
	await expect(chip).toHaveCSS("background-color", "rgb(137, 211, 178)");
	if (isMobile)
		await thread.getByRole("button", { name: "К списку писем" }).click();
	await folderNav.getByRole("button", { name: "Новая папка" }).click();
	await folderNav
		.getByRole("textbox", { name: "Название папки" })
		.fill("На проверку");
	await folderNav.getByRole("button", { name: /^Родительская папка/ }).click();
	await folderNav
		.getByRole("region", { name: "Выбор родительской папки" })
		.getByRole("button", { name: "Проекты", exact: true })
		.click();
	await folderNav.getByRole("button", { name: "Создать", exact: true }).click();
	await expect(
		folderNav.getByRole("button", { name: "На проверку", exact: true }),
	).toBeVisible();
	if (isMobile) await incoming.click();
	await thread.getByRole("button", { name: "В папку" }).click();
	await thread
		.getByRole("searchbox", { name: "Найти папку" })
		.fill("На проверку");
	await thread
		.getByRole("button", { name: "Проекты/На проверку", exact: true })
		.click();
	await page.screenshot({
		path: info.outputPath("mail-organizer.png"),
		animations: "disabled",
	});
	await thread.getByRole("button", { name: "Переместить" }).click();
	await expect(mail.getByRole("button", { name: /Заявка игрока/ })).toHaveCount(
		0,
	);
	await expect(mail.getByText("Письмо перемещено")).toBeVisible();
	await folderNav
		.getByRole("button", { name: "На проверку", exact: true })
		.click();
	await expect(incoming.getByText("Платежи", { exact: true })).toBeVisible();
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
