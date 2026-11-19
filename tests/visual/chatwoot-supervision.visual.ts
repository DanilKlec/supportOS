import { expect, test } from "./fixture";
import { accessToken, knowledge } from "./data";

test("fit the chat workspace, dismiss its menus and deliver a private coaching note", async ({
	context,
	isMobile,
	page,
}, info) => {
	let watching = false;
	let agentView = false;
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
					json: { activeCount: 1, mineCount: 0, queueCount: 0 },
				});
			case "conversations": {
				const scope = url.searchParams.get("scope");
				return route.fulfill({
					json: {
						payload:
							scope === "history"
								? [{ ...conversation, status: "resolved" }]
								: agentView
									? [conversation]
									: [],
					},
				});
			}
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
				return route.fulfill({ json: conversation });
			case "messages":
				return route.fulfill({ json: { payload: readMessages } });
			case "coaching-notes":
				if (request.method() === "POST") {
					const body = request.postDataJSON();
					expect(body.conversationId).toBe(row.id);
					expect(body.recipientAgentId).toBe(5);
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
	await expect(
		observation.getByText("Ответ клиенту", { exact: true }),
	).toHaveCount(0);
	await observation
		.getByRole("textbox", { name: "Подсказка агенту" })
		.fill("Проверьте статус заявки");
	await observation
		.getByRole("textbox", { name: "Подсказка агенту" })
		.press("Enter");
	await expect(
		observation.getByText("Проверьте статус заявки", { exact: true }),
	).toBeVisible();
	await assertLayout("supervision");
	await observation
		.getByRole("button", { name: "Управлять", exact: true })
		.click();
	await expect(
		observation.getByText("Ответ клиенту", { exact: true }),
	).toBeVisible();
	const tag = observation.getByRole("button", { name: "Добавить тег" });
	await tag.click();
	await expect(
		observation.getByRole("button", { name: "priority-review" }),
	).toBeInViewport({ ratio: 1 });
	await observation.getByRole("heading", { name: row.player }).click();
	await expect(tag).toHaveAttribute("aria-expanded", "false");
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
	await page.getByRole("button", { name: "Команда", exact: true }).click();
	await expect(
		page.getByRole("textbox", { name: "Найти агента" }),
	).toBeVisible();
	await expect(page.getByText(row.agent, { exact: true })).toBeVisible();
	await assertLayout("team");
	await page.getByRole("button", { name: "Команды и теги" }).click();
	const directory = page.getByRole("dialog", { name: "Команды и теги" });
	await expect(
		directory.getByRole("button", { name: "Поддержка", exact: true }),
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
	await page.getByRole("button", { name: "Профиль агента" }).click();
	await expect(
		page.getByRole("switch", { name: /Приём чатов/ }),
	).toBeInViewport({ ratio: 1 });
	await page
		.getByRole("button", { name: "Источники чатов", exact: true })
		.click();
	const sources = page.getByRole("dialog", { name: "Источники чатов" });
	await expect(sources.getByText(row.project, { exact: true })).toBeVisible();
	await expect(sources).toBeInViewport({ ratio: 1 });
	await assertLayout("sources");
	await page.keyboard.press("Escape");
	await expect(sources).toHaveCount(0);
	await page.getByRole("button", { name: "Профиль агента" }).click();
	await page
		.getByRole("button", { name: "Поля Chatwoot", exact: true })
		.click();
	const fields = page.getByRole("dialog", { name: "Поля Chatwoot" });
	await fields.getByRole("button", { name: "Добавить поле" }).click();
	await expect(fields.getByPlaceholder("Например, ID игрока")).toBeVisible();
	await expect(fields).toBeInViewport({ ratio: 1 });
	await page.keyboard.press("Escape");
	await expect(fields).toHaveCount(0);
	agentView = true;
	await page.reload();
	await page.getByRole("button", { name: new RegExp(row.player) }).click();
	const incomingNote = page.getByRole("article", { name: "Личная подсказка" });
	await expect(
		incomingNote.getByText("Подсказка от супервайзера"),
	).toBeVisible();
	await expect(incomingNote.getByText("Проверьте статус заявки")).toBeVisible();
	await assertLayout("agent-chat");
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
