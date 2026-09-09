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
	const [allAgents, setAllAgents] = useState(true);
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
	const filtered = (data?.agents ?? []).filter(
		(agent) =>
			agent.name.toLowerCase().includes(search.toLowerCase()) &&
			(allAgents ||
				data?.assignments.some(
					(a) => a.agent_id === agent.id && a.shift === shift,
				)) &&
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
	const history = mergedHistory
		.filter(
			(event) =>
				event.changed &&
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
				"Дата смены",
				"Смена GMT+3",
				"Принимает, мин",
				"Выключен, мин",
				"Не в сети, мин",
				"Нет данных, мин",
			],
			...totals.map((row) => [
				row.agent.name,
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
						<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
							{(["on", "off", "offline", "unknown"] as const).map((status) => (
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
								placeholder="Поиск агента…"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							<select
								aria-label="Текущий статус"
								className={control}
								value={statusFilter}
								onChange={(e) => setStatusFilter(e.target.value)}
							>
								<option value="all">Все статусы</option>
								{Object.entries(labels).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
							<label className="text-sm">
								<input
									type="checkbox"
									checked={allAgents}
									onChange={(e) => setAllAgents(e.target.checked)}
								/>{" "}
								Все агенты, включая неназначенных
							</label>
							<button
								className={control}
								type="button"
								onClick={() => setManage(!manage)}
							>
								<Users size={16} className="inline" /> Назначить смены
							</button>
						</div>
						{manage && (
							<section className="rounded-xl border border-border bg-surface p-4">
								<h2 className="font-semibold">Расписание на {day}</h2>
								<p className="mt-1 text-xs text-muted">
									Назначение влияет только на отчёты SupportOS. Приём чатов в
									LiveChat не изменяется.
								</p>
								<div className="mt-3 max-h-80 overflow-auto">
									{data.agents.map((agent) => (
										<div
											key={agent.id}
											className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
										>
											<span>{agent.name}</span>
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
						<section className="overflow-auto rounded-xl border border-border bg-surface">
							<table className="w-full text-left text-sm">
								<thead className="border-b border-border text-muted">
									<tr>
										{[
											"Агент / сейчас",
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
												<div
													className={`mt-1 text-xs ${colors[currentStatus(row.agent, now)]}`}
												>
													{labels[currentStatus(row.agent, now)]}
												</div>
												<div className="mt-1 text-xs text-muted">
													Проверен: {stamp(row.agent.observed_at)}
												</div>
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
									Агенты не найдены. Проверьте фильтры, назначения и подключение
									LiveChat.
								</p>
							)}
						</section>
						<section className="rounded-xl border border-border bg-surface p-4">
							<h2 className="font-semibold">Журнал смены · {history.length}</h2>
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
								переключения. Повторные подтверждения одинакового статуса
								скрыты.
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
												{labels[event.status]}
											</span>
											<p className="mt-1 text-xs text-muted">
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
