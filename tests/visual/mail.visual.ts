import { renderMailLayout } from "../../shared/mail-layout.js";
import { accessToken, knowledge } from "./data";
import { expect, test } from "./fixture";

test("expand an HTML email in the reading pane and load its photo only on request", async ({ context, isMobile, page }, info) => {
	const mailbox = { id: "reader", address: "reader@example.invalid", provider: "gmail" };
	const photo = "https://media.example.invalid/reader-photo.svg";
	let photoRequests = 0;
	let finishPhoto = () => {};
	const photoReady = new Promise<void>((resolve) => { finishPhoto = resolve; });
	const message = {
		id: "long-mail",
		threadId: "history",
		date: Date.UTC(2026, 10, 27, 10),
		labels: ["INBOX"],
		from: "sender@example.invalid",
		to: mailbox.address,
		subject: "Длинное письмо с фотографией",
		snippet: "Текст письма",
		count: 1,
		text: "",
		html: `<h1>Начало письма</h1><img src="${photo}" alt="Фотография"/>${"<p>Абзац письма для проверки высоты области чтения.</p>".repeat(35)}<p>Конец письма</p>`,
		attachments: [],
	};
	await context.route("**/api/binds?action=workspace", (route) =>
		route.fulfill({ json: { ...knowledge, branches: { choices: {}, incoming: [], outgoing: [] } } }),
	);
	await context.route(photo, async (route) => {
		photoRequests++;
		await photoReady;
		return route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="140"><rect width="250" height="140" fill="#475569" /></svg>',
		});
	});
	await context.route("**/api/mail?**", (route) => {
		const action = new URL(route.request().url()).searchParams.get("action");
		switch (action) {
			case "list": return route.fulfill({ json: { configured: true, admin: false, mailboxes: [mailbox] } });
			case "folder": return route.fulfill({ json: { rows: [{ ...message, html: undefined }], next: null } });
			case "thread": return route.fulfill({ json: { messages: [message], before: null } });
			case "labels": return route.fulfill({ json: { labels: [] } });
			case "folder-counts": return route.fulfill({ json: { counts: {} } });
			case "stats": return route.fulfill({ json: { stats: [] } });
			default: return route.fallback();
		}
	});
	try {
		await page.goto("/mail");
		if (!isMobile) {
			const accounts = page.getByRole("region", { name: "Выбор почтового ящика" }).getByRole("list");
			await expect(accounts).toBeVisible();
			expect(await accounts.evaluate((list) => list.scrollWidth - list.clientWidth)).toBeLessThanOrEqual(1);
		}
		const list = page.getByRole("region", { name: "Список писем" });
		await expect(list.getByText(message.subject)).toBeVisible();
		expect(photoRequests).toBe(0);
		await list.getByText(message.subject).click();
		const thread = page.getByRole("region", { name: "Переписка" });
		const preview = thread.locator('iframe[title="Содержимое письма"]');
		const frame = thread.frameLocator('iframe[title="Содержимое письма"]');
		await expect(frame.getByRole("heading", { name: "Начало письма" })).toBeVisible();
		const dimensions = await preview.evaluate((iframe) => ({
			height: iframe.clientHeight,
			body: iframe.closest(".mail-message")?.clientWidth ?? 0,
			pane: iframe.closest(".mail-messages")?.clientWidth ?? 0,
		}));
		expect(dimensions.height).toBeGreaterThan(800);
		expect(dimensions.body / dimensions.pane).toBeGreaterThan(0.85);
		const end = frame.getByText("Конец письма", { exact: true });
		await end.scrollIntoViewIfNeeded();
		await expect(end).toBeInViewport();
		expect(await frame.locator("html").evaluate((doc) => doc.scrollHeight - doc.clientHeight)).toBeLessThanOrEqual(1);
		expect(photoRequests).toBe(0);
		await thread.getByRole("button", { name: "Показать изображения" }).click();
		await expect.poll(() => photoRequests).toBe(1);
		await expect(frame.getByRole("heading", { name: "Начало письма" })).toBeVisible();
		finishPhoto();
		await expect.poll(() => frame.getByRole("img", { name: "Фотография" }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(250);
		await expect.poll(() => preview.evaluate((iframe) => iframe.clientHeight)).toBeGreaterThan(dimensions.height + 80);
		await page.screenshot({ path: info.outputPath("full-html-email.png"), animations: "disabled" });
	} finally {
		finishPhoto();
	}
});

