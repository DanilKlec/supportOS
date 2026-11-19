import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, Headphones, ListFilter, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { chatwootService, type ChatwootAgent, type ChatwootInbox, type ChatwootOperations } from "@/services/chatwoot.service";

const field = "h-9 min-w-0 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus-visible:outline-accent";
const button = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs hover:bg-surface-elevated disabled:opacity-50";
const days = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const zones = ["Europe/Bucharest", "Europe/London", "Europe/Berlin", "Europe/Athens", "UTC"];
const duration = (seconds: number) => `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
type AgentRule = ChatwootOperations["agents"][number];
type InboxRule = ChatwootOperations["inboxes"][number];
const fallbackAgent: AgentRule = { skills: [], zone: "Europe/Bucharest", shifts: [] };
const fallbackInbox: InboxRule = { skills: [], responseMinutes: 0, crm: "" };
const skills = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export function ChatOperationsPage({ agents, inboxes, canEdit, onOpen }: {
	agents: ChatwootAgent[];
	inboxes: ChatwootInbox[];
	canEdit: boolean;
	onOpen: (id: number) => void;
}) {
	const [tab, setTab] = useState<"overview" | "shifts" | "projects">("overview");
	const [projectFilter, setProjectFilter] = useState(0);
	const client = useQueryClient();
	const snapshot = useQuery({
		queryKey: ["chatwoot", "supervisor"], queryFn: chatwootService.supervisor,
		enabled: tab === "overview", refetchInterval: 15000,
	});
	const settings = useQuery({
		queryKey: ["chatwoot", "operations"], queryFn: chatwootService.operations,
		enabled: tab !== "overview" && canEdit,
	});
	const save = useMutation({
		mutationFn: chatwootService.saveOperations,
		onSuccess: (next) => {
			client.setQueryData(["chatwoot", "operations"], next);
			void client.invalidateQueries({ queryKey: ["chatwoot", "supervisor"] });
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversation"] });
		},
	});
	const [selected, setSelected] = useState(0);
	const data = snapshot.data;
	const activeId = selected || (tab === "shifts" ? agents[0]?.id : inboxes[0]?.id);
	const projects = new Map(inboxes.map((item) => [item.id, item.name]));
	const names = new Map(agents.map((item) => [item.id, item.name]));
	const sla = data?.sla.filter((row) => !projectFilter || row.inboxId === projectFilter) ?? [];
	const selectTab = (next: typeof tab) => { setTab(next); setSelected(0); save.reset(); };
	return (
		<section aria-label="Управление работой чатов" className="chat-secondary-workspace supportos-scroll min-h-0 min-w-0 flex-1 overflow-auto p-2.5 sm:p-6">
			<div className="mx-auto max-w-6xl space-y-4">
				<header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:items-center">
					<div role="group" aria-label="Разделы руководителя" className="chat-menu-tabs flex w-fit max-w-full flex-wrap">
						<button type="button" aria-pressed={tab === "overview"} onClick={() => selectTab("overview")}>Обзор</button>
						{canEdit && <>
							<button type="button" aria-pressed={tab === "shifts"} onClick={() => selectTab("shifts")}>Смены и навыки</button>
							<button type="button" aria-pressed={tab === "projects"} onClick={() => selectTab("projects")}>Проекты и SLA</button>
						</>}
					</div>
					<button type="button" aria-label="Обновить данные" title="Обновить данные" className={button} disabled={tab === "overview" ? snapshot.isFetching : settings.isFetching} onClick={() => void (tab === "overview" ? snapshot.refetch() : settings.refetch())}><RefreshCw size={14} /></button>
				</header>
				{tab === "overview" ? <>
					{snapshot.isPending && <p className="text-sm text-muted">Загружаем состояние очереди…</p>}
					{snapshot.isError && <p role="alert" className="text-sm chat-text-danger">{snapshot.error.message}</p>}
					{data && <>
						<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
							{[
								{ label: "В очереди", value: data.queue, icon: ListFilter },
								{ label: "Открытые и ожидающие", value: data.active, icon: Headphones },
								{ label: "Принимают на смене", value: data.agents.filter((agent) => agent.online && agent.accepting && agent.onShift).length, icon: Headphones },
								{ label: "Просрочено по SLA", value: data.sla.filter((row) => row.overdue).length, icon: Clock3 },
							].map(({ label, value, icon: Icon }) => (
								<div key={label} className="chat-stat-card flex min-w-0 flex-col gap-1.5 p-2.5 sm:flex-row sm:items-center sm:gap-3 sm:p-3">
									<span className="chat-settings-icon"><Icon size={16} aria-hidden="true" /></span><div><div className="text-base font-semibold tabular-nums">{value ?? "—"}</div><div className="text-xs leading-tight text-muted">{label}</div></div>
								</div>
							))}
						</div>
						{data.truncated && <p className="text-xs chat-text-warning">Chatwoot вернул часть диалогов. Показатели нагрузки и SLA рассчитаны по полученным данным.</p>}
						<div className="grid gap-3 lg:grid-cols-2">
							<div className="chat-support-panel overflow-hidden">
								<h3 className="border-b border-border p-3 text-sm font-semibold">Нагрузка агентов</h3>
								{!data.agents.length && <p className="p-3 text-xs text-muted">Пока нет агентов со статусом SupportOS.</p>}
								{data.agents.map((agent) => <div key={agent.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border/60 p-3 text-xs last:border-0">
									<span className="truncate font-medium">{names.get(agent.id) ?? `Агент #${agent.id}`}</span>
									<span className="shrink-0 text-muted">{!agent.online ? "Не в сети" : !agent.onShift ? "Вне смены" : agent.accepting ? "Принимает" : "Пауза"}</span>
									<meter className="chat-load-meter" min={0} max={Math.max(agent.limit, 1)} value={Math.min(agent.used, agent.limit)} aria-label="Занятые места для чатов" />
									<span className={agent.used >= agent.limit ? "text-right font-medium tabular-nums chat-text-warning" : "text-right tabular-nums text-muted"} title="Активные чаты / лимит">{agent.used} / {agent.limit}</span>
								</div>)}
							</div>
							<div className="chat-support-panel overflow-hidden">
								<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
									<h3 className="text-sm font-semibold">Ожидают ответа</h3>
									<select aria-label="Проект SLA" value={projectFilter} onChange={(event) => setProjectFilter(Number(event.target.value))} className={field}>
										<option value={0}>Все проекты</option>{inboxes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
									</select>
								</div>
								{!sla.length && <p className="p-3 text-xs text-muted">Нет ожидающих диалогов с настроенным SLA.</p>}
								{sla.map((row) => <button type="button" key={row.id} onClick={() => onOpen(row.id)} title="Открыть в наблюдении" className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border/60 p-3 text-left text-xs last:border-0 hover:bg-surface-elevated">
									<span className="truncate">#{row.id} · {projects.get(row.inboxId) ?? `Источник #${row.inboxId}`}</span>
									<span className={row.overdue ? "shrink-0 chat-text-danger" : "shrink-0 text-muted"}>{duration(row.seconds)} / {row.goal} мин</span>
									<ArrowUpRight size={13} aria-hidden="true" className="text-accent" />
								</button>)}
							</div>
						</div>
					</>}
				</> : <>
					{(settings.isError || save.isError) && <p role="alert" className="text-sm chat-text-danger">{save.error?.message ?? settings.error?.message}</p>}
					{settings.isPending && <p className="text-sm text-muted">Загружаем настройки…</p>}
					{settings.data && <div className="chat-support-panel max-w-2xl p-4">
						<label className="flex flex-col gap-2 text-xs font-medium">{tab === "shifts" ? "Агент" : "Проект"}
							<select className={field} value={activeId ?? 0} onChange={(event) => { setSelected(Number(event.target.value)); save.reset(); }}>
								{(tab === "shifts" ? agents : inboxes).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
							</select>
						</label>
						{activeId && tab === "shifts" && <AgentEditor key={activeId} value={settings.data.agents[activeId] ?? fallbackAgent} pending={save.isPending}
							onSave={(value) => { if (settings.data) save.mutate({ ...settings.data, agents: { ...settings.data.agents, [activeId]: value } }); }} />}
						{activeId && tab === "projects" && <InboxEditor key={activeId} value={settings.data.inboxes[activeId] ?? fallbackInbox} pending={save.isPending}
							onSave={(value) => { if (settings.data) save.mutate({ ...settings.data, inboxes: { ...settings.data.inboxes, [activeId]: value } }); }} />}
						{save.isSuccess && <p role="status" className="mt-3 text-xs chat-text-success">Сохранено</p>}
					</div>}
				</>}
			</div>
		</section>
	);
}

