import { expect, test } from "./fixture";
import { accessToken, knowledge } from "./data";

test("fit the chat workspace, dismiss its menus and deliver a private coaching note", async ({
	context,
	isMobile,
	page,
}, info) => {
	let watching = false;
	let agentView = false;
	let queued = false;
	let taken = false;
	let capacity = 4;
	let assignedAgent = { id: 5, name: "Тестовый агент" };
	let notesSent = 0;
	let privateNote:
		| { id: string; author: string; content: string; createdAt: string }
		| undefined;
	const row = {
		id: 14,
		player: "Тестовый игрок",
		email: "player@example.invalid",
		agent: "Тестовый агент",
		project: "Тестовый сайт",
		inboxId: 2,
		status: "open",
		startedAt: Date.UTC(2026, 9, 12, 10),
		country: "GR",
		tags: ["billing"],
	};
	const conversation = {
		id: row.id,
		inbox_id: row.inboxId,
		status: row.status,
		labels: row.tags,
		meta: {
			sender: { name: row.player, email: row.email },
			assignee: { id: 5, name: row.agent },
		},
		access: { read: true, note: true, write: true, take: false, seeIp: true },
		coachRecipient: { id: 5, name: row.agent },
	};
	const assertLayout = async (name: string) => {
		const bounds = await page
			.locator(".supportos-inbox")
			.evaluate((element) => ({
				left: element.getBoundingClientRect().left,
				right: element.getBoundingClientRect().right,
				viewport: document.documentElement.clientWidth,
				pageScroll: document.documentElement.scrollWidth,
			}));
		expect(bounds.left).toBeGreaterThanOrEqual(-1);
		expect(bounds.right).toBeLessThanOrEqual(bounds.viewport + 1);
		expect(bounds.pageScroll).toBeLessThanOrEqual(bounds.viewport + 1);
		await page.screenshot({
			path: info.outputPath(`${name}.png`),
			animations: "disabled",
		});
	};
	const readMessages = [
		{
			id: 23,
			content: "Первое обращение",
			message_type: 0,
			created_at: 1791799200,
		},
	];
	await context.routeWebSocket(
		"wss://supportos-visual.invalid/realtime/v1/websocket?**",
		(socket) => socket.close(),
	);
	await context.route(
		"http://127.0.0.1:4173/api/binds?action=workspace",
		(route) => {
			const request = route.request();
			if (
				request.method() !== "GET" ||
				request.headers().authorization !== `Bearer ${accessToken}`
			)
				return route.fallback();
			return route.fulfill({
				json: {
					...knowledge,
					branches: { choices: {}, incoming: [], outgoing: [] },
				},
			});
		},
	);
	await context.route("**/api/chatwoot?**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const action = url.searchParams.get("action");
		if (
			url.origin !== "http://127.0.0.1:4173" ||
			request.headers().authorization !== `Bearer ${accessToken}`
		)
			return route.fallback();
		switch (action) {
			case "health":
				return route.fulfill({
					json: {
						configured: true,
						capabilities: {
							supervise: !agentView,
							manageAllChats: !agentView,
							reviewNotes: !agentView,
							manageProjects: !agentView,
							deleteProjects: !agentView,
							manageRouting: !agentView,
							manageWebhooks: !agentView,
						},
					},
				});
			case "agents":
				return route.fulfill({
					json: {
						agents: [
							{
								id: 5,
								name: row.agent,
								email: "agent@example.invalid",
								role: "agent",
								max_active_chats: capacity,
							},
						],
						teams: [{ id: 9, name: "Поддержка", agents: [{ id: 5 }] }],
						inboxes: [{ id: row.inboxId, name: row.project }],
						presence: [],
					},
				});
			case "presence":
				return route.fulfill({
					json: { current: { accepting: false }, rows: [] },
				});
			case "labels":
				return route.fulfill({
					json: {
						payload: [{ title: "billing" }, { title: "priority-review" }],
					},
				});
			case "conversation-counts":
				return route.fulfill({
					json: {
						activeCount: 1,
						mineCount: taken ? 1 : 0,
						queueCount: queued && !taken ? 1 : 0,
					},
				});
			case "conversations": {
				const scope = url.searchParams.get("scope");
				const status = url.searchParams.get("status");
				const query = url.searchParams.get("q");
				return route.fulfill({
					json: {
						payload:
							scope === "history"
								? status === "resolved" && !query
									? [{ ...conversation, status }]
									: []
								: scope === "queue"
									? queued && !taken
										? [conversation]
										: []
									: agentView || taken
										? [conversation]
										: [],
					},
				});
			}
			case "take":
				expect(request.postDataJSON().conversationId).toBe(row.id);
				taken = true;
				return route.fulfill({ json: { id: row.id } });
			case "agent-capacity": {
				const body = request.postDataJSON();
				expect(body.agentId).toBe(5);
				capacity = body.maxActiveChats;
				return route.fulfill({ json: body });
			}
			case "chat-operations":
				return route.fulfill({ json: { agents: {}, inboxes: {} } });
			case "chat-supervisor":
				return route.fulfill({
					json: {
						queue: 0,
						active: 1,
						truncated: false,
						agents: [
							{
								id: 5,
								online: true,
								accepting: true,
								onShift: true,
								used: 1,
								limit: 4,
							},
						],
						sla: [],
					},
				});
			case "custom-attributes":
				return route.fulfill({ json: { payload: [] } });
			case "chat-team":
				return route.fulfill({
					json: { payload: [{ id: 9, name: "Поддержка" }] },
				});
			case "webhook-secret":
				return route.fulfill({
					json: { configured: false, lastReceivedAt: null },
				});
			case "website-inboxes":
				return route.fulfill({
					json: {
						baseUrl: "https://chat.example.invalid",
						inboxes: [
							{
								id: row.inboxId,
								name: row.project,
								website_url: "https://project.example.invalid",
								website_token: "test-widget",
							},
						],
					},
				});
			case "supervision": {
				if (request.method() === "POST") {
					const body = request.postDataJSON();
					expect(body.conversationId).toBe(row.id);
					watching = body.enabled;
					return route.fulfill({ json: { id: row.id, watching } });
				}
				return route.fulfill({ json: { ids: watching ? [row.id] : [] } });
			}
			case "active-overview": {
				const rows =
					url.searchParams.get("mode") === "watching" && !watching ? [] : [row];
				return route.fulfill({
					json: { rows, total: rows.length, hasMore: false },
				});
			}
			case "conversation":
				return route.fulfill({
					json: {
						...conversation,
						access: { ...conversation.access, take: queued && !taken },
						meta: { ...conversation.meta, assignee: assignedAgent },
						coachRecipient: assignedAgent,
					},
				});
			case "messages":
				return route.fulfill({ json: { payload: readMessages } });
			case "coaching-notes":
				if (request.method() === "POST") {
					const body = request.postDataJSON();
					expect(body.conversationId).toBe(row.id);
					expect(body.recipientAgentId).toBe(assignedAgent.id);
					notesSent += 1;
					privateNote = {
						id: body.noteId,
						content: body.content,
						author: "QC",
						createdAt: "2026-10-12T12:00:00Z",
					};
					return route.fulfill({ json: { ...privateNote, own: true } });
				}
				return route.fulfill({
					json: {
						notes: privateNote ? [{ ...privateNote, own: !agentView }] : [],
					},
				});
			default:
				return route.fallback();
		}
	});

	await page.goto("/inbox");
	await page.getByRole("button", { name: /^Очередь/ }).click();
	await expect(page.getByText("Очередь пуста", { exact: true })).toBeVisible();
	await assertLayout("queue");
	await page.getByRole("button", { name: /^Активные/ }).click();
	const table = page.getByRole("table");
	await expect(table.getByText(row.email)).toBeVisible();
	await assertLayout("active");
	if (!isMobile) {
		const columns = page.getByRole("button", { name: "Колонки" });
		await columns.click();
		await expect(columns).toHaveAttribute("aria-expanded", "true");
		await columns.press("Escape");
		await expect(columns).toHaveAttribute("aria-expanded", "false");
	}
	await page.getByRole("button", { name: "Фильтры", exact: true }).click();
	await expect(
		page.getByRole("combobox", { name: "Проект", exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Фильтры", exact: true }).click();
	await table.getByRole("button", { name: "Наблюдать" }).click();
	const observation = page.getByRole("complementary", {
		name: "Наблюдение за диалогом",
	});
	await expect(observation.getByText("Первое обращение")).toBeVisible();
	if (!isMobile)
		await expect(table.locator("[data-chat-row]")).toHaveCSS(
			"display",
			"table-row",
		);
	await expect(
		observation.getByText("Лично назначенному агенту"),
	).toBeVisible();
	await expect(
		observation.getByText("Агент · Тестовый агент", { exact: true }),
	).toBeVisible();
	await expect(
		observation.getByRole("textbox", { name: "Ответ игроку" }),
	).toHaveCount(0);
	const draft = observation.getByRole("textbox", { name: "Подсказка агенту" });
	const sendHint = observation.getByRole("button", {
		name: "Отправить агенту",
	});
	await draft.fill("Проверьте статус заявки");
	await assertLayout("supervision-draft");
	assignedAgent = { id: 6, name: "Новый тестовый агент" };
	await expect(observation.getByText(/Агент сменился/)).toBeVisible();
	await expect(sendHint).toBeDisabled();
	await draft.press("Enter");
	expect(notesSent).toBe(0);
	await observation
		.getByRole("button", { name: "Выбрать нового агента" })
		.click();
	await expect(sendHint).toBeEnabled();
	await draft.press("Enter");
	await expect(observation.getByText("Подсказка отправлена")).toBeVisible();
	await expect(
		observation.getByText("Проверьте статус заявки", { exact: true }),
	).toBeInViewport({ ratio: 1 });
	await assertLayout("supervision");
	await observation.getByRole("button", { name: /Подсказки/ }).click();
	await expect(observation.getByText("Первое обращение")).toHaveCount(0);
	await expect(
		observation.getByText("Проверьте статус заявки", { exact: true }),
	).toBeVisible();
	await observation
		.getByRole("button", { name: "Управлять чатом", exact: true })
		.click();
	await expect(
		observation.getByRole("textbox", { name: "Ответ игроку" }),
	).toBeVisible();
	await expect(
		observation.getByText("Управление чатом", { exact: true }),
	).toBeVisible();
	await expect(draft).toHaveCount(0);
	const tag = observation.getByRole("button", { name: "Добавить тег" });
	await tag.click();
	const tagSearch = observation.getByRole("textbox", { name: "Найти тег" });
	await expect(tagSearch).toBeFocused();
	await tagSearch.fill("несуществующий");
	await expect(observation.getByText("Теги не найдены")).toBeVisible();
	await tagSearch.fill("priority");
	await expect(
		observation.getByRole("button", { name: "priority-review" }),
	).toBeInViewport({ ratio: 1 });
	await observation.getByRole("heading", { name: row.player }).click();
	await expect(tag).toHaveAttribute("aria-expanded", "false");
	const assignee = observation.getByRole("button", {
		name: "Назначить агента",
	});
	await assignee.click();
	const agentSearch = observation.getByRole("textbox", {
		name: "Найти агента для назначения",
	});
	await expect(agentSearch).toBeInViewport({ ratio: 1 });
	await agentSearch.fill("agent@example.invalid");
	await expect(
		observation.getByRole("button", { name: row.agent, exact: true }),
	).toBeVisible();
	await agentSearch.press("Escape");
	await expect(assignee).toBeFocused();
	const card = observation.getByRole("button", { name: "Карточка игрока" });
	await card.click();
	await expect(
		observation.getByRole("complementary", { name: "Карточка игрока" }),
	).toBeInViewport();
	await page.keyboard.press("Escape");
	await expect(card).toBeFocused();
	await observation.getByRole("button", { name: "Закрыть наблюдение" }).click();
	await page.getByRole("button", { name: /Наблюдаемые/ }).click();
	await expect(table.getByText(row.player)).toBeVisible();
	await table
		.getByRole("button", { name: "Прекратить наблюдение за #14" })
		.click();
	await expect(table.getByText(/Нет наблюдаемых диалогов/)).toBeVisible();
	await page.getByRole("button", { name: "Архив", exact: true }).click();
	await expect(
		page
			.getByRole("complementary", { name: "Архив диалогов" })
			.getByText(row.player),
	).toBeVisible();
	await assertLayout("archive");
	const archive = page.getByRole("complementary", { name: "Архив диалогов" });
	await archive.getByRole("button", { name: "Отложенные" }).click();
	await expect(archive.getByText("Нет отложенных диалогов")).toBeVisible();
	await archive.getByRole("button", { name: "Завершённые" }).click();
	await archive.getByRole("button", { name: "Фильтры" }).click();
	await archive
		.getByRole("combobox", { name: "Тег", exact: true })
		.selectOption("billing");
	await expect(archive.getByRole("button", { name: /Фильтры/ })).toContainText(
		"1",
	);
	await assertLayout("archive-filters");
	await archive
		.getByRole("textbox", { name: "Поиск диалогов" })
		.fill("несуществующий");
	await expect(archive.getByText("Диалогов не найдено")).toBeVisible();
	await page.getByRole("button", { name: "Диалоги", exact: true }).click();
	await expect(
		page.getByRole("textbox", { name: "Поиск диалогов" }),
	).toHaveValue("");
	await page.getByRole("button", { name: "Архив", exact: true }).click();
	await expect(
		archive.getByRole("textbox", { name: "Поиск диалогов" }),
	).toHaveValue("несуществующий");
	await archive
		.getByRole("button", { name: "Очистить поиск и фильтры" })
		.click();
	await expect(archive.getByText(row.player)).toBeVisible();
	await page.getByRole("button", { name: "Команда", exact: true }).click();
	await expect(
		page.getByRole("textbox", { name: "Найти агента" }),
	).toBeVisible();
	await expect(page.getByText(row.agent, { exact: true })).toBeVisible();
	const limit = page.getByRole("spinbutton", {
		name: `Максимум чатов для ${row.agent}`,
	});
	await limit.fill("0");
	await expect(
		page.getByRole("button", { name: "Сохранить", exact: true }),
	).toBeDisabled();
	await limit.fill("2");
	await page.getByRole("button", { name: "Сохранить", exact: true }).click();
	await expect(page.getByText("Лимит сохранён")).toBeVisible();
	await expect(limit).toHaveValue("2");
	await page.getByRole("checkbox", { name: "Только принимающие" }).check();
	await expect(page.getByText("Сейчас никто не принимает чаты")).toBeVisible();
	await page.getByRole("checkbox", { name: "Только принимающие" }).uncheck();
	await assertLayout("team");
	await page
		.getByRole("button", { name: "Настройки чатов", exact: true })
		.click();
	await assertLayout("settings");
	await page.getByRole("button", { name: "Команды и теги" }).click();
	const directory = page.getByRole("dialog", { name: "Команды и теги" });
	await expect(
		directory.getByRole("button", { name: "Поддержка", exact: true }),
	).toBeVisible();
	await directory.getByRole("textbox", { name: "Поиск команд" }).fill("Под");
	await directory
		.getByRole("button", { name: "Поддержка", exact: true })
		.click();
	await expect(
		directory.getByRole("heading", { name: "Настройки команды" }),
	).toBeVisible();
	await expect(directory).toBeInViewport({ ratio: 1 });
	await page.keyboard.press("Escape");
	await expect(directory).toHaveCount(0);
	await page.getByRole("button", { name: "Вебхуки" }).click();
	const webhook = page.getByRole("dialog", { name: "Синхронизация Chatwoot" });
	await expect(webhook.getByPlaceholder("Секрет из Chatwoot")).toBeVisible();
	await expect(webhook).toBeInViewport({ ratio: 1 });
	await page.keyboard.press("Escape");
	await expect(webhook).toHaveCount(0);
	await page.getByRole("button", { name: "Руководитель", exact: true }).click();
	await expect(page.getByText("Открытые и ожидающие")).toBeVisible();
	await assertLayout("operations");
	await page.getByRole("button", { name: "Смены и навыки" }).click();
	await expect(
		page.getByRole("button", { name: "Добавить смену" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Проекты и SLA" }).click();
	await expect(
		page.getByRole("spinbutton", { name: /Цель ответа/ }),
	).toBeVisible();
	await page.getByRole("button", { name: "Профиль агента" }).click();
	await expect(
		page.getByRole("switch", { name: /Приём чатов/ }),
	).toBeInViewport({ ratio: 1 });
	await assertLayout("profile");
	const sound = page.getByRole("switch", { name: "Звук уведомлений" });
	await expect(sound).toHaveAttribute("aria-checked", "true");
	await sound.click();
	await expect(sound).toHaveAttribute("aria-checked", "false");
	await expect(
		page.getByRole("link", { name: "Личные настройки SupportOS" }),
	).toBeInViewport({ ratio: 1 });
	await page.keyboard.press("Escape");
	await page
		.getByRole("button", { name: "Настройки чатов", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Источники чатов", exact: true })
		.click();
	const sources = page.getByRole("dialog", { name: "Источники чатов" });
	await expect(sources.getByText(row.project, { exact: true })).toBeVisible();
	await expect(sources).toBeInViewport({ ratio: 1 });
	await assertLayout("sources");
	await sources.getByRole("button", { name: "Удалить источник" }).click();
	await expect(
		sources.getByText(`Удалить источник «${row.project}»?`),
	).toBeVisible();
	await sources.getByRole("button", { name: "Отмена", exact: true }).click();
	await sources.getByRole("button", { name: "Добавить сайт" }).click();
	await expect(
		sources.getByRole("textbox", { name: "Название сайта" }),
	).toBeVisible();
	await assertLayout("source-setup");
	await page.keyboard.press("Escape");
	await expect(sources).toHaveCount(0);
	await page
		.getByRole("button", { name: "Поля Chatwoot", exact: true })
		.click();
	const fields = page.getByRole("dialog", { name: "Поля Chatwoot" });
	await fields.getByRole("button", { name: "Добавить поле" }).click();
	await expect(fields.getByPlaceholder("Например, ID игрока")).toBeVisible();
	await expect(fields).toBeInViewport({ ratio: 1 });
	await page.keyboard.press("Escape");
	await expect(fields).toHaveCount(0);
	queued = true;
	await page.reload();
	await page.getByRole("button", { name: /^Очередь/ }).click();
	await page.getByRole("button", { name: "Взять в работу диалог #14" }).click();
	await expect(page.getByRole("button", { name: /^Мои/ })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByRole("heading", { name: row.player })).toBeVisible();
	if (isMobile) {
		await page.getByRole("button", { name: /^Мои/ }).click();
		await expect(
			page.getByRole("textbox", { name: "Поиск диалогов" }),
		).toBeVisible();
	}
	agentView = true;
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Настройки чатов", exact: true }),
	).toHaveCount(0);
	await page.getByRole("button", { name: new RegExp(row.player) }).click();
	const incomingNote = page.getByRole("article", { name: "Личная подсказка" });
	await expect(
		incomingNote.getByText("Подсказка от супервайзера"),
	).toBeVisible();
	await expect(incomingNote.getByText("Проверьте статус заявки")).toBeVisible();
	await assertLayout("agent-chat");
	await page.getByRole("button", { name: /Подсказки/ }).click();
	await expect(page.getByRole("textbox", { name: "Ответ игроку" })).toHaveCount(
		0,
	);
	await expect(incomingNote.getByText("Проверьте статус заявки")).toBeVisible();
	await page.getByRole("button", { name: "Вернуться к переписке" }).click();
	await expect(
		page.getByRole("textbox", { name: "Ответ игроку" }),
	).toBeVisible();
	const quickReplies = page.getByRole("button", { name: "Быстрый бинд" });
	await quickReplies.click();
	await expect(page.getByPlaceholder("Найти бинд…")).toBeInViewport({
		ratio: 1,
	});
	await quickReplies.press("Escape");
	await expect(quickReplies).toHaveAttribute("aria-expanded", "false");
	if (!isMobile) {
		const resize = page.getByRole("separator", {
			name: "Изменить ширину списка",
		});
		const old = Number(await resize.getAttribute("aria-valuenow"));
		await resize.press("ArrowRight");
		await expect(resize).toHaveAttribute("aria-valuenow", String(old + 16));
		const handle = await resize.boundingBox();
		expect(handle).not.toBeNull();
		if (handle) {
			const x = handle.x + handle.width / 2;
			const y = handle.y + handle.height / 2;
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + 24, y, { steps: 4 });
			await page.mouse.up();
			await expect(resize).toHaveAttribute("aria-valuenow", String(old + 40));
		}
	}
	await expect(
		page.getByRole("textbox", { name: "Подсказка агенту" }),
	).toHaveCount(0);
	if (isMobile) {
		await page.getByRole("button", { name: "Показать список" }).click();
		await expect(
			page.getByRole("button", { name: new RegExp(row.player) }),
		).toBeVisible();
	}
});