test("connect and delegate a mailbox from administration", async ({ context, page, isMobile }, info) => {
	const mailbox = { id: "shared-support", address: "support@example.invalid", provider: "gmail" };
	const mailboxes = [{ id: "other-box", address: "existing@example.invalid", provider: "gmail" }];
	const agent = { id: "agent", email: "agent@example.invalid", display_name: "Тестовый сотрудник почты" };
	let members: typeof agent[] = [];
	let attempts = 0;
	let completed = 0;
	await context.route("**/api/binds?action=workspace", (route) =>
		route.fulfill({ json: { ...knowledge, branches: { choices: {}, incoming: [], outgoing: [] } } }),
	);
	await context.route("https://accounts.google.com/o/oauth2/v2/auth?**", (route) => {
		const state = new URL(route.request().url()).searchParams.get("state");
		expect(state).toBe(`state-${attempts}`);
		const callback = attempts === 1
			? new URLSearchParams({ mail_code: "google+code", mail_state: state ?? "" })
			: new URLSearchParams({ mail_error: "denied" });
		return route.fulfill({ status: 303, headers: { location: `http://127.0.0.1:4173/admin#mailboxes?${callback}` } });
	});
	await context.route("**/api/mail?**", (route) => {
		const request = route.request();
		const url = new URL(request.url());
		expect(request.headers().authorization).toBe(`Bearer ${accessToken}`);
		switch (url.searchParams.get("action")) {
			case "list":
				return route.fulfill({ json: { configured: true, admin: true, mailboxes } });
			case "oauth-start":
				expect(request.postDataJSON()).toEqual({ address: mailbox.address });
				attempts++;
				return route.fulfill({ json: { state: `state-${attempts}`, url: `https://accounts.google.com/o/oauth2/v2/auth?state=state-${attempts}` } });
			case "oauth-finish":
				expect(request.postDataJSON()).toEqual({ code: "google+code", state: "state-1" });
				completed++;
				mailboxes.push(mailbox);
				return route.fulfill({ json: mailbox });
			case "members":
				expect(url.searchParams.get("box")).toBe(mailbox.id);
				return route.fulfill({ json: { members } });
			case "grant":
				expect(url.searchParams.get("box")).toBe(mailbox.id);
				expect(request.postDataJSON()).toEqual({ email: agent.email });
				members = [agent];
				return route.fulfill({ json: { ok: true } });
			case "revoke":
				expect(url.searchParams.get("box")).toBe(mailbox.id);
				expect(request.postDataJSON()).toEqual({ userId: agent.id });
				members = [];
				return route.fulfill({ json: { ok: true } });
			default:
				throw new Error(`Unexpected mail request ${url.searchParams.get("action")}`);
		}
	});
	await page.goto("/admin#mailboxes");
	await expect(page.getByRole("heading", { name: "Почтовые ящики", exact: true })).toBeVisible();
	if (isMobile) await expect(page.getByRole("combobox", { name: "Раздел" })).toHaveValue("mailboxes");
	else await expect(page.getByRole("button", { name: "Почтовые ящики", exact: true })).toHaveAttribute("aria-current", "page");
	await page.getByRole("button", { name: "Подключить Gmail", exact: true }).click();
	const google = page.getByRole("dialog", { name: "Подключение Gmail" });
	await expect(google.getByText(/администратор вводит код/)).toBeVisible();
	await expect(google).toBeInViewport({ ratio: 1 });
	await page.screenshot({ path: info.outputPath("gmail-connect.png"), animations: "disabled" });
	await google.getByRole("textbox", { name: "Рабочий адрес" }).fill(mailbox.address);
	await google.getByRole("button", { name: "Продолжить в Google" }).click();
	await expect(page.getByRole("status").filter({ hasText: `Подключён ящик ${mailbox.address}` })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Подключённые ящики · 2" })).toBeVisible();
	await expect(page).toHaveURL(/\/admin#mailboxes$/);
	expect(completed).toBe(1);
	await page.getByRole("button", { name: "Настроить доступ" }).click();
	const access = page.getByRole("dialog", { name: "Доступ к ящику" });
	await expect(access.getByText(mailbox.address, { exact: true })).toBeVisible();
	await access.getByRole("textbox", { name: "Адрес сотрудника" }).fill(agent.email);
	await access.getByRole("button", { name: "Выдать доступ" }).click();
	await expect(access.getByText(agent.display_name)).toBeVisible();
	await access.getByRole("button", { name: "Отозвать", exact: true }).click();
	await access.getByRole("button", { name: "Подтвердить отзыв" }).click();
	await expect(access.getByText(agent.display_name)).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(access).toHaveCount(0);
	await page.getByRole("searchbox", { name: "Найти почтовый ящик" }).fill("support");
	await expect(page.getByText(mailboxes[0].address, { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: `Переподключить ${mailbox.address}`, exact: true }).click({ timeout: 10_000 });
	await expect(google.getByRole("textbox", { name: "Рабочий адрес" })).toHaveValue(mailbox.address);
	await expect(google.getByRole("textbox", { name: "Рабочий адрес" })).not.toBeEditable();
	await google.getByRole("button", { name: "Продолжить в Google" }).click();
	await expect(page.getByRole("alert").getByText(/Подключение не завершено/)).toBeVisible();
	await expect(page).toHaveURL(/\/admin#mailboxes$/);
	expect(completed).toBe(1);
});

test("browse shared Gmail, organize mail and reuse a recipient", async ({
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
	const importedHtml = '<h1>Вставленный HTML</h1><table width="920"><tbody><tr><td style="color:#334488"><p>До правки</p><a href="https://example.invalid/old">Подробности</a><img src="https://media.example.invalid/old.gif" alt="Обложка"></td></tr><tr><td height="1450">Длинный блок письма</td></tr><tr><td>Конец письма</td></tr></tbody></table>';
	const appendedHtml = "<p>Дополнение из HTML</p>";
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
	const sentMessage = {
		...message,
		id: "sent-mock",
		date: message.date + 60_000,
		labels: ["SENT"],
		from: message.to,
		to: message.from,
		staffSender: "Анна Корнеева",
		text: "Тестовый ответ",
	};
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
													...(sends ? sentMessage : message),
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
							: sends ? [message, sentMessage] : [message],
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
			case "import-template-html": {
				const { html } = request.postDataJSON();
				expect([importedHtml, appendedHtml]).toContain(html);
				return route.fulfill({ json: { html } });
			}
			case "save-template": {
				const personal = url.searchParams.get("scope") === "personal";
				expect(personal ? ["test-0", "test-31"] : ["test-31"]).toContain(box);
				const previous = personal ? personalTemplate : template;
				const draft = request.postDataJSON();
				if (draft.layout?.frame === "source") {
					expect(draft.layout.blocks).toMatchObject([
						{ type: "heading", text: "Заголовок после импорта" },
						{ type: "html", html: expect.stringContaining("Текст после импорта") },
						{ type: "text", text: "Дополнение из HTML" },
					]);
					draft.html = renderMailLayout(draft.layout);
					expect(draft.html).toContain('width="920"');
					expect(draft.html).toContain('style="color:#334488"');
					expect(draft.html).toContain('href="https://example.invalid/new"');
					expect(draft.html).toContain('src="https://media.example.invalid/new.gif"');
					draft.body = "Заголовок после импорта\nТекст после импорта";
				} else if (draft.layout) {
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
					html: expect.stringContaining("Текст после импорта"),
					text: expect.stringContaining(richHeading),
				});
				return route.fulfill({ json: { id: "layout-draft" } });
			case "delete-template":
				expect(box).toBe("test-31");
				expect(request.postDataJSON()).toEqual({ id: templateId, revision: 2 });
				template = undefined;
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
	if (isMobile) await boxPicker.click();
	const boxes = mail.getByRole("region", { name: "Выбор почтового ящика" });
	const mailboxSearch = boxes.getByRole("searchbox", { name: "Найти ящик" });
	await mailboxSearch.fill("desk31");
	await page.screenshot({
		path: info.outputPath("mail-accounts.png"),
		animations: "disabled",
	});
	await boxes
		.getByRole("button", { name: "desk31@example.invalid", exact: true })
		.click();
	if (isMobile) await expect(boxes).toBeHidden();
	else {
		await expect(boxes.getByRole("button", { name: "desk31@example.invalid", exact: true })).toHaveAttribute("aria-pressed", "true");
		await mailboxSearch.clear();
	}
	const folderNav = mail.getByRole("navigation", { name: "Папки ящика" });
	const systemNav = mail.getByRole("navigation", { name: "Папки Gmail" });
	if (!isMobile) {
		const mailboxColumn = await boxes.boundingBox();
		const folderColumn = await systemNav.boundingBox();
		expect(mailboxColumn?.x).toBeLessThan(folderColumn?.x ?? 0);
		expect(mailboxColumn?.height).toBeGreaterThan(200);
	}
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
	await expect(
		mail.getByRole("article").getByText("Отправил: Анна Корнеева"),
	).toBeVisible();
	if (isMobile)
		await mail.getByRole("button", { name: "К списку писем" }).click();
	await expect(incoming.getByText("Отправил: Анна Корнеева")).toBeVisible();
	if (isMobile) await incoming.click();
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
	await expect.poll(() => activeMailboxes).toBeGreaterThan(0);
	received = true;
	recentDate += 10_000;
	await mail.getByRole("button", { name: "Обновить письма" }).click();
	await expect(
		mail.getByText("Новая почта в desk31@example.invalid", { exact: true }),
	).toBeVisible();
	if (isMobile) await page.getByRole("button", { name: "Поиск", exact: true }).click();
	await page.getByRole("textbox", { name: "Глобальный поиск", exact: true }).fill("desk0@");
	await page
		.getByRole("option", { name: /desk0@example\.invalid.*Почтовый ящик/ })
		.click();
	if (isMobile) await expect(boxPicker).toHaveAccessibleDescription("desk0@example.invalid");
	else await expect(boxes.getByRole("button", { name: "desk0@example.invalid", exact: true })).toHaveAttribute("aria-pressed", "true");
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
	await expect(preview.locator("html")).toHaveCSS("overflow", "hidden");
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
	await templatePanel.getByRole("button", { name: "Редактировать шаблон" }).click();
	await templatePanel.getByRole("button", { name: "Импортировать в конструктор" }).click();
	await templatePanel.getByRole("textbox", { name: "Текст заголовка" }).fill("Заголовок после импорта");
	const blocks = templatePanel.getByRole("list", { name: "Блоки письма" });
	await blocks.getByRole("button", { name: /^HTML-блок/ }).click();
	const importedText = blocks.getByRole("textbox", { name: "Текст 1", exact: true });
	await importedText.fill("");
	await importedText.fill("Текст после импорта");
	await blocks.getByRole("textbox", { name: "Адрес ссылки 1" }).fill("https://example.invalid/new");
	await blocks.getByRole("textbox", { name: "Адрес изображения 1" }).fill("https://media.example.invalid/new.gif");
	await expect(preview.getByText("Текст после импорта", { exact: true })).toBeVisible();
	await expect(preview.getByRole("img", { name: "Обложка" })).toHaveAttribute("src", "https://media.example.invalid/new.gif");
	const fittedPage = templatePanel.locator(".mail-html-fit");
	const longTable = preview.locator('table[width="920"]');
	const expectWholePreview = async () => {
		await expect(preview.getByText("Конец письма", { exact: true })).toBeInViewport();
		await expect.poll(async () => {
			const area = await fittedPage.boundingBox();
			const table = await longTable.boundingBox();
			return Boolean(area && table &&
				table.x >= area.x - 1 && table.y >= area.y - 1 &&
				table.x + table.width <= area.x + area.width + 1 &&
				table.y + table.height <= area.y + area.height + 1);
		}).toBe(true);
	};
	await fittedPage.scrollIntoViewIfNeeded();
	await expectWholePreview();
	if (!isMobile) {
		const editor = await templatePanel.locator(".mail-layout-block").last().boundingBox();
		const area = await fittedPage.boundingBox();
		expect(editor && area && editor.x + editor.width <= area.x).toBe(true);
	}
	const imageUrl = "https://media.example.invalid/new.gif";
	let finishImage = () => {};
	const imageUnblocked = new Promise<void>((resolve) => { finishImage = resolve; });
	await page.route(imageUrl, async (route) => {
		await imageUnblocked;
		await route.fulfill({
			contentType: "image/gif",
			body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
		});
	});
	try {
		const requested = page.waitForRequest(imageUrl);
		await templatePanel.getByRole("button", { name: "Показать изображения" }).click();
		await requested;
		await fittedPage.scrollIntoViewIfNeeded();
		await expectWholePreview();
	} finally {
		finishImage();
	}
	await expect(preview.getByRole("img", { name: "Обложка" })).toHaveJSProperty("complete", true);
	await templatePanel.getByRole("button", { name: "Скрыть изображения" }).click();
	await templatePanel.getByRole("button", { name: "Мобильный экран" }).click();
	await fittedPage.scrollIntoViewIfNeeded();
	await expectWholePreview();
	const originalViewport = page.viewportSize();
	if (!originalViewport) throw new Error("Viewport is required for the preview resize check");
	await page.setViewportSize({ ...originalViewport, height: originalViewport.height - 140 });
	await fittedPage.scrollIntoViewIfNeeded();
	await expectWholePreview();
	await page.setViewportSize(originalViewport);
	await templatePanel.getByText("Вставить HTML", { exact: true }).click();
	await templatePanel.getByRole("textbox", { name: "HTML для импорта" }).fill(appendedHtml);
	await templatePanel.getByRole("button", { name: "Добавить HTML в письмо" }).click();
	await expect(preview.getByText("Дополнение из HTML", { exact: true })).toBeVisible();
	await templatePanel.getByRole("button", { name: "Сохранить шаблон", exact: true }).click();
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