function AgentEditor({ value, pending, onSave }: { value: AgentRule; pending: boolean; onSave: (value: AgentRule) => void }) {
	const [agent, setAgent] = useState(value);
	const [skillText, setSkillText] = useState(value.skills.join(", "));
	const submit = (event: FormEvent) => { event.preventDefault(); onSave({ ...agent, skills: skills(skillText) }); };
	return <form onSubmit={submit} className="mt-4 space-y-3 text-xs">
		<label className="flex flex-col gap-1.5">Навыки через запятую<input className={field} placeholder="Например: en, payments" value={skillText} onChange={(event) => setSkillText(event.target.value)} /></label>
		<label className="flex flex-col gap-1.5">Часовой пояс<input className={field} required list="chat-shift-zones" value={agent.zone} onChange={(event) => setAgent({ ...agent, zone: event.target.value })} /></label>
		<datalist id="chat-shift-zones">{zones.map((zone) => <option key={zone} value={zone} />)}</datalist>
		<p className="text-muted">Смены повторяются каждую неделю. Пустой список означает приём в любое время.</p>
		{agent.shifts.map((shift, index) => {
			const update = (next: Partial<typeof shift>) => setAgent({ ...agent, shifts: agent.shifts.map((row, i) => i === index ? { ...row, ...next } : row) });
			return <div key={index} className="flex flex-wrap items-center gap-2">
				<select aria-label="День недели" className={field} value={shift.day} onChange={(event) => update({ day: Number(event.target.value) })}>{days.map((label, day) => <option key={label} value={day}>{label}</option>)}</select>
				<input aria-label="Начало смены" required type="time" className={field} value={shift.start} onChange={(event) => update({ start: event.target.value })} />
				<input aria-label="Конец смены" required type="time" className={field} value={shift.end} onChange={(event) => update({ end: event.target.value })} />
				<button type="button" className={button} onClick={() => setAgent({ ...agent, shifts: agent.shifts.filter((_, i) => i !== index) })}>Удалить</button>
			</div>;
		})}
		<div className="flex flex-wrap gap-2">
			<button type="button" className={button} disabled={agent.shifts.length >= 14} onClick={() => setAgent({ ...agent, shifts: [...agent.shifts, { day: 1, start: "09:00", end: "18:00" }] })}>Добавить смену</button>
			<button type="submit" className={button} disabled={pending}>Сохранить</button>
		</div>
	</form>;
}

