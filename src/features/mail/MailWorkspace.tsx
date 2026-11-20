import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Archive,
	Bell,
	ChevronLeft,
	ChevronRight,
	FileText,
	Inbox,
	Mail,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Send,
	ShieldAlert,
	Star,
	Tag,
	Trash2,
	Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type Mailbox,
	type MailDraft,
	type MailLabel,
	type MailRow,
	mailService,
} from "@/services/mail.service";
import { useAuthStore } from "@/store/auth.store";
import { MailAdministration, oauthSessionKey } from "./MailAdministration";
import { emptyMailDraft, MailComposer } from "./MailComposer";
import { MailLabelControls, MailLabelCreator } from "./MailLabelControls";
import { useMailNotificationPreference } from "./MailNotifications";
import { mailDate, MailThread, plainMailBody } from "./MailThread";
import "./mail.css";

const folders = [
	{ id: "INBOX", title: "Входящие", icon: Inbox },
	{ id: "STARRED", title: "Помеченные", icon: Star },
	{ id: "SENT", title: "Отправленные", icon: Send },
	{ id: "DRAFT", title: "Черновики", icon: FileText },
	{ id: "ALL", title: "Вся почта", icon: Archive },
	{ id: "IMPORTANT", title: "Важные", icon: Mail },
	{ id: "SNOOZED", title: "Отложенные", icon: Mail },
	{ id: "SPAM", title: "Спам", icon: ShieldAlert },
	{ id: "TRASH", title: "Корзина", icon: Trash2 },
];

const categories = [
	["INBOX", "Все входящие"],
	["CATEGORY_PERSONAL", "Основные"],
	["CATEGORY_SOCIAL", "Соцсети"],
	["CATEGORY_PROMOTIONS", "Промоакции"],
	["CATEGORY_UPDATES", "Оповещения"],
	["CATEGORY_FORUMS", "Форумы"],
] as const;

type OpenComposer = { box: Mailbox; draft: MailDraft };

