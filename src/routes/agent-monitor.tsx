import { ScheduleUpload } from "@/features/agent-monitor/ScheduleUpload";
import {
	matchesRoster,
	type RosterScope,
} from "@/features/agent-monitor/schedule";
import {
	agentEmail,
	isOnline,
	matchesAgent,
	statusEvents,
} from "@/features/agent-monitor/analytics";
import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	Download,
	LogOut,
	RefreshCw,
	ShieldCheck,
	Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	csvCell,
	currentShift,
	currentStatus,
	labels,
	type MonitorData,
	type Observation,
	type RoutingStatus,
	workDay,
} from "@/features/agent-monitor/live-model";
import {
	bounds,
	duration,
	type ShiftId,
	shifts,
	zone,
} from "@/features/agent-monitor/model";

export const Route = createFileRoute("/agent-monitor")({
	component: AgentMonitor,
});
const control =
	"rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-40";
const colors: Record<RoutingStatus, string> = {
	on: "text-emerald-500",
	off: "text-amber-500",
	offline: "text-muted",
	unknown: "text-red-400",
};
async function api<T = MonitorData>(
	action: string,
	day: string,
	body?: unknown,
	signal?: AbortSignal,
) {
	const response = await authenticatedFetch(
		`/api/agent-monitor?action=${action}&day=${day}`,
		{
			method: body === undefined ? "GET" : "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal,
		},
	);
	const text = await response.text();
	let result: T & { error?: string };
	try {
		result = JSON.parse(text);
	} catch {
		throw new Error("API мониторинга недоступен. Проверьте серверный деплой.");
	}
	if (!response.ok)
		throw Object.assign(new Error(result.error ?? "Ошибка запроса"), {
			status: response.status,
		});
	return result;
}
const stamp = (at: string | number | null) =>
	at
		? new Intl.DateTimeFormat("ru", {
				timeZone: zone,
				day: "2-digit",
				month: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			}).format(new Date(at))
		: "—";