function InboxEditor({ value, pending, onSave }: { value: InboxRule; pending: boolean; onSave: (value: InboxRule) => void }) {
	const [inbox, setInbox] = useState(value);
	const [skillText, setSkillText] = useState(value.skills.join(", "));
	return <form onSubmit={(event) => { event.preventDefault(); onSave({ ...inbox, skills: skills(skillText) }); }} className="mt-4 space-y-3 text-xs">
		<label className="flex flex-col gap-1.5">Обязательные навыки через запятую<input className={field} placeholder="Например: en, payments" value={skillText} onChange={(event) => setSkillText(event.target.value)} /></label>
		<label className="flex flex-col gap-1.5">Цель ответа, минут. 0 отключает SLA<input required min={0} max={1440} type="number" className={field} value={inbox.responseMinutes} onChange={(event) => setInbox({ ...inbox, responseMinutes: Number(event.target.value) })} /></label>
		<label className="flex flex-col gap-1.5">CRM проекта<select className={field} value={inbox.crm} onChange={(event) => setInbox({ ...inbox, crm: event.target.value as InboxRule["crm"] })}>
			<option value="">Не выбрана</option><option value="adwa">ADWA</option><option value="whitelabels">Whitelabels</option><option value="vortexino">Vortexino</option>
		</select></label>
		<button type="submit" className={button} disabled={pending}>Сохранить</button>
	</form>;
}
