import { accessToken, knowledge } from "./data";
import { expect, test } from "./fixture";

test("work in up to four independent chat windows", async ({
	context,
	isMobile,
	page,
}, info) => {
	let publicMessages = 0;
	let translationAttempts = 0;
	let rejectPriority = true;
	let incomingNew = false;
	const priorityWrites: number[] = [];
	const firstMessageTime = 1791799200;
	const startTime = (firstMessageTime + 60) * 1000;
	await page.clock.setFixedTime(startTime);
	const chats = [21, 22, 23, 24, 25].map((id) => ({
		id,
		inbox_id: 2,
		status: "open",
		waiting_since: id === 21 ? firstMessageTime : 0,
		labels: id === 21 ? ["b2b-deposit-100-eur", "b2c-vip"] : [],
		access: { read: true, write: true, note: true, take: false, seeIp: false },
		meta: { sender: { name: `Игрок ${id}` } },
	}));
	await context.routeWebSocket(
		"wss://supportos-visual.invalid/realtime/v1/websocket?**",
		(socket) => socket.close(),
	);
	await context.route("https://lingva.ml/api/v1/**", (route) => {
		const request = route.request();
		const [, , , , target, content] = new URL(request.url()).pathname.split(
			"/",
		);
		expect(request.headers()).not.toHaveProperty("authorization");
		expect(target).toBe("de");
		expect(decodeURIComponent(content)).toBe("Ответ во второй чат");
		translationAttempts += 1;
		return route.fulfill({
			status: translationAttempts === 1 ? 503 : 200,
			json: { translation: "Antwort im zweiten Chat" },
			headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" },
		});
	});
	await context.route("**/api/binds?action=workspace", (route) =>
		route.fulfill({
			json: {
				...knowledge,
				branches: { choices: {}, incoming: [], outgoing: [] },
			},
		}),
	);
	await context.route("**/api/chatwoot?**", (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (
			url.origin !== "http://127.0.0.1:4173" ||
			request.headers().authorization !== `Bearer ${accessToken}`
		)
			return route.fallback();
		const id = Number(url.searchParams.get("id"));
		switch (url.searchParams.get("action")) {
			case "health":
				return route.fulfill({ json: { configured: true } });
			case "agents":
				return route.fulfill({
					json: {
						agents: [],
						teams: [],
						inboxes: [{ id: 2, name: "Тестовый проект", tagScope: "b2b" }],
						presence: [],
					},
				});
			case "presence":
				return route.fulfill({ json: { current: { accepting: true } } });
			case "team-status":
				return route.fulfill({ json: { online: 7, accepting: 5, bots: 2 } });
			case "conversation-counts":
				return route.fulfill({
					json: { mineCount: chats.length, queueCount: 0, activeCount: 12 },
				});
			case "conversations":
				return route.fulfill({
					json: {
						payload: url.searchParams.get("scope") === "mine" ? chats.map((chat) => incomingNew && chat.id === 22 ? {
							...chat, last_non_activity_message: { id: 99, message_type: 0, created_at: startTime / 1000, content: "Новое сообщение" },
						} : chat) : [],
						hasMore: false,
					},
				});
			case "conversation":
				return route.fulfill({ json: chats.find((item) => item.id === id) });
			case "messages":
				return route.fulfill({
					json: {
						payload: [
							{
								id,
								content:
									id === 22
										? "Guten Morgen, meine Einzahlung ist noch nicht angekommen."
										: `Входящее сообщение ${id}`,
								created_at: firstMessageTime,
								message_type: 0,
							},
						],
					},
				});
			case "coaching-notes":
				return route.fulfill({ json: { notes: [] } });
			case "labels":
				return route.fulfill({ json: { payload: [{ title: "привет" }, { title: "депозит" }, { title: "b2c-привет" }] } });
			case "custom-attributes":
				return route.fulfill({ json: { payload: [] } });
			case "priority": {
				const { conversationId, priority } = request.postDataJSON();
				expect(priority).toBe("high");
				priorityWrites.push(conversationId);
				return rejectPriority && conversationId === 22
					? route.fulfill({ status: 409, json: { error: "Чат уже изменился" } })
					: route.fulfill({ json: { priority } });
			}
			case "message":
				expect(request.postDataJSON()).toMatchObject({
					conversationId: 22,
					content: "Antwort im zweiten Chat",
					private: false,
				});
				publicMessages += 1;
				return route.fulfill({ json: { id: 40 } });
			default:
				return route.fallback();
		}
	});
	await page.goto("/inbox");
	const list = page.getByRole("complementary", { name: "Список диалогов" });
	const openRow = (id: number) =>
		list.getByRole("button", { name: new RegExp(`Игрок ${id}`) }).click();
	const pane = (id: number) => page.getByRole("region", { name: `Чат #${id}` });
	const reply = (id: number) =>
		pane(id).getByRole("textbox", { name: "Ответ игроку" });
	const tabs = page.getByRole("navigation", { name: "Открытые чаты" });
	const activate = (id: number) =>
		tabs.getByRole("button", { name: new RegExp(`#${id}`) }).click();
	const add = page.getByRole("button", { name: "Добавить чат", exact: true });
	const windows = page.locator(".chat-window-cell");
	const grid = page.locator(".chat-window-grid");
	const addChat = async (id: number) => {
		await add.click();
		await expect(list.getByText(/Выберите чат для нового окна/)).toBeVisible();
		await openRow(id);
		await expect(
			pane(id)
				.getByRole("log", { name: "Переписка" })
				.locator("[data-thread-bubble]")
				.first(),
		).toBeVisible();
	};

	await openRow(21);
	await expect(reply(21)).toBeFocused();
	await expect(page.getByRole("button", { name: /Операторы онлайн 7.*активные чаты 12/ })).toBeVisible();
	await expect(windows).toHaveCount(1);
	await expect(grid).toHaveAttribute("data-grid-size", "1");
	await expect(page.locator(".chat-windows-toolbar")).toHaveCount(0);
	const header = pane(21).locator(".chat-thread-header");
	await expect(
		header.getByRole("button", { name: "Добавить чат" }),
	).toBeVisible();
	if (!isMobile) {
		const card = pane(21).getByRole("complementary", {
			name: "Карточка игрока",
		});
		await expect(card).toBeVisible();
		await expect(card.getByText("b2b-deposit-100-eur")).toBeVisible();
		const [listBox, paneBox, headerBox, cardBox] = await Promise.all([
			list.boundingBox(),
			pane(21).boundingBox(),
			header.boundingBox(),
			card.boundingBox(),
		]);
		if (!listBox || !paneBox || !headerBox || !cardBox)
			throw new Error("Одна из панелей чата не отображается");
		expect(paneBox.x).toBeCloseTo(listBox.x + listBox.width, 0);
		expect(headerBox.y).toBeCloseTo(listBox.y, 0);
		expect(cardBox.x).toBeCloseTo(headerBox.x + headerBox.width, 0);
		const divider = pane(21).getByRole("separator", {
			name: "Изменить ширину карточки клиента",
		});
		await divider.press("ArrowLeft");
		await expect(divider).toHaveAttribute(
			"aria-valuenow",
			String(cardBox.width + 16),
		);
		expect((await card.boundingBox())?.width).toBe(cardBox.width + 16);
		await divider.press("ArrowRight");
	}
	await page.screenshot({
		path: info.outputPath("single-chat.png"),
		animations: "disabled",
	});
	await expect(pane(21).getByText("Ждёт 1 мин 00 с")).toBeVisible();
	await expect(pane(21).getByText(/1 мин 00 с назад/)).toBeVisible();
	await page.clock.setFixedTime(startTime + 1000);
	await expect(pane(21).getByText("Ждёт 1 мин 01 с")).toBeVisible();
	await expect(pane(21).getByText(/1 мин 01 с назад/)).toBeVisible();
	await pane(21).getByRole("button", { name: "Теги диалога" }).click();
	const tagSearch = pane(21).getByRole("textbox", { name: "Найти тег", exact: true });
	await tagSearch.fill("ghbdtn");
	await expect(pane(21).getByRole("button", { name: "привет", exact: true })).toBeVisible();
	await expect(pane(21).getByRole("button", { name: "b2c-привет", exact: true })).toHaveCount(0);
	await tagSearch.fill("дипозит");
	await expect(pane(21).getByRole("button", { name: "депозит", exact: true })).toBeVisible();
	await pane(21).getByRole("button", { name: "Закрепление тега депозит" }).click();
	await tagSearch.fill("");
	await expect(pane(21).locator(".chat-tag-options .chat-context-option").first()).toHaveText("депозит");
	await pane(21).getByRole("button", { name: "Закрыть действия с диалогом" }).click();
	await reply(21).fill("/Проверка статуса");
	await expect(
		pane(21).getByRole("option", { name: /Проверка статуса/ }),
	).toBeVisible();
	await reply(21).press("Enter");
	await expect(reply(21)).toHaveValue(
		knowledge.binds[1].translations[0].content,
	);
	expect(publicMessages).toBe(0);
	await reply(21).fill("Черновик первого чата");
	const openNote = () =>
		pane(21)
			.getByRole("button", { name: "Заметка команде", exact: true })
			.click();
	const openReply = () =>
		pane(21).getByRole("button", { name: "Ответ игроку", exact: true }).click();
	const note = pane(21).getByRole("textbox", { name: "Заметка команде" });
	await openNote();
	await expect(note).toHaveValue("");
	await note.fill("Черновик внутренней заметки");
	await openReply();
	await expect(reply(21)).toHaveValue("Черновик первого чата");
	if (isMobile)
		await page.getByRole("button", { name: "Показать список" }).click();
	await openRow(22);
	await expect(windows).toHaveCount(1);
	await expect(reply(22)).toBeFocused();
	if (isMobile)
		await page.getByRole("button", { name: "Показать список" }).click();
	await openRow(21);
	await expect(reply(21)).toHaveValue("Черновик первого чата");
	await openNote();
	await expect(note).toHaveValue("Черновик внутренней заметки");
	await openReply();

	await addChat(22);
	await expect(windows).toHaveCount(2);
	await expect(tabs).toBeVisible();
	await reply(22).fill("Ответ во второй чат");
	await expect(grid).toHaveAttribute("data-grid-size", isMobile ? "1" : "2");
	await addChat(23);
	await expect(grid).toHaveAttribute("data-grid-size", isMobile ? "1" : "3");
	await addChat(24);
	await expect(windows).toHaveCount(4);
	await expect(add).toBeDisabled();
	await expect(grid).toHaveAttribute("data-grid-size", isMobile ? "1" : "4");
	if (!isMobile) {
		const boxes = await Promise.all(
			[21, 22, 23, 24].map((id) => pane(id).boundingBox()),
		);
		expect(boxes[0]?.x).toBe(boxes[2]?.x);
		expect(boxes[1]?.x).toBe(boxes[3]?.x);
		expect(boxes[0]?.y).toBe(boxes[1]?.y);
		expect(boxes[2]?.y).toBeGreaterThan(boxes[0]?.y ?? 0);
	}
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(info.project.use.viewport?.width ?? 1440);
	await page.screenshot({
		path: info.outputPath("four-open-chats.png"),
		animations: "disabled",
	});

	if (isMobile) await activate(22);
	else {
		await pane(22).getByRole("button", { name: "Развернуть чат" }).click();
		await expect(pane(21)).toHaveCount(0);
		await expect(pane(22)).toBeVisible();
		await expect(windows).toHaveCount(4);
	}
	await expect(reply(22)).toHaveValue("Ответ во второй чат");
	await reply(22).press("Enter");
	await expect(pane(22).getByRole("alert")).toContainText(
		"Не удалось перевести",
	);
	await expect(reply(22)).toHaveValue("Ответ во второй чат");
	expect(publicMessages).toBe(0);
	await reply(22).press("Enter");
	await expect.poll(() => publicMessages).toBe(1);
	expect(translationAttempts).toBe(2);
	await page.bringToFront();
	incomingNew = true;
	const notification = page.getByText("Новое сообщение в чате", { exact: true });
	await expect(notification).toBeVisible({ timeout: 12000 });
	const sendButton = pane(22).getByRole("button", { name: "Отправить игроку" });
	const [notificationBox, sendBox] = await Promise.all([notification.boundingBox(), sendButton.boundingBox()]);
	expect(notificationBox?.y ?? Infinity).toBeLessThan(sendBox?.y ?? 0);
	if (!isMobile)
		await pane(22).getByRole("button", { name: "Вернуть сетку чатов" }).click();
	else await activate(21);
	await expect(reply(21)).toHaveValue("Черновик первого чата");
	if (isMobile) await activate(23);
	await pane(23).getByRole("button", { name: "Закрыть диалог" }).click();
	await expect(windows).toHaveCount(3);
	await expect(add).toBeEnabled();
	await addChat(21);
	await expect(windows).toHaveCount(3);
	await expect(reply(21)).toHaveValue("Черновик первого чата");
	await addChat(25);
	await expect(windows).toHaveCount(4);
	await page.getByRole("button", { name: /^Очередь/ }).click();
	await expect(list.getByText("Очередь пуста")).toBeVisible();
	if (isMobile)
		await list.getByRole("button", { name: "К открытым чатам" }).click();
	await expect(windows).toHaveCount(4);
	await expect(pane(25)).toBeVisible();
	await page.getByRole("button", { name: /^Мои/ }).click();
	await list.getByRole("button", { name: "Выбрать несколько" }).click();
	const bulk = list.getByRole("region", { name: "Массовые действия" });
	const picked = (id: number) =>
		list.getByRole("checkbox", { name: `Выбрать диалог #${id}` });
	await picked(21).check();
	await picked(22).check();
	await bulk
		.getByRole("combobox", { name: "Массовое действие" })
		.selectOption("priority:high");
	await bulk.getByRole("button", { name: "Применить к выбранным" }).click();
	expect(priorityWrites).toEqual([]);
	await bulk.getByRole("button", { name: "Подтвердить" }).click();
	await expect(bulk.getByRole("status")).toContainText("Обновлено 1 из 2");
	await expect(bulk.getByRole("list")).toContainText("#22 · Чат уже изменился");
	await expect(picked(21)).not.toBeChecked();
	await expect(picked(22)).toBeChecked();
	rejectPriority = false;
	await bulk.getByRole("button", { name: "Применить к выбранным" }).click();
	await bulk.getByRole("button", { name: "Подтвердить" }).click();
	await expect(bulk.getByRole("status")).toContainText("Обновлено 1 из 1");
	expect(priorityWrites.sort((a, b) => a - b)).toEqual([21, 22, 22]);
});