function AgentMonitor() {
	const client = useQueryClient();
	const userId = useAuthStore((state) => state.session?.user.id);
	const [day, setDay] = useState(() => workDay());
	const dayRef = useRef(day);
	dayRef.current = day;
	const [shift, setShift] = useState<ShiftId>(() => currentShift());
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [sortBy, setSortBy] = useState("off");
	const [eventFilter, setEventFilter] = useState("all");
	const [selectedAgent, setSelectedAgent] = useState("all");
	const [rosterScope, setRosterScope] = useState<RosterScope>("current");
	const [manage, setManage] = useState(false);
	const [now, setNow] = useState(Date.now);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState("");
	const [syncError, setSyncError] = useState("");
	const [older, setOlder] = useState<Observation[]>([]);
	const [historyEnded, setHistoryEnded] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset paginated history whenever the selected day changes.
	useEffect(() => {
		setOlder([]);
		setHistoryEnded(false);
	}, [day, userId]);
	const query = useQuery<MonitorData, Error & { status?: number }>({
		queryKey: ["monitor", userId, day],
		queryFn: ({ signal }) => api("data", day, undefined, signal),
		retry: false,
		refetchInterval: 10000,
		refetchOnWindowFocus: true,
	});
	const authenticated =
		Boolean(query.data) &&
		query.error?.status !== 401 &&
		query.error?.status !== 403;
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		if (!authenticated) return;
		const abort = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const sync = async () => {
			try {
				await api("sync", day, {}, abort.signal);
				if (!abort.signal.aborted) {
					setSyncError("");
					void client.invalidateQueries({ queryKey: ["monitor"] });
				}
			} catch (error) {
				if (!abort.signal.aborted)
					setSyncError(
						error instanceof Error ? error.message : "Нет связи с LiveChat",
					);
			}
			if (!abort.signal.aborted) timer = setTimeout(sync, 30000);
		};
		void sync();
		return () => {
			abort.abort();
			clearTimeout(timer);
		};
	}, [authenticated, day, client]);
	async function act(action: string, body: unknown) {
		setBusy(true);
		setNotice("");
		try {
			if (action === "logout") {
				await supabaseService.signOut();
				client.removeQueries({ queryKey: ["monitor"] });
				return;
			}
			await api(action, day, body);
			if (action === "logout") client.removeQueries({ queryKey: ["monitor"] });
			await client.invalidateQueries({ queryKey: ["monitor"] });
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Ошибка запроса");
		} finally {
			setBusy(false);
		}
	}
	const data = authenticated ? query.data : undefined;
	const range = bounds(day, shift);
	const online = (data?.agents ?? []).filter((agent) => isOnline(agent, now));
	const currentAssignments =
		data?.currentAssignments ??
		(day === workDay(now) ? (data?.assignments ?? []) : []);
	const filtered = online.filter(
		(agent) =>
			matchesAgent(agent, search) &&
			matchesRoster(
				agent.id,
				rosterScope,
				currentAssignments,
				data?.assignments ?? [],
				shift,
				now,
			) &&
			(statusFilter === "all" || currentStatus(agent, now) === statusFilter),
	);
	const totals = filtered.map((agent) => {
		const total = data?.totals.find(
			(item) => item.agent_id === agent.id && item.shift === shift,
		);
		return {
			agent,
			on: Number(total?.on_ms ?? 0),
			off: Number(total?.off_ms ?? 0),
			offline: Number(total?.offline_ms ?? 0),
			unknown: Number(total?.unknown_ms ?? 0),
		};
	});
	totals.sort((a, b) =>
		sortBy === "name"
			? a.agent.name.localeCompare(b.agent.name)
			: sortBy === "changed"
				? Date.parse(b.agent.changed_at ?? "1970-01-01") -
					Date.parse(a.agent.changed_at ?? "1970-01-01")
				: b.off - a.off || a.agent.name.localeCompare(b.agent.name),
	);
	const mergedHistory = Array.from(
		new Map(
			[...(data?.observations ?? []), ...older].map((item) => [item.id, item]),
		).values(),
	);
	async function loadOlder() {
		if (!mergedHistory.length) return;
		const requestedDay = day;
		setBusy(true);
		try {
			const result = await api<{
				observations: Observation[];
				hasMore: boolean;
			}>(
				`history&before=${Math.min(...mergedHistory.map((item) => item.id))}`,
				day,
			);
			if (dayRef.current !== requestedDay) return;
			setOlder((previous) => [...previous, ...result.observations]);
			setHistoryEnded(!result.hasMore);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Ошибка журнала");
		} finally {
			setBusy(false);
		}
	}
	const history = statusEvents(mergedHistory)
		.filter(
			(event) =>
				event.changed &&
				(selectedAgent === "all" || selectedAgent === event.agent_id) &&
				(eventFilter === "all" ||
					(event.toggle && event.status === eventFilter)) &&
				filtered.some((agent) => agent.id === event.agent_id) &&
				Date.parse(event.at) >= range.start &&
				Date.parse(event.at) < range.end,
		)
		.slice()
		.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id);
	function exportCsv() {
		const rows = [
			[
				"Агент",
				"Email / ID",
				"Дата смены",
				"Смена GMT+3",
				"Принимает, мин",
				"Выключен, мин",
				"Не в сети, мин",
				"Нет данных, мин",
			],
			...totals.map((row) => [
				row.agent.name,
				row.agent.id,
				day,
				shifts.find((s) => s.id === shift)?.time,
				...(["on", "off", "offline", "unknown"] as const).map((status) =>
					Math.floor(row[status] / 60000),
				),
			]),
		];
		const url = URL.createObjectURL(
			new Blob(
				[`\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`],
				{ type: "text/csv;charset=utf-8" },
			),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = `agents-${day}-${shift}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	return (
		<div className="h-full overflow-auto bg-background p-4 text-foreground md:p-6">
			<div className="mx-auto max-w-7xl space-y-5">
				<header className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
							<Activity size={16} /> LiveChat · Команда
						</div>
						<h1 className="mt-2 text-2xl font-semibold">
							Контроль приёма чатов
						</h1>
						<p className="mt-2 text-sm text-muted">
							{stamp(now)} · GMT+3, без сезонного перевода часов
						</p>
					</div>
					{data && (
						<div className="flex gap-2">
							<button
								type="button"
								disabled={busy}
								className={control}
								onClick={() => void act("sync", {})}
							>
								<RefreshCw size={16} className="inline" /> Обновить
							</button>
							<button
								type="button"
								disabled={busy}
								className={control}
								onClick={() => void act("logout", {})}
							>
								<LogOut size={16} className="inline" /> Выйти из мониторинга
							</button>
						</div>
					)}
				</header>
				{(notice || query.error || syncError) && (
					<div
						role="alert"
						className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm"
					>
						{notice || syncError || query.error?.message}
					</div>
				)}
				{!data ? (
					<section className="mx-auto max-w-md rounded-xl border border-border bg-surface p-6">
						<ShieldCheck className="text-accent" />
						<h2 className="mt-3 text-lg font-semibold">Доступ руководителя</h2>
						<p className="mt-2 text-sm text-muted">
							Доступ проверяется по вашему личному аккаунту SupportOS. Если прав
							нет, обратитесь к администратору.
						</p>
						<p className="mt-4 text-sm text-muted">
							{query.isPending
								? "Проверка доступа…"
								: "После выдачи роли обновите страницу."}
						</p>
					</section>
				) : (
					<>
						<ScheduleUpload
							agents={data.agents}
							onSave={async (payload) => {
								await api("schedule-import", `${payload.month}-01`, payload);
								await client.invalidateQueries({ queryKey: ["monitor"] });
							}}
						/>
						<div
							className={`rounded-xl border p-4 text-sm ${data.lastSync && now - Date.parse(data.lastSync) < 90000 && !syncError ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}
						>
							Последний успешный опрос LiveChat API: {stamp(data.lastSync)}.
							Обновление статусов каждые 30 секунд, журнала — каждые 10 секунд.{" "}
							<span className="block">
								Последний принятый webhook: {stamp(data.lastWebhook ?? null)}.
								Отсутствие новых событий не подтверждает и не опровергает связь.
							</span>
							{(!data.lastSync || now - Date.parse(data.lastSync) >= 90000) &&
								"Нет свежего подтверждения связи."}
						</div>
						<div className="grid grid-cols-2 gap-3">
							{(["on", "off"] as const).map((status) => (
								<div
									key={status}
									className="rounded-xl border border-border bg-surface p-4"
								>
									<p className={`text-sm ${colors[status]}`}>
										{labels[status]} · сейчас
									</p>
									<p className="mt-2 text-3xl font-semibold">
										{
											data.agents.filter(
												(agent) => currentStatus(agent, now) === status,
											).length
										}
									</p>
								</div>
							))}
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<label className="text-sm">
								Дата начала смены{" "}
								<input
									aria-label="Дата начала смены"
									type="date"
									className={control}
									value={day}
									onChange={(e) => {
										if (e.target.value) setDay(e.target.value);
									}}
								/>
							</label>
							<button
								className={control}
								type="button"
								onClick={() => {
									setDay(workDay());
									setShift(currentShift());
								}}
							>
								Текущая смена
							</button>
							<button className={control} type="button" onClick={exportCsv}>
								<Download size={16} className="inline" /> CSV отчёт
							</button>
						</div>
						<div className="grid gap-3 md:grid-cols-3">
							{shifts.map((item) => (
								<button
									type="button"
									key={item.id}
									aria-pressed={shift === item.id}
									onClick={() => setShift(item.id)}
									className={`rounded-xl border p-4 text-left ${shift === item.id ? "border-accent bg-accent/10" : "border-border bg-surface"}`}
								>
									<div className="font-semibold">{item.label}</div>
									<p className="mt-1 text-sm text-muted">{item.time}</p>
								</button>
							))}
						</div>
						<p className="text-xs text-muted">
							Дневная и вечерняя смены пересекаются с 16:00 до 16:30. Ночная
							относится к дате начала. В сводке учитывается только прошедшее
							время; пробелы наблюдения более 90 секунд отмечаются «Нет данных».
						</p>
						<div className="flex flex-wrap items-center gap-3">
							<input
								aria-label="Поиск агента"
								className={control}
								placeholder="Имя или почта агента…"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							<select
								aria-label="Текущий статус"
								className={control}
								value={statusFilter}
								onChange={(e) => setStatusFilter(e.target.value)}
							>
								<option value="all">Все онлайн</option>
								{Object.entries(labels)
									.filter(([value]) => value === "on" || value === "off")
									.map(([value, label]) => (
										<option key={value} value={value}>
											{label}
										</option>
									))}
							</select>
							<label className="text-sm">
								Состав списка{" "}
								<select
									aria-label="Состав списка"
									className={control}
									value={rosterScope}
									onChange={(e) =>
										setRosterScope(e.target.value as RosterScope)
									}
								>
									<option value="current">Сейчас на смене и онлайн</option>
									<option value="selected">
										По графику выбранной смены и онлайн
									</option>
									<option value="online">Все онлайн</option>
								</select>
							</label>
							<button
								className={control}
								type="button"
								onClick={() => setManage(!manage)}
							>
								<Users size={16} className="inline" /> Назначить смены
							</button>
						</div>
						<div className="flex items-center gap-3 text-sm">
							<label htmlFor="agent-sort">Порядок в аналитике</label>
							<select
								id="agent-sort"
								aria-label="Сортировка агентов"
								className={control}
								value={sortBy}
								onChange={(e) => setSortBy(e.target.value)}
							>
								<option value="off">Дольше выключен за смену</option>
								<option value="changed">Последние изменения</option>
								<option value="name">По имени</option>
							</select>
						</div>
						{rosterScope !== "online" && (
							<p className="text-xs text-muted">
								График проверяется в GMT+3. Ночная смена относится к дате
								начала; с 16:00 до 16:30 учитываются обе смены.{" "}
								{rosterScope === "current" && !currentAssignments.length
									? "На текущую дату назначений нет: загрузите график или выберите «Все онлайн»."
									: ""}
							</p>
						)}
						{manage && (
							<section className="rounded-xl border border-border bg-surface p-4">
								<h2 className="font-semibold">Расписание на {day}</h2>
								<p className="mt-1 text-xs text-muted">
									Назначение влияет только на отчёты SupportOS. Приём чатов в
									LiveChat не изменяется.
								</p>
								<div className="mt-3 max-h-80 overflow-auto">
									{online
										.filter((agent) => matchesAgent(agent, search))
										.map((agent) => (
											<div
												key={agent.id}
												className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
											>
												<span>
													{agent.name}
													<small className="block text-muted">
														{agentEmail(agent) || `ID: ${agent.id}`}
													</small>
												</span>
												<div className="flex flex-wrap gap-3">
													{shifts.map((s) => (
														<label className="text-sm" key={s.id}>
															<input
																type="checkbox"
																disabled={busy}
																checked={data.assignments.some(
																	(a) =>
																		a.agent_id === agent.id && a.shift === s.id,
																)}
																onChange={(e) =>
																	void act("assignment", {
																		agentId: agent.id,
																		shift: s.id,
																		enabled: e.target.checked,
																	})
																}
															/>{" "}
															{s.label}
														</label>
													))}
												</div>
											</div>
										))}
								</div>
							</section>
						)}
						<section className="rounded-xl border border-border bg-surface p-4">
							<h2 className="font-semibold">
								Аналитика выбранной смены · {filtered.length} агентов
							</h2>
							<div className="mt-3 grid gap-4 sm:grid-cols-2">
								<div>
									<p className="text-sm text-muted">Приём включён, суммарно</p>
									<p className="mt-1 text-2xl font-semibold text-emerald-500">
										{duration(totals.reduce((sum, row) => sum + row.on, 0))}
									</p>
								</div>
								<div>
									<p className="text-sm text-muted">Приём выключен, суммарно</p>
									<p className="mt-1 text-2xl font-semibold text-amber-500">
										{duration(totals.reduce((sum, row) => sum + row.off, 0))}
									</p>
								</div>
							</div>
							<p className="mt-3 text-xs text-muted">
								Состав списка:{" "}
								{rosterScope === "current"
									? "сейчас на смене по графику"
									: rosterScope === "selected"
										? "назначены на выбранную смену"
										: "все онлайн"}
								. Приём включён или выключен. Не в сети и без свежего статуса
								скрыты. Длительности — за выбранную смену.
							</p>
						</section>
						<section className="overflow-auto rounded-xl border border-border bg-surface">
							<table className="w-full text-left text-sm">
								<thead className="border-b border-border text-muted">
									<tr>
										{[
											"Агент / сейчас",
											"Последнее изменение",
											"Приём включён",
											"Выключен",
											"Не в сети",
											"Нет данных",
											"Назначен",
										].map((label) => (
											<th className="p-4 font-medium" key={label}>
												{label}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{totals.map((row) => (
										<tr key={row.agent.id} className="border-b border-border">
											<td className="p-4">
												<div className="font-semibold">{row.agent.name}</div>
												<div className="mt-1 text-xs text-muted">
													{agentEmail(row.agent) || `ID: ${row.agent.id}`}
												</div>
												<div
													className={`mt-1 text-xs ${colors[currentStatus(row.agent, now)]}`}
												>
													{labels[currentStatus(row.agent, now)]}
												</div>
												<div className="mt-1 text-xs text-muted">
													Проверен: {stamp(row.agent.observed_at)}
												</div>
											</td>
											<td className="p-4 whitespace-nowrap">
												{stamp(row.agent.changed_at)}
												<span className="block text-xs text-muted">
													Статус наблюдается{" "}
													{row.agent.changed_at
														? duration(
																Math.max(
																	0,
																	now - Date.parse(row.agent.changed_at),
																),
															)
														: "—"}
												</span>
											</td>
											{(["on", "off", "offline", "unknown"] as const).map(
												(status) => (
													<td className="p-4" key={status}>
														{duration(row[status])}
													</td>
												),
											)}
											<td className="p-4">
												{data.assignments.some(
													(a) =>
														a.agent_id === row.agent.id && a.shift === shift,
												)
													? "Да"
													: "Нет"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
							{!filtered.length && (
								<p className="p-8 text-center text-muted">
									Нет агентов по выбранным фильтрам. Проверьте график и
									подключение LiveChat.
								</p>
							)}
						</section>
						<section className="rounded-xl border border-border bg-surface p-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<h2 className="font-semibold">
									Журнал приёма чатов · {history.length}
								</h2>
								<div className="flex flex-wrap gap-2">
									<select
										aria-label="Агент в журнале"
										className={control}
										value={selectedAgent}
										onChange={(e) => setSelectedAgent(e.target.value)}
									>
										<option value="all">Все агенты в списке</option>
										{filtered.map((agent) => (
											<option key={agent.id} value={agent.id}>
												{agent.name} · {agent.id}
											</option>
										))}
									</select>
									<select
										aria-label="События журнала"
										className={control}
										value={eventFilter}
										onChange={(e) => setEventFilter(e.target.value)}
									>
										<option value="all">Все события</option>
										<option value="off">Только выключения</option>
										<option value="on">Только включения</option>
									</select>
								</div>
							</div>
							{data.historyLimited && !historyEnded && (
								<button
									className={`${control} mt-2`}
									type="button"
									disabled={busy}
									onClick={() => void loadOlder()}
								>
									Загрузить более ранние события
								</button>
							)}
							<p className="mt-1 text-xs text-muted">
								Время — момент получения webhook или обнаружения статуса
								опросом. LiveChat не сообщает здесь автора и причину
								переключения. Показаны события агентов выбранного состава
								списка. Первое доступное наблюдение не считается переключением.
								Повторные подтверждения одинакового статуса скрыты.
							</p>
							<div className="mt-4 max-h-96 divide-y divide-border overflow-auto">
								{history.map((event) => (
									<div
										key={event.id}
										className="flex flex-wrap justify-between gap-2 py-3 text-sm"
									>
										<div>
											{data.agents.find((a) => a.id === event.agent_id)?.name ??
												event.agent_id}{" "}
											·{" "}
											<span className={colors[event.status]}>
												{event.action}
											</span>
											<p className="mt-1 text-xs text-muted">
												{event.previous
													? `${labels[event.previous]} → ${labels[event.status]}`
													: labels[event.status]}{" "}
												· {event.agent_id}
												<br />
												{event.source === "webhook"
													? "Webhook LiveChat"
													: "Обнаружено опросом LiveChat"}
											</p>
										</div>
										<time>{stamp(event.at)}</time>
									</div>
								))}
								{!history.length && (
									<p className="py-6 text-sm text-muted">
										Изменений за выбранный интервал нет.
									</p>
								)}
							</div>
						</section>
						<details className="rounded-xl border border-border bg-surface p-4">
							<summary className="cursor-pointer text-sm font-semibold">
								История назначений · {data.audit.length}
							</summary>
							{data.audit.map((item) => (
								<p key={item.id} className="mt-3 text-xs text-muted">
									{stamp(item.at)} ·{" "}
									{data.agents.find((a) => a.id === item.agent_id)?.name ??
										item.agent_id}{" "}
									· {shifts.find((s) => s.id === item.shift)?.label} ·{" "}
									{item.operation === "assigned" ? "Назначен" : "Снят"} ·{" "}
									{item.actor}
								</p>
							))}
						</details>
					</>
				)}
			</div>
		</div>
	);
}
