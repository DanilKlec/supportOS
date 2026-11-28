import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Archive,
	Bell,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	FileText,
	Inbox,
	Mail,
	Pencil,
	RefreshCw,
	Search,
	Send,
	ShieldAlert,
	Star,
	Trash2,
	UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type Mailbox,
	type MailDraft,
	type MailLabel,
	type MailLabelChanges,
	type MailLabelColor,
	type MailRow,
	mailService,
} from "@/services/mail.service";
import { useAuthStore } from "@/store/auth.store";
import { MailAccountPicker } from "./MailAccountPicker";
import { emptyMailDraft, MailComposer } from "./MailComposer";
import { MailFolderCount, MailLabelChip } from "./MailFolderTree";
import { MailFolderNavigation, MailLabelControls } from "./MailLabelControls";
import { useMailNotificationPreference } from "./MailNotifications";
import { MailProjectFolders, useMailProjects } from "./MailProjectFolders";
import { MailThread, mailDate, plainMailBody } from "./MailThread";
import { MailThreadActions } from "./MailThreadActions";
import "./mail.css";
import "./mail-projects.css";

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
const virtualCountIds = "ALL,SNOOZED";
const systemCountIds = folders
	.map(({ id }) => id)
	.filter((id) => id !== "ALL" && id !== "SNOOZED")
	.join(",");

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
	const navigate = useNavigate();
	const destination = useRouterState({
		select: (state) => state.location.state.workspaceSearch,
	});
	const [selectedBox, setSelectedBox] = useState(() => {
		return destination && "mailboxId" in destination
			? destination.mailboxId
			: "";
	});
	const [showMoreFolders, setShowMoreFolders] = useState(false);
	const [projectId, setProjectId] = useState<string | null>(null);
	const [label, setLabel] = useState("INBOX");
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");
	const [pages, setPages] = useState<string[]>([""]);
	const [openRow, setOpenRow] = useState<{ boxId: string; row: MailRow }>();
	const [composer, setComposer] = useState<OpenComposer>();
	const [notice, setNotice] = useState("");
	const [desktopAlerts, setDesktopAlerts] =
		useMailNotificationPreference(userId);
	const lastDates = useRef(new Map<string, number>());
	const list = useQuery({
		queryKey: ["mail", "list", userId],
		queryFn: ({ signal }) => mailService.list(signal),
		staleTime: 15_000,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	});
	const mailboxes = list.data?.mailboxes ?? [];
	const projects = useMailProjects(mailboxes);
	const project = projects.folders.find(({ id }) => id === projectId);
	const projectScope = project?.id ?? (projectId === "" && projects.folders.length && projects.groups.has("") ? "" : null);
	const scopedMailboxes =
		projectScope === null
			? mailboxes
			: (projects.groups.get(projectScope) ?? []);
	const box =
		scopedMailboxes.find((item) => item.id === selectedBox) ??
		scopedMailboxes[0];
	const boxId = box?.id ?? "";
	const admin = list.data?.admin === true;
	const canManageFolders = list.data?.canManageFolders === true;
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
	const stats = useQuery({
		queryKey: ["mail", "stats", userId],
		queryFn: ({ signal }) => mailService.stats(signal),
		enabled: Boolean(boxId && folder.isFetched),
		refetchInterval: 75_000,
		refetchIntervalInBackground: true,
		staleTime: 30_000,
		retry: false,
	});
	const resultRows = folder.data?.rows ?? [];
	const statusByMailbox = new Map(
		stats.data?.stats.map((status) => [status.id, status]),
	);
	const customLabels = useMemo(
		() =>
			(labels.data?.labels ?? [])
				.filter((item) => item.type === "user")
				.sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true })),
		[labels.data],
	);
	const countGroups = useMemo(() => {
		const ids = customLabels.map(({ id }) => id).sort();
		const groups = [systemCountIds, virtualCountIds];
		for (let start = 0; start < ids.length; start += 24)
			groups.push(ids.slice(start, start + 24).join(","));
		return groups;
	}, [customLabels]);
	const folderCounts = useQueries({
		queries: boxId
			? countGroups.map((ids) => ({
					queryKey: ["mail", "folder-counts", boxId, ids],
					queryFn: ({ signal }: { signal: AbortSignal }) =>
						mailService.folderCounts(boxId, ids, signal),
					enabled: folder.isFetched,
					staleTime: 15_000,
					refetchInterval: 30_000,
				}))
			: [],
		combine: (responses) => {
			const counts: Record<string, number | null> = {};
			for (const response of responses)
				Object.assign(counts, response.data?.counts);
			return counts;
		},
	});
	const selected =
		openRow?.boxId === boxId
			? (resultRows.find((item) => item.threadId === openRow.row.threadId) ??
				openRow.row)
			: undefined;
	const customIds = new Set(customLabels.map(({ id }) => id));
	const colorIds = [
		...new Set([
			label,
			...(selected?.labels ?? []),
			...resultRows.flatMap((row) =>
				row.labels
					.filter((id) => id !== label && customIds.has(id))
					.slice(0, 2),
			),
			...customLabels.map(({ id }) => id),
		]),
	]
		.filter((id) => customIds.has(id))
		.slice(0, 32)
		.sort()
		.join(",");
	const colors = useQuery({
		queryKey: ["mail", "label-colors", boxId, colorIds],
		queryFn: ({ signal }) => mailService.labelColors(boxId, colorIds, signal),
		enabled: Boolean(boxId && folder.isFetched && colorIds),
		staleTime: 4 * 60_000,
		retry: false,
	});
	const userLabels = useMemo(
		() =>
			customLabels.map((label) => ({
				...label,
				color: colors.data?.colors[label.id] ?? label.color,
			})),
		[customLabels, colors.data],
	);
	const currentTitle =
		folders.find((item) => item.id === label)?.title ??
		categories.find(([id]) => id === label)?.[1] ??
		userLabels.find((item) => item.id === label)?.name ??
		"Письма";
	const isInbox = label === "INBOX" || label.startsWith("CATEGORY_");
	const activeExtraFolder = folders.slice(5).some(({ id }) => id === label);
	const reset = useCallback(() => {
		setPages([""]);
		setOpenRow(undefined);
	}, []);
	const changeFolder = (value: string) => {
		setLabel(value);
		reset();
	};
	const chooseBox = useCallback(
		(value: string) => {
			setSelectedBox(value);
			setLabel("INBOX");
			setQuery("");
			setSearch("");
			reset();
		},
		[reset],
	);
	useEffect(() => {
		if (!destination || !("mailboxId" in destination)) return;
		setProjectId(null);
		chooseBox(destination.mailboxId);
		void navigate({
			to: "/mail",
			replace: true,
			state: (previous) => ({ ...previous, workspaceSearch: undefined }),
		});
	}, [destination, chooseBox, navigate]);
	const chooseProject = (id: string | null) => {
		setProjectId(id);
		chooseBox(boxId);
	};
	const refreshFolder = (mailbox: string) => {
		void client.invalidateQueries({ queryKey: ["mail", "folder", mailbox] });
		void client.invalidateQueries({ queryKey: ["mail", "thread", mailbox] });
		void client.invalidateQueries({ queryKey: ["mail", "stats", userId] });
		void client.invalidateQueries({
			queryKey: ["mail", "folder-counts", mailbox],
		});
	};
	const updateLabelCache = (box: string, changed: MailLabel) => {
		const queryKey = ["mail", "labels", box];
		const colorKey = ["mail", "label-colors", box];
		client.setQueryData<{ labels: MailLabel[] }>(queryKey, (current) => ({
			labels: [
				...(current?.labels ?? []).filter(({ id }) => id !== changed.id),
				changed,
			],
		}));
		if (changed.color) {
			client.setQueriesData<
				Awaited<ReturnType<typeof mailService.labelColors>>
			>(
				{ queryKey: colorKey },
				(current) =>
					current && {
						colors: { ...current.colors, [changed.id]: changed.color ?? null },
					},
			);
		}
		void client.invalidateQueries({ queryKey: colorKey });
	};
	const createLabel = useMutation({
		mutationFn: ({
			box,
			name,
			color,
		}: {
			box: string;
			name: string;
			color?: MailLabelColor;
		}) => mailService.createLabel(box, name, color),
		onSuccess: (created, { box }) => updateLabelCache(box, created),
	});
	const updateColor = useMutation({
		mutationFn: ({
			box,
			id,
			color,
		}: {
			box: string;
			id: string;
			color: MailLabelColor;
		}) => mailService.setLabelColor(box, id, color),
		onSuccess: (edited, { box }) => updateLabelCache(box, edited),
	});
	const threadAction = useMutation({
		mutationFn: (request: {
			id: string;
			box: string;
			action: string;
			label?: string;
			source?: string;
			labels?: MailLabelChanges;
		}) =>
			mailService.change(
				request.box,
				request.id,
				request.action,
				request.label,
				request.source,
				request.labels,
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
			const add = request.labels?.add ?? (addLabel ? [addLabel] : []);
			const remove = new Set(
				request.labels?.remove ?? (removeLabel ? [removeLabel] : []),
			);
			if (add.length || remove.size) {
				const updateLabels = (row: MailRow) => {
					if (row.threadId !== request.id) return row;
					return {
						...row,
						labels: [
							...new Set([
								...row.labels.filter((id) => !remove.has(id)),
								...add,
							]),
						],
					};
				};
				const folders = client.getQueriesData<
					Awaited<ReturnType<typeof mailService.folder>>
				>({ queryKey: ["mail", "folder", request.box] });
				for (const [queryKey, folder] of folders) {
					if (!folder) continue;
					const folderLabel = String(queryKey[3]);
					const leavesFolder =
						remove.has(folderLabel) ||
						(remove.has("INBOX") && folderLabel.startsWith("CATEGORY_"));
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
					html: message.html || undefined,
					threadId: message.inReplyTo ? message.threadId : undefined,
					replyId: message.inReplyTo ?? undefined,
					preservedAttachments: message.attachments.length > 0,
				},
			}),
	});
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
	const onThread = (action: string) => {
		if (!selected || !box || threadAction.isPending) return;
		threadAction.mutate({
			id: selected.threadId,
			box: box.id,
			action,
		});
	};
	const pickerAction = threadAction.variables?.action;
	const operationError =
		(pickerAction === "set-labels" || pickerAction === "move-label"
			? undefined
			: threadAction.error) ?? openDraft.error;
	return (
		<section
			className="mail-workspace"
			aria-label="Почтовые ящики"
			data-thread={active}
		>
			<header className="mail-top">
				<div className="mail-title">
					<span className="mail-title-icon">
						<Mail size={20} aria-hidden="true" />
					</span>
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
								void client.invalidateQueries({
									queryKey: ["mail", "folder-counts", boxId],
								});
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
			{operationError && (
				<p className="mail-banner mail-error" role="alert">
					{operationError.message}
				</p>
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
							? "Настройки подключения находятся в разделе «Администрирование»."
							: "Администратор сможет выдать доступ после настройки почты."}
					</p>
					{admin && (
						<Link to="/admin" hash="mailboxes" className="mail-button">
							Управление ящиками
						</Link>
					)}
				</div>
			) : !mailboxes.length ? (
				<div className="mail-empty">
					<Inbox size={30} />
					<h2>
						{admin
							? "Подключите первый рабочий ящик"
							: "Почтовые ящики пока недоступны"}
					</h2>
					<p>
						{admin
							? "Подключите Gmail в разделе «Администрирование»."
							: "Доступ появится после назначения администратором."}
					</p>
					{admin && (
						<Link
							to="/admin"
							hash="mailboxes"
							className="mail-button"
							data-primary="true"
						>
							Управление ящиками
						</Link>
					)}
				</div>
			) : (
				<div className="mail-grid">
					<MailProjectFolders
						canManage={canManageFolders}
						key={userId}
						projects={projects}
						selected={projectScope}
						mailboxes={mailboxes}
						statusByMailbox={statusByMailbox}
						onSelect={chooseProject}
					/>
					<div className="mail-navigation">
						<MailAccountPicker
							key={projectScope === null ? "all" : `project:${projectScope}`}
							active={box}
							mailboxes={scopedMailboxes}
							statusByMailbox={statusByMailbox}
							onChange={chooseBox}
						/>
						{box && (
							<aside
								className="mail-sidebar supportos-scroll"
								aria-label="Папки и действия ящика"
							>
								<button
									type="button"
									className="mail-button mail-compose-trigger"
									data-primary="true"
									onClick={() => setComposer({ box, draft: emptyMailDraft })}
								>
									<Pencil size={15} /> Написать
								</button>
								{admin && statusByMailbox.get(boxId)?.reconnect && (
									<Link to="/admin" hash="mailboxes" className="mail-button">
										Переподключение ящика
									</Link>
								)}
								<nav
									aria-label="Папки Gmail"
									className="mail-folders"
									data-show-extra={showMoreFolders || activeExtraFolder}
								>
									{folders.map(({ id, title, icon: Icon }, index) => (
										<button
											type="button"
											key={id}
											className="mail-nav"
											data-extra={index >= 5}
											aria-pressed={id === "INBOX" ? isInbox : id === label}
											onClick={() => changeFolder(id)}
										>
											<Icon size={15} aria-hidden="true" />
											<span>{title}</span>
											<MailFolderCount
												count={
													folderCounts[id] ??
													(id === "INBOX"
														? statusByMailbox.get(boxId)?.unread
														: undefined)
												}
												drafts={id === "DRAFT"}
											/>
										</button>
									))}
									<button
										type="button"
										className="mail-nav mail-system-more"
										aria-expanded={showMoreFolders || activeExtraFolder}
										onClick={() => setShowMoreFolders((shown) => !shown)}
										hidden={activeExtraFolder}
									>
										<ChevronDown size={14} aria-hidden="true" />
										<span>
											{showMoreFolders ? "Свернуть" : "Ещё папки Gmail"}
										</span>
									</button>
								</nav>
								<MailFolderNavigation
									canManage={canManageFolders}
									key={box.id}
									labels={userLabels}
									active={label}
									loading={labels.isPending}
									error={labels.isError}
									counts={folderCounts}
									onSelect={changeFolder}
									onCreate={(name, color) =>
										createLabel.mutateAsync({ box: box.id, name, color })
									}
									onEdit={async (id, name, color) => {
										const edited = await mailService.editLabel(box.id, id, name, color);
										updateLabelCache(box.id, edited);
										void client.invalidateQueries({ queryKey: ["mail", "labels", box.id] });
									}}
									onDelete={async (id) => {
										await mailService.deleteLabel(box.id, id);
										if (label === id) changeFolder("INBOX");
										const queryKey = ["mail", "labels", box.id];
										client.setQueryData<{ labels: MailLabel[] }>(queryKey, (current) =>
											current && { labels: current.labels.filter((item) => item.id !== id) });
										void client.invalidateQueries({ queryKey });
										refreshFolder(box.id);
									}}
								/>
							</aside>
						)}
					</div>
					{box && (
						<section className="mail-list" aria-label="Список писем">
							<header className="mail-list-header">
								<div>
									<h2>{currentTitle}</h2>
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
									<button
										type="submit"
										className="mail-icon"
										aria-label="Найти"
									>
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
											className="mail-category"
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
											<Link
												to="/admin"
												hash="mailboxes"
												className="mail-button"
											>
												Управление ящиками
											</Link>
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
														{row.staffSender && (
															<span
																className="mail-staff-sender"
																title={`Отправил: ${row.staffSender}`}
															>
																<UserRound size={12} aria-hidden="true" />
																<span>Отправил: {row.staffSender}</span>
															</span>
														)}
														{applied.length > 0 && (
															<span className="mail-row-tags">
																{applied.slice(0, 2).map((label) => (
																	<MailLabelChip key={label.id} label={label} />
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
					)}
					{box &&
						(selected ? (
							<MailThread
								key={`${boxId}-${selected.threadId}`}
								box={boxId}
								address={box.address}
								row={selected}
								onBack={() => setOpenRow(undefined)}
								onCompose={(draft) => setComposer({ box, draft })}
								organizer={
									<MailLabelControls
										canManage={canManageFolders}
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
										onApply={(labels) =>
											threadAction.mutateAsync({
												box: boxId,
												id: selected.threadId,
												action: "set-labels",
												labels,
											})
										}
										onMove={(label) =>
											threadAction.mutateAsync({
												box: boxId,
												id: selected.threadId,
												action: "move-label",
												label,
												source: moveSource,
											})
										}
										onCreate={(name, color) =>
											createLabel.mutateAsync({ box: box.id, name, color })
										}
										onColor={(id, color) =>
											updateColor.mutateAsync({ box: boxId, id, color })
										}
									/>
								}
								toolbar={
									<MailThreadActions
										labels={selected.labels}
										folder={label}
										busy={threadAction.isPending}
										onAction={onThread}
									/>
								}
							/>
						) : (
							<div className="mail-empty mail-thread-placeholder">
								<span className="mail-empty-icon">
									<Mail size={23} aria-hidden="true" />
								</span>
								<h2>Выберите письмо</h2>
							</div>
						))}
					{!box && (
						<div className="mail-empty mail-empty-project">
							<Inbox size={26} aria-hidden="true" />
							<h2>В папке нет доступных ящиков</h2>
							<button
								type="button"
								className="mail-button"
								onClick={() => chooseProject(null)}
							>
								Все ящики
							</button>
						</div>
					)}
				</div>
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