export function MailWorkspace() {
	const client = useQueryClient();
	const userId = useAuthStore((state) => state.session?.user.id);
	const [selectedBox, setSelectedBox] = useState("");
	const [filter, setFilter] = useState("");
	const [label, setLabel] = useState("INBOX");
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");
	const [pages, setPages] = useState<string[]>([""]);
	const [openRow, setOpenRow] = useState<{ boxId: string; row: MailRow }>();
	const [composer, setComposer] = useState<OpenComposer>();
	const [adminMode, setAdminMode] = useState<"connect" | "access">();
	const [notice, setNotice] = useState("");
	const [oauthIssue, setOauthIssue] = useState("");
	const [desktopAlerts, setDesktopAlerts] =
		useMailNotificationPreference(userId);
	const checkedOauth = useRef(false);
	const lastDates = useRef(new Map<string, number>());
	const list = useQuery({
		queryKey: ["mail", "list", userId],
		queryFn: ({ signal }) => mailService.list(signal),
		staleTime: 15_000,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	});
	const mailboxes = list.data?.mailboxes ?? [];
	const box = mailboxes.find((item) => item.id === selectedBox) ?? mailboxes[0];
	const boxId = box?.id ?? "";
	const admin = list.data?.admin === true;
	const stats = useQuery({
		queryKey: ["mail", "stats", userId],
		queryFn: ({ signal }) => mailService.stats(signal),
		enabled: Boolean(boxId),
		refetchInterval: 75_000,
		refetchIntervalInBackground: true,
		staleTime: 30_000,
		retry: false,
	});
	const labels = useQuery({
		queryKey: ["mail", "labels", boxId],
		queryFn: ({ signal }) => mailService.labels(boxId, signal),
		enabled: Boolean(boxId),
		staleTime: 60_000,
	});
	const pageToken = pages.at(-1) ?? "";
	const folder = useQuery({
		queryKey: ["mail", "folder", boxId, label, query, pageToken],
		queryFn: ({ signal }) =>
			mailService.folder(boxId, label, query, pageToken, signal),
		enabled: Boolean(boxId),
		staleTime: 25_000,
		gcTime: 45_000,
	});
	const resultRows = folder.data?.rows ?? [];
	const statusByMailbox = new Map(
		stats.data?.stats.map((status) => [status.id, status]),
	);
	const visibleMailboxes = mailboxes.filter((item) =>
		item.address.toLowerCase().includes(filter.trim().toLowerCase()),
	);
	const userLabels = (labels.data?.labels ?? [])
		.filter((item) => item.type === "user")
		.sort((a, b) => a.name.localeCompare(b.name));
	const selected =
		openRow?.boxId === boxId
			? (resultRows.find((item) => item.threadId === openRow.row.threadId) ??
				openRow.row)
			: undefined;
	const currentTitle =
		folders.find((item) => item.id === label)?.title ??
		categories.find(([id]) => id === label)?.[1] ??
		userLabels.find((item) => item.id === label)?.name ??
		"Письма";
	const isInbox = label === "INBOX" || label.startsWith("CATEGORY_");
	const reset = () => {
		setPages([""]);
		setOpenRow(undefined);
	};
	const changeFolder = (value: string) => {
		setLabel(value);
		reset();
	};
	const chooseBox = (value: string) => {
		setSelectedBox(value);
		setLabel("INBOX");
		setQuery("");
		setSearch("");
		reset();
	};
	const refreshFolder = (mailbox: string) => {
		void client.invalidateQueries({ queryKey: ["mail", "folder", mailbox] });
		void client.invalidateQueries({ queryKey: ["mail", "thread", mailbox] });
		void client.invalidateQueries({ queryKey: ["mail", "stats", userId] });
	};
	const createLabel = useMutation({
		mutationFn: ({ box, name }: { box: string; name: string }) =>
			mailService.createLabel(box, name),
		onSuccess: (created, { box }) => {
			const queryKey = ["mail", "labels", box];
			client.setQueryData<{ labels: MailLabel[] }>(queryKey, (current) => ({
				labels: [
					...(current?.labels ?? []).filter(({ id }) => id !== created.id),
					created,
				],
			}));
			void client.invalidateQueries({ queryKey });
		},
	});
	const threadAction = useMutation({
		mutationFn: (request: {
			id: string;
			box: string;
			action: string;
			label?: string;
			source?: string;
		}) =>
			mailService.change(
				request.box,
				request.id,
				request.action,
				request.label,
				request.source,
			),
		onSuccess: (_, request) => {
			const addLabel =
				request.action === "unread"
					? "UNREAD"
					: ["add-label", "move-label"].includes(request.action)
						? request.label
						: undefined;
			const removeLabel =
				request.action === "read"
					? "UNREAD"
					: request.action === "remove-label"
						? request.label
						: request.source;
			if (addLabel || removeLabel) {
				const updateLabels = (row: MailRow) => {
					if (row.threadId !== request.id) return row;
					const labels = row.labels.filter((id) => id !== removeLabel);
					if (addLabel && !labels.includes(addLabel)) labels.push(addLabel);
					return { ...row, labels };
				};
				const folders = client.getQueriesData<
					Awaited<ReturnType<typeof mailService.folder>>
				>({ queryKey: ["mail", "folder", request.box] });
				for (const [queryKey, folder] of folders) {
					if (!folder) continue;
					const folderLabel = String(queryKey[3]);
					const leavesFolder =
						folderLabel === removeLabel ||
						(removeLabel === "INBOX" && folderLabel.startsWith("CATEGORY_"));
					client.setQueryData(queryKey, {
						...folder,
						rows: leavesFolder
							? folder.rows.filter((row) => row.threadId !== request.id)
							: folder.rows.map(updateLabels),
					});
				}
				setOpenRow((current) =>
					current?.boxId === request.box
						? { ...current, row: updateLabels(current.row) }
						: current,
				);
			}
			refreshFolder(request.box);
			if (request.action === "move-label") setNotice("Письмо перемещено");
			if (
				[
					"archive",
					"trash",
					"untrash",
					"inbox",
					"spam",
					"unspam",
					"move-label",
				].includes(request.action)
			)
				setOpenRow((row) =>
					row?.row.threadId === request.id && request.box === row.boxId
						? undefined
						: row,
				);
		},
	});
	const openDraft = useMutation({
		mutationFn: ({ mailbox, id }: { mailbox: Mailbox; id: string }) =>
			mailService.draft(mailbox.id, id),
		onSuccess: ({ message, id }, { mailbox }) =>
			setComposer({
				box: mailbox,
				draft: {
					...emptyMailDraft,
					draftId: id,
					to: message.to,
					cc: message.cc,
					bcc: message.bcc,
					subject: message.subject,
					text: plainMailBody(message),
					threadId: message.inReplyTo ? message.threadId : undefined,
					replyId: message.inReplyTo ?? undefined,
					preservedAttachments: message.attachments.length > 0,
				},
			}),
	});
	const finish = useMutation({
		mutationFn: ({ code, state }: { code: string; state: string }) =>
			mailService.finish(code, state),
		onSuccess: (mailbox) => {
			client.setQueryData<Awaited<ReturnType<typeof mailService.list>>>(
				["mail", "list", userId],
				(current) =>
					current && {
						...current,
						mailboxes: [
							...current.mailboxes.filter(({ id }) => id !== mailbox.id),
							mailbox,
						],
					},
			);
			setSelectedBox(mailbox.id);
			setNotice(`Подключён ящик ${mailbox.address}`);
			void client.invalidateQueries({ queryKey: ["mail"] });
		},
	});
	useEffect(() => {
		if (checkedOauth.current || !userId) return;
		checkedOauth.current = true;
		const params = new URLSearchParams(window.location.hash.slice(1));
		const code = params.get("mail_code");
		if (!code && !params.has("mail_error")) return;
		window.history.replaceState(
			window.history.state,
			"",
			window.location.pathname,
		);
		const state = sessionStorage.getItem(oauthSessionKey);
		sessionStorage.removeItem(oauthSessionKey);
		if (!code || !state || state !== params.get("mail_state")) {
			setOauthIssue(
				"Подключение не завершено. Начните его ещё раз из SupportOS.",
			);
			return;
		}
		finish.mutate({ code, state });
	}, [userId, finish]);
	useEffect(() => {
		if (!stats.data) return;
		const arrivals: string[] = [];
		for (const status of stats.data.stats) {
			if (status.unread == null) continue;
			const previous = lastDates.current.get(status.id);
			const date = status.recentDate ?? 0;
			if (previous !== undefined && date > previous && status.unread > 0)
				arrivals.push(status.id);
			lastDates.current.set(status.id, Math.max(previous ?? 0, date));
		}
		if (!arrivals.length) return;
		const message =
			arrivals.length === 1
				? `Новая почта в ${list.data?.mailboxes.find(({ id }) => id === arrivals[0])?.address ?? "ящике"}`
				: `Новая почта в ${arrivals.length} ящиках`;
		setNotice(message);
		for (const mailbox of arrivals)
			void client.invalidateQueries({ queryKey: ["mail", "folder", mailbox] });
	}, [stats.data, client, list.data]);
	useEffect(() => {
		if (
			!selectedBox ||
			!list.data ||
			list.data.mailboxes.some(({ id }) => id === selectedBox)
		)
			return;
		setSelectedBox("");
		setOpenRow(undefined);
		setComposer(undefined);
		setPages([""]);
		setLabel("INBOX");
	}, [list.data, selectedBox]);
	const permissionsChanged = list.data ? box : undefined;
	const active = Boolean(permissionsChanged && selected);
	const moveSource = userLabels.some((item) => item.id === label)
		? label
		: selected?.labels.includes("INBOX")
			? "INBOX"
			: undefined;
	const onThread = (action: string, nextLabel?: string, source?: string) => {
		if (!selected || !box || threadAction.isPending) return;
		threadAction.mutate({
			id: selected.threadId,
			box: box.id,
			action,
			label: nextLabel,
			source,
		});
	};
	const operationError = finish.error ?? threadAction.error ?? openDraft.error;
	return (
		<section
			className="mail-workspace"
			aria-label="Почтовые ящики"
			data-thread={active}
		>
			<header className="mail-top">
				<div className="mail-title">
					<Mail size={20} aria-hidden="true" />
					<h1>Почта</h1>
				</div>
				<div className="mail-top-actions">
					{box && (
						<button
							type="button"
							className="mail-icon"
							title="Обновить письма"
							aria-label="Обновить письма"
							onClick={() => {
								void folder.refetch();
								void stats.refetch();
							}}
						>
							<RefreshCw size={17} />
						</button>
					)}
					{box && typeof Notification !== "undefined" && (
						<button
							type="button"
							className="mail-icon"
							aria-pressed={desktopAlerts}
							aria-label="Уведомления браузера"
							title="Уведомления браузера"
							onClick={async () => {
								if (desktopAlerts) {
									setDesktopAlerts(false);
									return;
								}
								try {
									const permission = await Notification.requestPermission();
									setDesktopAlerts(permission === "granted");
									if (permission !== "granted")
										setNotice(
											"Уведомления браузера отключены. Новые письма видны в разделе «Почта».",
										);
								} catch {
									setNotice(
										"Этот браузер показывает обновления в разделе «Почта».",
									);
								}
							}}
						>
							<Bell size={18} />
						</button>
					)}
					{admin && list.data?.configured && (
						<button
							type="button"
							className="mail-button"
							onClick={() => {
								setOauthIssue("");
								setAdminMode("connect");
							}}
						>
							<Plus size={15} /> Подключить Gmail
						</button>
					)}
				</div>
			</header>
			{notice && (
				<output className="mail-banner">
					<span>{notice}</span>
					<button
						type="button"
						className="mail-button"
						onClick={() => setNotice("")}
					>
						Закрыть
					</button>
				</output>
			)}
			{(oauthIssue || operationError) && (
				<p className="mail-banner mail-error" role="alert">
					{oauthIssue || operationError?.message}
				</p>
			)}
			{finish.isPending && (
				<output className="mail-banner">Подключаем Gmail…</output>
			)}
			{list.isPending ? (
				<p className="mail-empty">Загружаем доступные ящики…</p>
			) : list.error ? (
				<div className="mail-empty">
					<p role="alert" className="mail-error">
						{list.error.message}
					</p>
					<button
						type="button"
						className="mail-button"
						onClick={() => void list.refetch()}
					>
						Повторить
					</button>
				</div>
			) : !list.data?.configured ? (
				<div className="mail-empty">
					<Mail size={30} />
					<h2>Подключение Gmail ожидает настройки</h2>
					<p>
						{admin
							? "Добавьте настройки Google OAuth на сервере, чтобы подключать ящики."
							: "Администратор сможет выдать доступ после настройки почты."}
					</p>
				</div>
			) : !box ? (
				<div className="mail-empty">
					<Inbox size={30} />
					<h2>
						{admin
							? "Подключите первый рабочий ящик"
							: "Почтовые ящики пока недоступны"}
					</h2>
					<p>
						{admin
							? "Администратор проходит вход и проверку Google для каждого рабочего адреса."
							: "Доступ появится после назначения администратором."}
					</p>
					{admin && (
						<button
							type="button"
							className="mail-button"
							data-primary="true"
							onClick={() => setAdminMode("connect")}
						>
							Подключить Gmail
						</button>
					)}
				</div>
			) : (
				<div className="mail-grid">
					<aside
						className="mail-sidebar supportos-scroll"
						aria-label="Ящики и папки"
					>
						<button
							type="button"
							className="mail-button mail-compose-trigger"
							data-primary="true"
							onClick={() => setComposer({ box, draft: emptyMailDraft })}
						>
							<Pencil size={15} /> Написать
						</button>
						<label className="mail-field mail-account-picker">
							Почтовый ящик
							<select
								value={boxId}
								onChange={(event) => chooseBox(event.target.value)}
							>
								{mailboxes.map((item) => (
									<option key={item.id} value={item.id}>
										{item.address}
										{statusByMailbox.get(item.id)?.unread
											? ` (${statusByMailbox.get(item.id)?.unread})`
											: ""}
									</option>
								))}
							</select>
						</label>
						<div className="mail-account-list">
							<label className="mail-search">
								<Search size={14} />
								<input
									aria-label="Найти ящик"
									placeholder="Найти ящик"
									value={filter}
									onChange={(event) => setFilter(event.target.value)}
								/>
							</label>
							<ul className="supportos-scroll">
								{visibleMailboxes.map((item) => {
									const status = statusByMailbox.get(item.id);
									return (
										<li key={item.id}>
											<button
												type="button"
												className="mail-nav"
												aria-pressed={boxId === item.id}
												onClick={() => chooseBox(item.id)}
											>
												<span>{item.address}</span>
												{status?.reconnect ? (
													<ShieldAlert
														size={13}
														aria-label="Нужно переподключить"
													/>
												) : status?.unread ? (
													<b>{status.unread}</b>
												) : null}
											</button>
										</li>
									);
								})}
							</ul>
						</div>
						{admin && (
							<button
								type="button"
								className="mail-button"
								onClick={() => setAdminMode("access")}
							>
								<Users size={14} /> Доступ к ящику
							</button>
						)}
						{admin && statusByMailbox.get(boxId)?.reconnect && (
							<button
								type="button"
								className="mail-button"
								onClick={() => setAdminMode("connect")}
							>
								Переподключить ящик
							</button>
						)}
						<nav aria-label="Папки Gmail" className="mail-folders">
							{folders.map(({ id, title, icon: Icon }) => (
								<button
									type="button"
									key={id}
									className="mail-nav"
									aria-pressed={id === "INBOX" ? isInbox : id === label}
									onClick={() => changeFolder(id)}
								>
									<Icon size={15} aria-hidden="true" />
									<span>{title}</span>
								</button>
							))}
							<h3>Ярлыки</h3>
							{userLabels.map((item) => (
								<button
									type="button"
									key={item.id}
									className="mail-nav"
									aria-pressed={item.id === label}
									onClick={() => changeFolder(item.id)}
								>
									<Tag size={14} aria-hidden="true" />
									<span>{item.name}</span>
								</button>
							))}
						</nav>
						<div className="mail-sidebar-labels">
							<MailLabelCreator
								key={box.id}
								create={(name) =>
									createLabel.mutateAsync({ box: box.id, name })
								}
							/>
						</div>
					</aside>
					<section className="mail-list" aria-label="Список писем">
						<header className="mail-list-header">
							<div>
								<h2>{currentTitle}</h2>
								<p>{box.address}</p>
							</div>
							<form
								className="mail-search"
								onSubmit={(event) => {
									event.preventDefault();
									setQuery(search.trim());
									reset();
								}}
							>
								<Search size={15} />
								<input
									aria-label="Поиск в выбранной папке"
									placeholder="Поиск по письмам"
									maxLength={300}
									value={search}
									onChange={(event) => {
										setSearch(event.target.value);
										if (!event.target.value && query) {
											setQuery("");
											reset();
										}
									}}
								/>
								<button type="submit" className="mail-icon" aria-label="Найти">
									<ChevronRight size={16} />
								</button>
							</form>
						</header>
						{isInbox && (
							<nav
								className="mail-categories supportos-scroll"
								aria-label="Категории входящих"
							>
								{categories.map(([id, title]) => (
									<button
										key={id}
										type="button"
										className="mail-button"
										aria-pressed={id === label}
										onClick={() => changeFolder(id)}
									>
										{title}
									</button>
								))}
							</nav>
						)}
						<div className="mail-list-scroll supportos-scroll">
							{folder.isPending ? (
								<p className="mail-empty">Загружаем письма…</p>
							) : folder.error && !folder.data ? (
								<div className="mail-empty">
									<p role="alert" className="mail-error">
										{folder.error.message}
									</p>
									<button
										type="button"
										className="mail-button"
										onClick={() => void folder.refetch()}
									>
										Повторить
									</button>
									{admin && (
										<button
											type="button"
											className="mail-button"
											onClick={() => setAdminMode("connect")}
										>
											Переподключить ящик
										</button>
									)}
								</div>
							) : resultRows.length === 0 ? (
								<p className="mail-empty">
									{query
										? "Письма по запросу не найдены"
										: "Здесь пока нет писем"}
								</p>
							) : (
								<ul>
									{resultRows.map((row) => {
										const applied = userLabels.filter(
											({ id }) => id !== label && row.labels.includes(id),
										);
										return (
											<li key={row.draftId ?? row.id}>
												<button
													type="button"
													className="mail-row"
													data-unread={row.labels.includes("UNREAD")}
													aria-pressed={row.threadId === selected?.threadId}
													onClick={() => {
														if (row.draftId) {
															if (!openDraft.isPending)
																openDraft.mutate({
																	mailbox: box,
																	id: row.draftId,
																});
															return;
														}
														setOpenRow({ boxId: box.id, row });
														if (
															row.labels.includes("UNREAD") &&
															!threadAction.isPending
														)
															threadAction.mutate({
																box: box.id,
																id: row.threadId,
																action: "read",
															});
													}}
												>
													<span className="mail-row-top">
														<span>
															{label === "SENT" || label === "DRAFT"
																? row.to || "Без адресата"
																: row.from || "Без отправителя"}
														</span>
														<time>{mailDate(row.date)}</time>
													</span>
													<span className="mail-row-details">
														<span className="mail-row-subject">
															{row.labels.includes("STARRED") && (
																<Star
																	size={12}
																	fill="currentColor"
																	aria-label="Помечено"
																/>
															)}
															{row.subject || "Без темы"}
															{row.count > 1 && <small>{row.count}</small>}
														</span>
														{row.labels.includes("UNREAD") && (
															<span className="mail-row-unread">
																Непрочитано
															</span>
														)}
													</span>
													<span className="mail-row-preview">
														{row.snippet}
													</span>
													{applied.length > 0 && (
														<span className="mail-row-tags">
															{applied.slice(0, 2).map(({ id, name }) => (
																<span
																	key={id}
																	className="mail-tag"
																	title={name}
																>
																	{name}
																</span>
															))}
															{applied.length > 2 && (
																<span className="mail-tag">
																	+{applied.length - 2}
																</span>
															)}
														</span>
													)}
												</button>
											</li>
										);
									})}
								</ul>
							)}
						</div>
						{(folder.data?.next || pages.length > 1) && (
							<footer className="mail-pagination">
								<span>Страница {pages.length}</span>
								<button
									type="button"
									className="mail-icon"
									aria-label="Предыдущая страница"
									disabled={pages.length === 1}
									onClick={() => {
										setPages(pages.slice(0, -1));
										setOpenRow(undefined);
									}}
								>
									<ChevronLeft size={17} />
								</button>
								<button
									type="button"
									className="mail-icon"
									aria-label="Следующая страница"
									disabled={!folder.data?.next}
									onClick={() => {
										if (folder.data?.next)
											setPages([...pages, folder.data.next]);
										setOpenRow(undefined);
									}}
								>
									<ChevronRight size={17} />
								</button>
							</footer>
						)}
					</section>
					{selected ? (
						<MailThread
							key={`${boxId}-${selected.threadId}`}
							box={boxId}
							address={box.address}
							row={selected}
							onBack={() => setOpenRow(undefined)}
							onCompose={(draft) => setComposer({ box, draft })}
							organizer={
								<MailLabelControls
									labels={userLabels}
									applied={selected.labels}
									source={moveSource}
									disabled={threadAction.isPending}
									canMove={
										!selected.labels.some(
											(id) => id === "TRASH" || id === "SPAM",
										) &&
										label !== "TRASH" &&
										label !== "SPAM"
									}
									onToggle={(id) =>
										onThread(
											selected.labels.includes(id)
												? "remove-label"
												: "add-label",
											id,
										)
									}
									onMove={(id) => onThread("move-label", id, moveSource)}
									onCreate={(name) =>
										createLabel.mutateAsync({ box: box.id, name })
									}
								/>
							}
							toolbar={
								<div className="mail-thread-actions">
									<button
										type="button"
										className="mail-icon"
										aria-label={
											selected.labels.includes("STARRED")
												? "Снять отметку"
												: "Пометить письмо"
										}
										title="Отметка"
										disabled={threadAction.isPending}
										onClick={() =>
											onThread(
												selected.labels.includes("STARRED") ? "unstar" : "star",
											)
										}
									>
										<Star
											size={16}
											fill={
												selected.labels.includes("STARRED")
													? "currentColor"
													: "none"
											}
										/>
									</button>
									<select
										aria-label="Действия с перепиской"
										value=""
										disabled={threadAction.isPending}
										onChange={(event) => {
											const action = event.target.value;
											if (action) onThread(action);
										}}
									>
										<option value="">Действия</option>
										<option
											value={
												selected.labels.includes("UNREAD") ? "read" : "unread"
											}
										>
											{selected.labels.includes("UNREAD")
												? "Отметить прочитанным"
												: "Отметить непрочитанным"}
										</option>
										{label === "TRASH" ? (
											<option value="untrash">Восстановить из корзины</option>
										) : (
											<>
												<option
													value={
														selected.labels.includes("INBOX")
															? "archive"
															: "inbox"
													}
												>
													{selected.labels.includes("INBOX")
														? "В архив"
														: "Во входящие"}
												</option>
												<option value="trash">В корзину</option>
											</>
										)}
										<option value={label === "SPAM" ? "unspam" : "spam"}>
											{label === "SPAM" ? "Не спам" : "В спам"}
										</option>
									</select>
								</div>
							}
						/>
					) : (
						<div className="mail-empty mail-thread-placeholder">
							<Mail size={32} />
							<h2>Выберите письмо</h2>
							<p>Здесь откроется переписка.</p>
						</div>
					)}
				</div>
			)}
			{adminMode && admin && (
				<MailAdministration
					box={box}
					mode={adminMode}
					onClose={() => setAdminMode(undefined)}
				/>
			)}
			{composer && mailboxes.some(({ id }) => composer.box.id === id) && (
				<MailComposer
					key={`${userId ?? ""}:${composer.box.id}`}
					box={composer.box}
					userId={userId}
					draft={composer.draft}
					onClose={() => setComposer(undefined)}
					onDone={(message) => {
						setNotice(message);
						refreshFolder(composer.box.id);
						setComposer(undefined);
					}}
				/>
			)}
		</section>
	);
}
