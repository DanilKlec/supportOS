import { useQuery } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	Columns3,
	Eye,
	EyeOff,
	LoaderCircle,
	RefreshCw,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
	chatwootService,
	type ActiveChatFilters,
	type ActiveChatMode,
	type ActiveChatRow,
	type ActiveChatSort,
	type ChatwootAgent,
	type ChatwootInbox,
	type ChatwootTeam,
} from "@/services/chatwoot.service";
import { useChatPopover } from "./useChatPopover";

const filtersDefault: ActiveChatFilters = {
	mode: "all",
	sort: "last_activity_at_desc",
	page: 1,
	inbox: "",
	agent: "",
	team: "",
	label: "",
	priority: "",
	search: "",
};
const tabs: { id: ActiveChatMode; title: string }[] = [
	{ id: "all", title: "Все активные" },
	{ id: "open", title: "Открытые" },
	{ id: "pending", title: "Ожидают" },
	{ id: "watching", title: "Наблюдаемые" },
];
const priorities = {
	low: "Низкий",
	medium: "Средний",
	high: "Высокий",
	urgent: "Срочный",
};
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
});
const countries = new Intl.DisplayNames("ru", { type: "region" });
const action =
	"inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:border-accent/40 hover:bg-accent/10 disabled:opacity-50";
const field =
	"h-8 min-w-0 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-accent";

function duration(value: number | undefined, now: number) {
	if (!value) return "—";
	const minutes = Math.floor(Math.max(0, now - value) / 60000);
	if (!minutes) return "< 1 мин";
	if (minutes < 60) return `${minutes} мин`;
	const hours = Math.floor(minutes / 60);
	return hours < 24
		? `${hours} ч ${minutes % 60} мин`
		: `${Math.floor(hours / 24)} д ${hours % 24} ч`;
}

function location(row: ActiveChatRow) {
	const code = row.country;
	const country =
		code && /^[A-Z]{2}$/i.test(code) ? countries.of(code.toUpperCase()) : code;
	return [country, row.region, row.city].filter(Boolean).join(" · ");
}

function activity(row: ActiveChatRow) {
	if (row.status === "resolved")
		return { label: "Завершён", color: "bg-zinc-500" };
	if (row.status === "snoozed")
		return { label: "Отложен", color: "bg-violet-400" };
	if (!row.agent) return { label: "Без агента", color: "bg-amber-400" };
	if (row.status === "pending")
		return { label: "Ожидает", color: "bg-amber-400" };
	return { label: "Открыт", color: "bg-emerald-400" };
}

const optionalColumns = [
	{ key: "location", title: "Локация" },
	{ key: "device", title: "Устройство" },
	{ key: "referrer", title: "Откуда пришёл" },
	{ key: "lastPage", title: "Последняя страница" },
	{ key: "visits", title: "Визиты" },
	{ key: "tags", title: "Теги" },
] as const;
type Extra = (typeof optionalColumns)[number]["key"];
const primaryColumns = [
	["player", "Игрок"],
	["email", "Email"],
	["actions", "Действие"],
	["status", "Статус"],
	["agent", "Агент"],
	["project", "Проект"],
] as const;

