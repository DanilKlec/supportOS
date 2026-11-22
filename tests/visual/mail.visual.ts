import { renderMailLayout } from "../../shared/mail-layout.js";
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
	const templateId = "template-1";
	let template:
		| {
				id: string;
				title: string;
				subject: string;
				body: string;
				html?: string;
				layout?: unknown;
				revision: number;
		  }
		| undefined;
	let personalTemplate: typeof template;
	const layoutBackground = "https://media.example.invalid/background.gif";
	const layoutImage = "https://media.example.invalid/banner.gif";
	const richHeading = "Оформленный ответ";
	const importedHtml = '<p style="color:#334488">Вставленный HTML</p>';
	const greeting = "Проверяем ваше обращение.";
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
			case "folder-counts": {
				const ids = (url.searchParams.get("ids") ?? "").split(",");
				const entries = ids.map((id) => {
					const count =
						box !== "test-31"
							? 0
							: id === "DRAFT"
								? 3
								: id === "Label_3"
									? 4
									: unread && (id === "ALL" || threadLabels.has(id))
										? 2
										: 0;
					return [id, count];
				});
				return route.fulfill({ json: { counts: Object.fromEntries(entries) } });
			}
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
					text: `Тестовый ответ\n\n${greeting}`,
				});
				sends++;
				return route.fulfill({ json: { id: "sent-mock" } });
			case "templates": {
				const personal = url.searchParams.get("scope") === "personal";
				const record = personal
					? personalTemplate
					: box === "test-31"
						? template
						: undefined;
				if (url.searchParams.has("id"))
					return route.fulfill({ json: record ?? null });
				const query = url.searchParams.get("q") ?? "";
				const rows = record?.title.toLowerCase().includes(query.toLowerCase())
					? [
							{
								id: record.id,
								title: record.title,
								subject: record.subject,
								revision: record.revision,
							},
						]
					: [];
				return route.fulfill({ json: { templates: rows, next: null } });
			}
			case "save-template": {
				const personal = url.searchParams.get("scope") === "personal";
				expect(personal ? ["test-0", "test-31"] : ["test-31"]).toContain(box);
				const previous = personal ? personalTemplate : template;
				const draft = request.postDataJSON();
				if (draft.layout) {
					expect(draft.layout).toMatchObject({
						backgroundImage: layoutBackground,
						backgroundPlacement: "canvas",
						headingFont: "serif",
						blocks: [
							{ type: "heading", text: richHeading },
							{ type: "hero", url: layoutImage, text: "Добро пожаловать", accentLine: "Nocturne", shade: "strong" },
							{ type: "offer", text: "Приглашение", description: "Подтвердите участие до пятницы." },
							{ type: "button", text: "Подтвердить", buttonWidth: "full" },
							{ type: "signature", text: "Анна" },
							{ type: "footer", links: [{ text: "Условия", url: "https://example.invalid/terms" }] },
						],
					});
					draft.html = renderMailLayout(draft.layout);
					draft.body = richHeading;
				} else if (draft.html) {
					expect(draft.html).toBe(importedHtml);
					draft.body = "Вставленный HTML";
				}
				if (draft.id) expect(draft.revision).toBe(previous?.revision);
				const saved = {
					...draft,
					id: personal ? "personal-1" : templateId,
					revision: (previous?.revision ?? 0) + 1,
				};
				if (personal) personalTemplate = saved;
				else template = saved;
				return route.fulfill({ json: saved });
			}
			case "save-draft":
				expect(box).toBe("test-0");
				expect(request.postDataJSON()).toMatchObject({
					html: expect.stringContaining(importedHtml),
					text: expect.stringContaining(richHeading),
				});
				return route.fulfill({ json: { id: "layout-draft" } });
			case "delete-template":
				expect(box).toBe("test-31");
				expect(request.postDataJSON()).toEqual({ id: templateId, revision: 2 });
				template = undefined;
				return route.fulfill({ json: { ok: true } });
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
	const systemNav = mail.getByRole("navigation", { name: "Папки Gmail" });
	const inboxCount = systemNav
		.getByRole("button", { name: /^Входящие/ })
		.getByTitle("Непрочитанных: 2");
	await expect(inboxCount).toBeVisible();
	await expect(
		systemNav
			.getByRole("button", { name: /^Черновики/ })
			.getByTitle("Черновиков: 3"),
	).toBeVisible();
	if (isMobile)
		await folderNav.getByRole("button", { name: "Папки", exact: true }).click();
	const nestedFolder = folderNav.getByRole("button", {
		name: "Платежи",
		exact: true,
	});
	await expect(nestedFolder).toBeVisible();
	await expect(
		folderNav
			.getByRole("button", { name: /^Уточнить/ })
			.getByTitle("Непрочитанных: 4"),
	).toBeVisible();
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
	if (!isMobile) await expect(inboxCount).toHaveCount(0);
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
	await expect(inboxCount).toBeVisible();
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
	const reply = composer.getByRole("textbox", { name: "Сообщение" });
	await reply.fill("Тестовый ответ");
	await reply.press("End");
	await composer.getByRole("button", { name: "Шаблоны", exact: true }).click();
	const templatePanel = mail.getByRole("region", { name: "Шаблоны писем" });
	await templatePanel
		.getByRole("button", { name: "Новый шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "Название" })
		.fill("Проверка обращения");
	await templatePanel
		.getByRole("textbox", { name: "Тема письма (необязательно)" })
		.fill("Уточнение по заявке");
	await templatePanel
		.getByRole("textbox", { name: "Текст шаблона" })
		.fill(greeting);
	await templatePanel
		.getByRole("button", { name: "Сохранить шаблон", exact: true })
		.click();
	await expect(
		templatePanel.getByText(greeting, { exact: true }),
	).toBeVisible();
	await page.screenshot({
		path: info.outputPath("mail-templates.png"),
		animations: "disabled",
	});
	await templatePanel
		.getByRole("button", { name: "Вставить в письмо", exact: true })
		.click();
	await expect(reply).toHaveValue(`Тестовый ответ\n\n${greeting}`);
	await expect(composer.getByRole("textbox", { name: "Тема" })).toHaveValue(
		"Re: Заявка игрока",
	);
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
	await forward.getByRole("button", { name: "Шаблоны", exact: true }).click();
	await templatePanel
		.getByRole("searchbox", { name: "Найти шаблон" })
		.fill("проверка");
	await templatePanel
		.getByRole("button", { name: /Проверка обращения/ })
		.click();
	await templatePanel
		.getByRole("button", { name: "Вставить в письмо", exact: true })
		.click();
	await expect(forward.getByRole("textbox", { name: "Сообщение" })).toHaveValue(
		/Последнее письмо/,
	);
	await expect(forward.getByRole("textbox", { name: "Сообщение" })).toHaveValue(
		/Проверяем ваше обращение/,
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
		folderNav.getByRole("button", { name: /^На проверку/ }),
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
	if (!isMobile) {
		await expect(inboxCount).toHaveCount(0);
		await expect(
			folderNav
				.getByRole("button", { name: /^На проверку/ })
				.getByTitle("Непрочитанных: 2"),
		).toBeVisible();
	}
	await folderNav.getByRole("button", { name: /^На проверку/ }).click();
	await expect(incoming.getByText("Платежи", { exact: true })).toBeVisible();
	await mail.getByRole("button", { name: "Написать", exact: true }).click();
	const newComposer = mail.getByRole("region", { name: "Редактор письма" });
	await newComposer
		.getByRole("button", { name: "Шаблоны", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: /Проверка обращения/ })
		.click();
	await templatePanel
		.getByRole("button", { name: "Редактировать шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "Текст шаблона" })
		.fill("Текст после правки.");
	await templatePanel
		.getByRole("button", { name: "Сохранить шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Вставить в письмо", exact: true })
		.click();
	await expect(newComposer.getByRole("textbox", { name: "Тема" })).toHaveValue(
		"Уточнение по заявке",
	);
	await expect(
		newComposer.getByRole("textbox", { name: "Сообщение" }),
	).toHaveValue("Текст после правки.");
	await newComposer
		.getByRole("button", { name: "Шаблоны", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: /Проверка обращения/ })
		.click();
	await templatePanel
		.getByRole("button", { name: "Удалить шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Удалить", exact: true })
		.click();
	await expect(
		templatePanel.getByText("У этого ящика пока нет шаблонов"),
	).toBeVisible();
	await templatePanel
		.getByRole("button", { name: "Личные", exact: true })
		.click();
	await expect(
		templatePanel.getByText("У вас пока нет личных шаблонов"),
	).toBeVisible();
	await templatePanel
		.getByRole("button", { name: "Новый шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "Название" })
		.fill("Моё уточнение");
	await templatePanel
		.getByRole("textbox", { name: "Текст шаблона" })
		.fill("Личный тестовый ответ.");
	await templatePanel
		.getByRole("button", { name: "Сохранить шаблон", exact: true })
		.click();
	await expect(
		templatePanel.getByText("Личный тестовый ответ.", { exact: true }),
	).toBeVisible();
	await templatePanel
		.getByRole("button", { name: "Общие", exact: true })
		.click();
	await expect(
		templatePanel.getByText("У этого ящика пока нет шаблонов"),
	).toBeVisible();
	await newComposer
		.getByRole("button", { name: "К письму", exact: true })
		.click();
	await newComposer.getByRole("button", { name: "Закрыть редактор" }).click();
	await newComposer
		.getByRole("button", { name: "Закрыть без сохранения" })
		.click();
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
	await boxPicker.click();
	await boxes.getByRole("textbox", { name: "Найти ящик" }).fill("desk0");
	await boxes
		.getByRole("button", { name: "desk0@example.invalid", exact: true })
		.click();
	await mail.getByRole("button", { name: "Написать", exact: true }).click();
	await newComposer
		.getByRole("button", { name: "Шаблоны", exact: true })
		.click();
	await expect(
		templatePanel.getByText("У этого ящика пока нет шаблонов"),
	).toBeVisible();
	await templatePanel
		.getByRole("button", { name: "Личные", exact: true })
		.click();
	await templatePanel.getByRole("button", { name: "Моё уточнение" }).click();
	await templatePanel
		.getByRole("button", { name: "Вставить в письмо", exact: true })
		.click();
	await expect(
		newComposer.getByRole("textbox", { name: "Сообщение" }),
	).toHaveValue("Личный тестовый ответ.");
	await newComposer
		.getByRole("button", { name: "Шаблоны", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Личные", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Новый шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "Название", exact: true })
		.fill("Вёрстка с GIF");
	await templatePanel
		.getByRole("button", { name: "Конструктор", exact: true })
		.click();
	await templatePanel.getByRole("button", { name: "Золото", exact: true }).click();
	await templatePanel
		.getByRole("textbox", { name: "Фоновое изображение или GIF" })
		.fill(layoutBackground);
	await templatePanel.getByLabel("Расположение фона").selectOption("canvas");
	await templatePanel.getByLabel("Шрифт заголовков").selectOption("serif");
	await templatePanel
		.getByRole("button", { name: "Заголовок", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "Текст заголовка" })
		.fill(richHeading);
	await templatePanel
		.getByRole("button", { name: "Обложка", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "Заголовок обложки" })
		.fill("Добро пожаловать");
	await templatePanel.getByRole("textbox", { name: "Акцентная строка" }).fill("Nocturne");
	await templatePanel
		.getByRole("textbox", { name: "Изображение или GIF обложки" })
		.fill(layoutImage);
	await templatePanel
		.getByLabel("Затемнение изображения")
		.selectOption("strong");
	await templatePanel.getByRole("button", { name: "Карточка", exact: true }).click();
	await templatePanel.getByRole("textbox", { name: "Заголовок карточки" }).fill("Приглашение");
	await templatePanel.getByRole("textbox", { name: "Дополнительный текст" }).fill("Подтвердите участие до пятницы.");
	await templatePanel.getByRole("button", { name: "Кнопка", exact: true }).click();
	await templatePanel.getByRole("textbox", { name: "Текст кнопки" }).fill("Подтвердить");
	await templatePanel.getByRole("textbox", { name: "Ссылка кнопки" }).fill("https://example.invalid/rsvp");
	await templatePanel.getByLabel("Ширина кнопки").selectOption("full");
	await templatePanel.getByRole("button", { name: "Подпись", exact: true }).click();
	await templatePanel.getByRole("textbox", { name: "Имя в подписи" }).fill("Анна");
	await templatePanel.getByRole("button", { name: "Подвал", exact: true }).click();
	await templatePanel.getByRole("button", { name: "Добавить ссылку" }).click();
	await templatePanel.getByRole("textbox", { name: "Текст ссылки 1" }).fill("Условия");
	await templatePanel.getByRole("textbox", { name: "Адрес ссылки 1" }).fill("https://example.invalid/terms");
	if (isMobile) {
		await templatePanel.getByRole("button", { name: "К предпросмотру" }).click();
		await expect(templatePanel.getByRole("region", { name: "Предпросмотр конструктора" })).toBeFocused();
	}
	const preview = templatePanel.frameLocator(
		'iframe[title="Предпросмотр HTML-письма"]',
	);
	await expect(
		preview.getByRole("heading", { name: richHeading }),
	).toBeVisible();
	await expect(preview.getByRole("heading", { name: /Добро пожаловать.*Nocturne/ })).toBeVisible();
	await expect(preview.locator("td[background]")).toHaveAttribute("background", layoutImage);
	await expect(preview.getByText("Условия", { exact: true })).toBeVisible();
	await expect(templatePanel.getByRole("button", { name: "Показать изображения" })).toHaveAttribute("aria-pressed", "false");
	await templatePanel.getByRole("button", { name: "Мобильный экран" }).click();
	await expect(templatePanel.getByRole("button", { name: "Мобильный экран" })).toHaveAttribute("aria-pressed", "true");
	await expect.poll(() => preview.locator("html").evaluate((root) => root.scrollWidth - root.clientWidth)).toBeLessThanOrEqual(1);
	await templatePanel.getByRole("button", { name: "Широкий экран" }).click();
	await page.screenshot({
		path: info.outputPath("mail-layout-builder.png"),
		animations: "disabled",
	});
	await templatePanel
		.getByRole("button", { name: "Сохранить шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Вставить в письмо" })
		.click();
	await newComposer
		.getByRole("button", { name: "HTML-код", exact: true })
		.click();
	await expect(
		newComposer.getByRole("textbox", { name: "HTML письма" }),
	).toHaveValue(/Личный тестовый ответ[\s\S]*banner\.gif/);
	await newComposer
		.getByRole("button", { name: "Шаблоны", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Личные", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Новый шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "Название", exact: true })
		.fill("Готовый HTML");
	await templatePanel
		.getByRole("button", { name: "HTML-код", exact: true })
		.click();
	await templatePanel
		.getByRole("textbox", { name: "HTML шаблона" })
		.fill(importedHtml);
	await expect(
		preview.getByText("Вставленный HTML", { exact: true }),
	).toBeVisible();
	await templatePanel
		.getByRole("button", { name: "Сохранить шаблон", exact: true })
		.click();
	await templatePanel
		.getByRole("button", { name: "Вставить в письмо" })
		.click();
	await newComposer
		.getByRole("button", { name: "Сохранить черновик", exact: true })
		.click();
	await expect(
		mail.getByText("Черновик сохранён", { exact: true }),
	).toBeVisible();
});