export function ActiveChatsTable({
	agents,
	inboxes,
	teams,
	labels,
	realtime,
	selectedId,
	watched,
	watchingError,
	changingId,
	onOpen,
	onStop,
}: {
	agents: ChatwootAgent[];
	inboxes: ChatwootInbox[];
	teams: ChatwootTeam[];
	labels: string[];
	realtime: boolean;
	selectedId: number | null;
	watched: ReadonlySet<number>;
	watchingError?: string;
	changingId?: number;
	onOpen: (id: number) => void;
	onStop: (id: number) => void;
}) {
	const [filters, setFilters] = useState(filtersDefault);
	const [search, setSearch] = useState("");
	const [filterOpen, setFilterOpen] = useState(false);
	const [columnsOpen, setColumnsOpen] = useState(false);
	const columns = useChatPopover<HTMLDivElement>(columnsOpen, () =>
		setColumnsOpen(false),
	);
	const [extra, setExtra] = useState<Set<Extra>>(
		() => new Set(["location", "device", "tags"]),
	);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 15000);
		return () => window.clearInterval(timer);
	}, []);
	useEffect(() => {
		const timer = window.setTimeout(
			() =>
				setFilters((current) =>
					current.search === search.trim()
						? current
						: { ...current, search: search.trim(), page: 1 },
				),
			300,
		);
		return () => window.clearTimeout(timer);
	}, [search]);
	const query = useQuery({
		queryKey: ["chatwoot", "active-overview", filters],
		queryFn: ({ signal }) => chatwootService.activeOverview(filters, signal),
		refetchInterval: realtime ? 12000 : 5000,
	});
	const update = <Key extends keyof ActiveChatFilters>(
		key: Key,
		value: ActiveChatFilters[Key],
	) =>
		setFilters((current) => ({
			...current,
			[key]: value,
			page: key === "page" ? Number(value) : 1,
		}));
	const toggleColumn = (key: Extra) =>
		setExtra((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	const projects = new Map(inboxes.map((item) => [item.id, item.name]));
	const rows = query.data?.rows ?? [];
	const showPagination = filters.page > 1 || query.data?.hasMore === true;
	useEffect(() => {
		if (query.data && query.data.rows.length === 0 && filters.page > 1)
			setFilters((current) => ({
				...current,
				page: Math.max(1, current.page - 1),
			}));
	}, [query.data, filters.page]);
	const visibleExtras = optionalColumns.filter((column) =>
		extra.has(column.key),
	);
	const filterCount = [
		filters.inbox,
		filters.agent,
		filters.team,
		filters.label,
		filters.priority,
	].filter(Boolean).length;
	const header = (
		title: string,
		ascending: ActiveChatSort,
		descending: ActiveChatSort,
	) => (
		<button
			type="button"
			className="inline-flex items-center gap-1 hover:text-foreground"
			onClick={() =>
				update("sort", filters.sort === descending ? ascending : descending)
			}
		>
			{title}{" "}
			{filters.sort === ascending ? (
				<ArrowUp size={11} />
			) : filters.sort === descending ? (
				<ArrowDown size={11} />
			) : null}
		</button>
	);
	const cell = (field: string, value?: ReactNode, title?: string) => (
		<td
			data-field={field}
			className="max-w-48 truncate px-3 py-2 text-muted"
			title={title}
		>
			{value ?? "—"}
		</td>
	);
	return (
		<section
			aria-label="Активные чаты команды"
			data-observing={selectedId !== null}
			className="chat-active flex min-h-0 min-w-0 flex-1 flex-col bg-background"
		>
			<div className="chat-active-tabs flex shrink-0 items-center gap-1 border-b border-border px-3">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => update("mode", tab.id)}
						aria-pressed={filters.mode === tab.id}
						className={`flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-xs font-medium ${filters.mode === tab.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}
					>
						{tab.id === "watching" && <Eye size={13} />}
						{tab.id === "all" ? (
							<>
								<span className="chat-active-all-wide">{tab.title}</span>
								<span className="chat-active-all-compact">Все</span>
							</>
						) : (
							tab.title
						)}
						{tab.id === "watching" ? (
							<span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px]">
								{watched.size}
							</span>
						) : filters.mode === tab.id && query.data?.total != null ? (
							<span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px]">
								{query.data.total}
							</span>
						) : null}
					</button>
				))}
			</div>
			<div className="chat-active-tools relative z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2 sm:p-3">
				<label className="chat-active-search relative min-w-0 basis-full sm:max-w-xs sm:flex-1">
					<Search
						size={14}
						className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
					/>
					<input
						aria-label="Поиск игрока, почты или номера"
						value={search}
						maxLength={120}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Игрок, email или #номер чата"
						className={`${field} w-full pl-8`}
					/>
				</label>
				<button
					type="button"
					aria-expanded={filterOpen}
					onClick={() => setFilterOpen(!filterOpen)}
					className={action}
				>
					<SlidersHorizontal size={13} /> Фильтры
					{filterCount ? ` · ${filterCount}` : ""}
				</button>
				<select
					aria-label="Сортировка активных чатов"
					value={filters.sort}
					onChange={(event) =>
						update("sort", event.target.value as ActiveChatSort)
					}
					className={field}
				>
					<option value="last_activity_at_desc">Недавняя активность</option>
					<option value="last_activity_at_asc">Давняя активность</option>
					<option value="created_at_asc">Старые диалоги</option>
					<option value="created_at_desc">Новые диалоги</option>
					<option value="waiting_since_asc">Дольше ждут ответа</option>
					<option value="priority_desc">По приоритету</option>
				</select>
				<div className="chat-active-tool-actions ml-auto flex items-center gap-1.5">
					<div ref={columns} className="chat-active-columns relative">
						<button
							type="button"
							aria-expanded={columnsOpen}
							onClick={() => setColumnsOpen(!columnsOpen)}
							className={action}
						>
							<Columns3 size={14} /> Колонки
						</button>
						{columnsOpen && (
							<div className="absolute right-0 top-9 z-30 min-w-44 space-y-1 rounded-xl border border-border bg-surface p-2 shadow-xl">
								{optionalColumns.map((column) => (
									<label
										key={column.key}
										className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-elevated"
									>
										<input
											type="checkbox"
											checked={extra.has(column.key)}
											onChange={() => toggleColumn(column.key)}
										/>
										{column.title}
									</label>
								))}
							</div>
						)}
					</div>
					<button
						type="button"
						aria-label="Обновить активные чаты"
						disabled={query.isFetching}
						onClick={() => void query.refetch()}
						className={action}
					>
						<RefreshCw size={13} />
					</button>
				</div>
				{filterOpen && (
					<div className="chat-active-filter-fields flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
						<select
							aria-label="Проект"
							value={filters.inbox}
							onChange={(event) => update("inbox", event.target.value)}
							className={field}
						>
							<option value="">Все проекты</option>
							{inboxes.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
						<select
							aria-label="Агент"
							value={filters.agent}
							onChange={(event) => update("agent", event.target.value)}
							className={field}
						>
							<option value="">Все агенты</option>
							{agents.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
						<select
							aria-label="Команда"
							value={filters.team}
							onChange={(event) => update("team", event.target.value)}
							className={field}
						>
							<option value="">Все команды</option>
							{teams.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name}
								</option>
							))}
						</select>
						<select
							aria-label="Тег"
							value={filters.label}
							onChange={(event) => update("label", event.target.value)}
							className={field}
						>
							<option value="">Все теги</option>
							{labels.map((item) => (
								<option key={item} value={item}>
									{item}
								</option>
							))}
						</select>
						<select
							aria-label="Приоритет"
							value={filters.priority}
							onChange={(event) => update("priority", event.target.value)}
							className={field}
						>
							<option value="">Все приоритеты</option>
							{Object.entries(priorities).map(([key, title]) => (
								<option key={key} value={key}>
									{title}
								</option>
							))}
						</select>
						<button
							type="button"
							className={action}
							onClick={() => {
								setFilters({ ...filtersDefault, mode: filters.mode });
								setSearch("");
							}}
						>
							Сбросить
						</button>
					</div>
				)}
			</div>
			{watchingError && (
				<p
					role="alert"
					className="shrink-0 border-b border-red-500/20 px-3 py-2 text-xs chat-text-danger"
				>
					{watchingError}
				</p>
			)}
			{query.data?.searchTruncated && (
				<p className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-muted">
					Найдено много совпадений. Уточните имя или email.
				</p>
			)}
			<div className="chat-active-scroll supportos-scroll min-h-0 flex-1 overflow-auto">
				<table
					aria-label="Список активных диалогов"
					className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-xs"
				>
					<thead className="sticky top-0 z-10 bg-surface text-[11px] font-medium text-muted">
						<tr>
							{primaryColumns.map(([key, title]) => (
								<th
									key={key}
									data-field={key}
									scope="col"
									className="border-b border-border px-3 py-2 font-medium"
								>
									{title}
								</th>
							))}
							<th
								scope="col"
								data-field="duration"
								aria-sort={
									filters.sort === "created_at_desc"
										? "ascending"
										: filters.sort === "created_at_asc"
											? "descending"
											: undefined
								}
								className="border-b border-border px-3 py-2 font-medium"
							>
								{header("В чате", "created_at_desc", "created_at_asc")}
							</th>
							<th
								scope="col"
								data-field="updated"
								aria-sort={
									filters.sort === "last_activity_at_asc"
										? "ascending"
										: filters.sort === "last_activity_at_desc"
											? "descending"
											: undefined
								}
								className="border-b border-border px-3 py-2 font-medium"
							>
								{header(
									"Активность",
									"last_activity_at_asc",
									"last_activity_at_desc",
								)}
							</th>
							{visibleExtras.map((column) => (
								<th
									key={column.key}
									data-field="extra"
									scope="col"
									className="border-b border-border px-3 py-2 font-medium"
								>
									{column.title}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="[&>tr>td]:border-b [&>tr>td]:border-border/65">
						{query.isPending ? (
							<tr>
								<td
									colSpan={8 + visibleExtras.length}
									className="p-10 text-center text-muted"
								>
									<LoaderCircle
										size={15}
										className="mr-2 inline animate-spin"
									/>
									Загружаем чаты…
								</td>
							</tr>
						) : query.isError && !rows.length ? (
							<tr>
								<td
									colSpan={8 + visibleExtras.length}
									className="p-8 text-center chat-text-danger"
								>
									<div role="alert" className="space-y-2">
										<p>{query.error.message}</p>
										<button
											type="button"
											className={action}
											onClick={() => void query.refetch()}
										>
											Повторить
										</button>
									</div>
								</td>
							</tr>
						) : !rows.length ? (
							<tr>
								<td
									colSpan={8 + visibleExtras.length}
									className="p-10 text-center text-muted"
								>
									{filters.mode === "watching"
										? "Нет наблюдаемых диалогов по выбранным условиям"
										: "Чатов по выбранным условиям не найдено"}
								</td>
							</tr>
						) : (
							rows.map((row) => {
								const state = activity(row);
								const player = row.player || `Диалог #${row.id}`;
								const project =
									row.project ?? projects.get(row.inboxId ?? 0) ?? "—";
								const alreadyWatched = watched.has(row.id);
								return (
									<tr
										key={row.id}
										data-chat-row
										data-active={selectedId === row.id}
										className="hover:bg-surface/65"
									>
										<td data-field="player" className="px-3 py-2">
											<div className="flex items-center gap-2">
												<span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
													{player.trim().slice(0, 1).toUpperCase()}
												</span>
												<div className="min-w-0 leading-tight">
													<div
														className="max-w-36 truncate font-medium"
														title={player}
													>
														{player}
													</div>
													<span className="text-[10px] text-muted">
														#{row.id}
													</span>
												</div>
											</div>
										</td>
										{cell("email", row.email, row.email)}
										<td
											data-field="actions"
											className="whitespace-nowrap px-3 py-2"
										>
											<button
												type="button"
												aria-label={
													alreadyWatched ? "Открыть наблюдение" : "Наблюдать"
												}
												disabled={!alreadyWatched && changingId !== undefined}
												className={`${action} chat-watch-action`}
												onClick={() => onOpen(row.id)}
											>
												{changingId === row.id && !alreadyWatched ? (
													<LoaderCircle size={13} className="animate-spin" />
												) : (
													<Eye size={13} />
												)}
												{alreadyWatched ? "Наблюдение" : "Наблюдать"}
											</button>
											{alreadyWatched && (
												<button
													type="button"
													disabled={changingId !== undefined}
													title="Прекратить наблюдение"
													aria-label={`Прекратить наблюдение за #${row.id}`}
													className={`${action} ml-1 px-1.5`}
													onClick={() => onStop(row.id)}
												>
													<EyeOff size={13} />
												</button>
											)}
										</td>
										<td
											data-field="status"
											className="whitespace-nowrap px-3 py-2"
										>
											<span className="inline-flex items-center gap-1.5">
												<span
													className={`size-1.5 rounded-full ${state.color}`}
												/>
												{state.label}
											</span>
											{row.priority && (
												<div className="pl-3 text-[10px] text-muted">
													{priorities[row.priority]}
												</div>
											)}
										</td>
										<td
											data-field="agent"
											className="max-w-36 truncate px-3 py-2"
											title={[row.agent, row.team].filter(Boolean).join(" · ")}
										>
											{row.agent ?? "—"}
											{row.team && (
												<div className="truncate text-[10px] text-muted">
													{row.team}
												</div>
											)}
										</td>
										{cell("project", project, project)}
										{cell(
											"duration",
											row.status === "resolved"
												? "—"
												: duration(row.startedAt, now),
										)}
										<td
											data-field="updated"
											className="whitespace-nowrap px-3 py-2 text-muted"
										>
											{row.activityAt ? dateFormat.format(row.activityAt) : "—"}
											{row.waitingSince && row.status !== "resolved" && (
												<div className="text-[10px] chat-text-warning">
													Ждёт {duration(row.waitingSince, now)}
												</div>
											)}
										</td>
										{visibleExtras.map(({ key }) => {
											const value =
												key === "location"
													? location(row)
													: key === "tags"
														? row.tags.join(", ")
														: row[key];
											return (
												<td
													key={key}
													data-field="extra"
													className="max-w-48 truncate px-3 py-2 text-muted"
													title={String(value ?? "")}
												>
													{value === "" || value == null ? "—" : value}
												</td>
											);
										})}
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
			{(showPagination || query.data?.total != null) && (
				<footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
					<span>
						{showPagination && `Страница ${filters.page}`}
						{showPagination && query.data?.total != null && " · "}
						{query.data?.total != null && `Найдено ${query.data.total}`}
					</span>
					{showPagination && (
						<div className="flex gap-1.5">
							<button
								type="button"
								className={action}
								disabled={filters.page <= 1 || query.isFetching}
								onClick={() => update("page", filters.page - 1)}
							>
								Назад
							</button>
							<button
								type="button"
								className={action}
								disabled={!query.data?.hasMore || query.isFetching}
								onClick={() => update("page", filters.page + 1)}
							>
								Дальше
							</button>
						</div>
					)}
				</footer>
			)}
		</section>
	);
}
