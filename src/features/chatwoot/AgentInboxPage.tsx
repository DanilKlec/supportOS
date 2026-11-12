import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Archive,
	Ban,
	CalendarDays,
	CheckCheck,
	ChevronDown,
	Columns2,
	ExternalLink,
	Globe2,
	Headphones,
	LoaderCircle,
	Maximize2,
	MessageCircle,
	MessageSquareText,
	MessagesSquare,
	Minimize2,
	PanelLeftClose,
	PanelLeftOpen,
	Plus,
	RefreshCw,
	Rows2,
	Search,
	Send,
	Settings2,
	Tag,
	UserRound,
	UsersRound,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import { type CSSProperties, createElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Bind } from "@/entities/bind";
import { WebsiteDomainsDialog } from "@/features/chatwoot/WebsiteDomainsDialog";
import {
	type ChatwootAgent,
	type ChatwootContact,
	type ChatwootConversation,
	type ChatwootMessage,
	type ChatwootTeam,
	type ConversationSearch,
	chatwootService,
} from "@/services/chatwoot.service";
import {
	getBindTitle,
	getBindTranslation,
} from "@/shared/modals/knowledge-modal-helpers";
import { useAuthStore } from "@/store/auth.store";
import type { LanguageCode } from "@/store/knowledge.store";
import { useKnowledgeStore } from "@/store/knowledge.store";

type Scope = "mine" | "queue" | "history" | "active";
type WorkspaceSection = "inbox" | "team" | "archive";
type LayoutMode = "single" | "columns" | "rows";
type ResizeAxis = "x" | "y";
const languages: Array<{ id: LanguageCode; label: string }> = [
	{ id: "ru", label: "RU" },
	{ id: "en", label: "EN" },
	{ id: "de", label: "DE" },
	{ id: "pt", label: "PT" },
	{ id: "el", label: "GR" },
];

function rowsFrom(result: unknown): ChatwootConversation[] {
	if (!result || typeof result !== "object") return [];
	if (Array.isArray(result)) return result as ChatwootConversation[];
	const value = result as {
		data?: { payload?: ChatwootConversation[] };
		payload?: ChatwootConversation[];
	};
	return value.data?.payload ?? value.payload ?? [];
}
function listFrom<T>(result: unknown): T[] {
	if (!result || typeof result !== "object") return [];
	if (Array.isArray(result)) return result as T[];
	const value = result as { payload?: T[]; data?: { payload?: T[] } };
	return value.payload ?? value.data?.payload ?? [];
}
function initials(name?: string) {
	return (name || "?")
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}
function dateLabel(timestamp?: number) {
	if (!timestamp) return "";
	return new Date(
		timestamp > 1e12 ? timestamp : timestamp * 1000,
	).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function AgentInboxPage() {
	const client = useQueryClient();
	const [scope, setScope] = useState<Scope>("mine");
	const [activeSection, setActiveSection] = useState<WorkspaceSection>("inbox");
	const [railCollapsed, setRailCollapsed] = useState(false);
	const [layout, setLayout] = useState<LayoutMode>("columns");
	const [listWidth, setListWidth] = useState(() => {
		try { return Number(localStorage.getItem("supportos:chatwoot:list-width")) || 320; } catch { return 320; }
	});
	const [paneSplit, setPaneSplit] = useState(50);
	const [activePage, setActivePage] = useState(1);
	const [activePane, setActivePane] = useState(0);
	const [conversationIds, setConversationIds] = useState<Array<number | null>>([
		null,
		null,
	]);
	const [search, setSearch] = useState("");
	const [queueOpen, setQueueOpen] = useState(true);
	const [inboxId, setInboxId] = useState("");
	const [agentId, setAgentId] = useState("");
	const [label, setLabel] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [sitesOpen, setSitesOpen] = useState(false);
	const [profileOpen, setProfileOpen] = useState(false);
	const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
	const [soundEnabled, setSoundEnabled] = useState(() => {
		try { return localStorage.getItem("supportos:chatwoot:sound") !== "off"; } catch { return true; }
	});
	const audioContext = useRef<AudioContext | null>(null);
	const seenConversationActivity = useRef<Map<number, number | string> | null>(null);
	const user = useAuthStore((s) => s.session?.user);
	const canManageSites = useAuthStore(
		(s) => s.session?.user.access?.permissions.includes("technical") === true,
	);
	const canSupervise = useAuthStore(
		(s) => s.session?.user.access?.permissions.includes("monitor.read") === true,
	);
	const canWork = useAuthStore(
		(s) => s.session?.user.access?.permissions.includes("work") === true,
	);
	const binds = useKnowledgeStore((s) => s.binds);
	const remoteBinds = useKnowledgeStore((s) => s.remoteBinds);
	const language = useKnowledgeStore((s) => s.language);
	const setLanguage = useKnowledgeStore((s) => s.setLanguage);
	const connection = useQuery({
		queryKey: ["chatwoot", "health"],
		queryFn: chatwootService.health,
		retry: false,
	});
	const directory = useQuery({
		queryKey: ["chatwoot", "directory"],
		queryFn: chatwootService.inboxDirectory,
		enabled: connection.data?.configured === true,
		staleTime: 60000,
	});
	const presence = useQuery({
		queryKey: ["chatwoot", "presence"],
		queryFn: () => chatwootService.presence(),
		enabled: connection.data?.configured === true,
		refetchInterval: 30000,
	});
	const displayedScope: Scope = activeSection === "archive" ? "history" : scope;
	const request: ConversationSearch = {
		scope: displayedScope,
		status: displayedScope === "history" ? "resolved" : "open",
		page: displayedScope === "active" ? activePage : 1,
		...(inboxId ? { inboxId: Number(inboxId) } : {}),
		...(displayedScope === "history" && agentId ? { agentId: Number(agentId) } : {}),
		...(label ? { label } : {}),
		...(displayedScope === "history" && from ? { from } : {}),
		...(displayedScope === "history" && to ? { to } : {}),
		...(search.trim() ? { query: search.trim() } : {}),
	};
	const conversations = useQuery({
		queryKey: ["chatwoot", "conversations", request],
		queryFn: () => chatwootService.conversations(request),
		enabled: connection.data?.configured === true && activeSection !== "team",
		refetchInterval: 5000,
	});
	const allLabels = useQuery({
		queryKey: ["chatwoot", "labels"],
		queryFn: chatwootService.labels,
		enabled: connection.data?.configured === true,
		staleTime: 120000,
	});
	const accepting = useMutation({
		mutationFn: (value: boolean) => chatwootService.presence(value),
		onSuccess: (data) => {
			client.setQueryData(["chatwoot", "presence"], data);
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversations"],
			});
			void client.invalidateQueries({ queryKey: ["chatwoot", "directory"] });
		},
	});
	const agents: ChatwootAgent[] = directory.data?.agents ?? [];
	const inboxes = directory.data?.inboxes ?? [];
	const labels = listFrom<{ title?: string; name?: string; color?: string }>(
		allLabels.data,
	)
		.map((item) => item.title ?? item.name ?? "")
		.filter(Boolean);
	const rows = useMemo(
		() => rowsFrom(conversations.data),
		[conversations.data],
	);
	const unlockAudio = () => {
		if (audioContext.current || typeof window === "undefined") return;
		const Context = window.AudioContext;
		if (!Context) return;
		try {
			audioContext.current = new Context();
			void audioContext.current.resume().catch(() => undefined);
		} catch { /* audio is optional */ }
	};
	useEffect(() => {
		if (!conversations.data) return;
		if (!seenConversationActivity.current) {
			seenConversationActivity.current = new Map(rows.map((row) => [row.id, row.last_non_activity_message?.id ?? row.updated_at ?? 0]));
			return;
		}
		const fresh = rows.filter((row) => {
			const previous = seenConversationActivity.current?.get(row.id);
			const latest = row.last_non_activity_message;
			const activityId = latest?.id ?? row.updated_at ?? 0;
			const timestamp = latest?.created_at ?? row.updated_at ?? row.created_at ?? 0;
			const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
			const isIncoming = latest && !latest.private && latest.message_type !== 1 && latest.message_type !== "outgoing";
			const isRecent = Date.now() - millis < 120_000;
			const isNewConversation = previous === undefined && isRecent;
			const isNewMessage = previous !== undefined && previous !== activityId && isIncoming && isRecent;
			seenConversationActivity.current?.set(row.id, activityId);
			return isNewConversation || isNewMessage;
		});
		if (!fresh.length || !soundEnabled) return;
		const context = audioContext.current;
		if (context?.state === "running") {
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			oscillator.type = "sine";
			oscillator.frequency.setValueAtTime(740, context.currentTime);
			oscillator.frequency.setValueAtTime(988, context.currentTime + 0.11);
			gain.gain.setValueAtTime(0.0001, context.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
			oscillator.connect(gain);
			gain.connect(context.destination);
			oscillator.start();
			oscillator.stop(context.currentTime + 0.29);
		}
		if ("Notification" in window && Notification.permission === "granted") {
			new Notification(fresh.length === 1 ? "Новый диалог" : `${fresh.length} новых диалогов`, { body: "Новое обращение в рабочем пространстве SupportOS" });
		}
	}, [conversations.data, rows, soundEnabled]);
	const placeConversation = (id: number) => {
		const existing = conversationIds.indexOf(id);
		if (existing >= 0) {
			setActivePane(existing);
			return;
		}
		const target =
			conversationIds[activePane] == null
				? activePane
				: conversationIds[1 - activePane] == null
					? 1 - activePane
					: activePane;
		const next = [...conversationIds];
		next[target] = id;
		setConversationIds(next);
		setActivePane(target);
	};
	const reload = () => {
		void client.invalidateQueries({ queryKey: ["chatwoot"] });
	};
	const openEmptyPane = () => {
		const target = conversationIds[0] == null ? 0 : 1;
		setActivePane(target);
		setLayout("columns");
		setQueueOpen(true);
	};
	const selectSection = (section: WorkspaceSection) => {
		setActiveSection(section);
		setProfileOpen(false);
		if (section === "inbox") setScope("mine");
		if (section === "archive") setScope("history");
		setActivePage(1);
	};
	const selectScope = (next: Scope) => {
		setScope(next);
		setActivePage(1);
	};
	const toggleSound = () => {
		setSoundEnabled((current) => {
			const next = !current;
			try { localStorage.setItem("supportos:chatwoot:sound", next ? "on" : "off"); } catch { /* preference remains in session */ }
			if (next) {
				unlockAudio();
				if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
			}
			return next;
		});
	};
	const resizeList = (width: number) => {
		const next = Math.min(520, Math.max(260, width));
		setListWidth(next);
		try { localStorage.setItem("supportos:chatwoot:list-width", String(next)); } catch { /* preference remains in session */ }
	};
	const toggleMaximizePane = (index: number) => {
		if (layout === "single") {
			setLayout("columns");
			return;
		}
		if (index === 1) {
			setConversationIds(([first, second]) => [second, first]);
			setActivePane(0);
		}
		setLayout("single");
	};
	if (connection.isLoading)
		return (
			<div className="flex h-full items-center justify-center text-muted">
				<LoaderCircle className="mr-2 animate-spin" size={18} /> Подключаемся к
				Chatwoot…
			</div>
		);
	if (!connection.data?.configured || connection.isError)
		return (
			<SetupCard
				error={
					connection.error instanceof Error
						? connection.error.message
						: undefined
				}
				onRetry={() => void connection.refetch()}
			/>
		);
	return (
		<div className="flex h-full min-h-0 bg-background text-foreground" onPointerDownCapture={unlockAudio}>
			<InboxRail
				activeSection={activeSection}
				collapsed={railCollapsed}
				onToggleCollapsed={() => setRailCollapsed((value) => !value)}
				userEmail={user?.email ?? ""}
				accepting={presence.data?.current.accepting === true}
				acceptingPending={accepting.isPending || presence.isLoading || !presence.data}
				profileOpen={profileOpen}
				soundEnabled={soundEnabled}
				onAccept={() => accepting.mutate(!presence.data?.current.accepting)}
				onSelect={selectSection}
				onToggleProfile={() => setProfileOpen(!profileOpen)}
				onToggleSound={toggleSound}
				onOpenSettings={() => { setAgentSettingsOpen(true); setProfileOpen(false); }}
				onManageSites={canManageSites ? () => { setSitesOpen(true); setProfileOpen(false); } : undefined}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{activeSection !== "team" && <header className="flex min-h-[62px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
				<div className="flex min-w-0 items-center gap-3">
					<div className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-accent">
						<MessageCircle size={18} />
					</div>
					<div className="min-w-0">
						<h1 className="truncate text-base font-semibold">
							{sectionTitle(activeSection)}
						</h1>
						<p className="truncate text-[11px] text-muted">
							{sectionDescription(activeSection)}
						</p>
					</div>
				</div>
			</header>}
			{(presence.isError || accepting.isError) && (
				<div
					role="alert"
					className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-300"
				>
					{presence.error instanceof Error
						? presence.error.message
						: accepting.error instanceof Error
							? accepting.error.message
							: "Не удалось проверить статус агента"}
				</div>
			)}
			<div className="flex min-h-0 flex-1 flex-col">
				{activeSection === "inbox" && <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2">
					{(["mine", "queue", ...(canSupervise ? ["active" as const] : [])] as const).map((item) => (
						<button key={item} type="button" onClick={() => selectScope(item)} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${scope === item ? "bg-surface-elevated text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}>
							{item === "mine" ? "Мои" : item === "queue" ? "Очередь" : "Активные"}
							{item === "active" && <span className="ml-2 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">все агенты</span>}
						</button>
					))}
				</div>}
				<div className="flex min-h-0 flex-1">
				{activeSection === "team" ? (
					<TeamWorkspace
						agents={agents}
						teams={directory.data?.teams ?? []}
						presence={directory.data?.presence ?? []}
						currentAgentId={presence.data?.current.agentId}
					/>
				) : <>
				{queueOpen && scope !== "active" && (
					<aside style={{ width: listWidth }} className="flex min-w-[260px] max-w-[520px] shrink-0 flex-col border-r border-border bg-surface/40">
						<div className="border-b border-border p-3">
							<div className="relative mt-3">
								<Search
									size={14}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
								/>
								<input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Игрок, сообщение или №"
									className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
								/>
							</div>
							<div className="mt-2 grid grid-cols-2 gap-2">
								<select
									value={inboxId}
									onChange={(event) => setInboxId(event.target.value)}
									className="h-8 min-w-0 rounded-lg border border-border bg-background px-2 text-xs"
								>
									<option value="">Все проекты</option>
									{inboxes.map((box) => (
										<option key={box.id} value={box.id}>
											{box.name}
										</option>
									))}
								</select>
								<select
									value={label}
									onChange={(event) => setLabel(event.target.value)}
									className="h-8 min-w-0 rounded-lg border border-border bg-background px-2 text-xs"
								>
									<option value="">Все теги</option>
									{labels.map((tag) => (
										<option key={tag} value={tag}>
											{tag}
										</option>
									))}
								</select>
							</div>
							{displayedScope === "history" && (
								<div className="mt-2 grid grid-cols-2 gap-2">
									<select
										value={agentId}
										onChange={(event) => setAgentId(event.target.value)}
										className="col-span-2 h-8 rounded-lg border border-border bg-background px-2 text-xs"
									>
										<option value="">Все агенты</option>
										{agents.map((agent) => (
											<option key={agent.id} value={agent.id}>
												{agent.name}
											</option>
										))}
									</select>
									<label className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-[10px] text-muted">
										<CalendarDays size={12} />
										<input
											aria-label="С даты"
											type="date"
											value={from}
											onChange={(event) => setFrom(event.target.value)}
											className="min-w-0 bg-transparent text-foreground outline-none"
										/>
									</label>
									<label className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-[10px] text-muted">
										<CalendarDays size={12} />
										<input
											aria-label="По дату"
											type="date"
											value={to}
											onChange={(event) => setTo(event.target.value)}
											className="min-w-0 bg-transparent text-foreground outline-none"
										/>
									</label>
								</div>
							)}
						</div>
						<div className="flex items-center justify-between px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">
							<span>
								{displayedScope === "mine"
									? "Мои активные"
									: displayedScope === "queue"
										? "Нераспределённые"
										: displayedScope === "active" ? "Активные диалоги" : "История диалогов"}
							</span>
							<span>{rows.length}</span>
						</div>
						<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto pb-3">
							{conversations.isLoading ? (
								<div className="p-6 text-center text-sm text-muted">
									<LoaderCircle
										className="mx-auto mb-2 animate-spin"
										size={18}
									/>
									Загружаем диалоги
								</div>
							) : conversations.isError ? (
								<div className="p-4 text-sm text-red-400">
									{conversations.error instanceof Error
										? conversations.error.message
										: "Не удалось загрузить очередь"}
								</div>
							) : rows.length === 0 ? (
								<div className="p-8 text-center text-sm text-muted">
									Диалогов нет
								</div>
							) : (
								rows.map((item) => (
									<ConversationRow
										key={item.id}
										conversation={item}
										active={conversationIds.includes(item.id)}
										onClick={() => placeConversation(item.id)}
										onTake={
											displayedScope === "queue"
												? () =>
														chatwootService
															.assign(
																item.id,
																presence.data?.current.agentId ?? null,
															)
															.then(reload)
												: undefined
										}
									/>
								))
							)}
						</div>
					</aside>
				)}
				{queueOpen && scope !== "active" && <ResizeHandle axis="x" label="Изменить ширину списка" value={listWidth} min={260} max={520} onResize={resizeList} />}
				<main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					{scope === "active" ? <ActiveChatsTable rows={rows} isLoading={conversations.isLoading} isError={conversations.isError} error={conversations.error} canOpen={canWork} page={activePage} hasMore={conversations.data?.hasMore === true} onPage={setActivePage} onOpen={(id) => { placeConversation(id); setScope("mine"); }} inboxes={inboxes} labels={labels} inboxId={inboxId} onInbox={setInboxId} label={label} onLabel={setLabel} search={search} onSearch={setSearch} /> : <>
					<button
						type="button"
						aria-label={queueOpen ? "Скрыть список" : "Показать список"}
						onClick={() => setQueueOpen(!queueOpen)}
						className="absolute left-2 top-2 z-10 grid size-8 place-items-center rounded-lg border border-border bg-surface text-muted shadow-sm hover:text-foreground"
					>
						<PanelLeftClose
							size={15}
							className={queueOpen ? "" : "rotate-180"}
						/>
					</button>
					<div
						data-chatwoot-split
						className={`flex min-h-0 flex-1 overflow-hidden ${layout === "rows" ? "flex-col" : "flex-row"}`}
					>
						<ConversationPane
							id={conversationIds[0]}
							style={layout === "single" ? undefined : { flexBasis: `${paneSplit}%`, flexGrow: 0 }}
							agents={agents}
							inboxes={inboxes}
							labels={labels}
							binds={[...remoteBinds, ...binds]}
							language={language}
							onLanguage={setLanguage}
							active={activePane === 0}
							layout={layout}
							showWorkspaceControls
							onLayout={setLayout}
							onReload={() => {
								void client.invalidateQueries({ queryKey: ["chatwoot", "conversation", conversationIds[0]] });
								void client.invalidateQueries({ queryKey: ["chatwoot", "messages", conversationIds[0], "latest"] });
							}}
							onActivate={() => setActivePane(0)}
							onClose={() => setConversationIds((ids) => [null, ids[1]])}
							onChanged={reload}
							onChoose={openEmptyPane}
							onToggleMaximize={() => toggleMaximizePane(0)}
							maximized={layout === "single"}
						/>
						{layout !== "single" && (
							<ResizeHandle axis={layout === "rows" ? "y" : "x"} label="Изменить размер диалогов" value={paneSplit} min={25} max={75} onResize={(value) => {
								const container = document.querySelector("[data-chatwoot-split]");
								if (!container) return;
								const rect = container.getBoundingClientRect();
								setPaneSplit(Math.min(75, Math.max(25, (value / (layout === "rows" ? rect.height : rect.width)) * 100)));
							}} />
						)}
						{layout !== "single" && (
							<ConversationPane
								id={conversationIds[1]}
								style={{ flexBasis: `${100 - paneSplit}%`, flexGrow: 0 }}
								agents={agents}
								inboxes={inboxes}
								labels={labels}
								binds={[...remoteBinds, ...binds]}
								language={language}
								onLanguage={setLanguage}
								active={activePane === 1}
								layout={layout}
								showWorkspaceControls={false}
								onLayout={setLayout}
								onReload={() => {
									void client.invalidateQueries({ queryKey: ["chatwoot", "conversation", conversationIds[1]] });
									void client.invalidateQueries({ queryKey: ["chatwoot", "messages", conversationIds[1], "latest"] });
								}}
								onActivate={() => setActivePane(1)}
								onClose={() => setConversationIds((ids) => [ids[0], null])}
								onChanged={reload}
								onChoose={openEmptyPane}
								onToggleMaximize={() => toggleMaximizePane(1)}
								maximized={false}
							/>
						)}
					</div>
					</>}
				</main>
				</>}
			</div>
			</div>
			</div>
			{sitesOpen && (
				<WebsiteDomainsDialog onClose={() => setSitesOpen(false)} />
			)}
			{agentSettingsOpen && (
				<AgentSettingsDialog
					email={user?.email ?? ""}
					accepting={presence.data?.current.accepting === true}
					acceptingPending={accepting.isPending || presence.isLoading || !presence.data}
					soundEnabled={soundEnabled}
					onAccept={() => accepting.mutate(!presence.data?.current.accepting)}
					onToggleSound={toggleSound}
					onClose={() => setAgentSettingsOpen(false)}
				/>
			)}
		</div>
	);
}

function sectionTitle(section: WorkspaceSection) {
	return section === "team" ? "Команда" : section === "archive" ? "Архив" : "Диалоги";
}

function sectionDescription(section: WorkspaceSection) {
	return section === "team" ? "Агенты и команды Chatwoot" : section === "archive" ? "Завершённые диалоги и фильтры" : "Входящие, очередь и рабочие диалоги";
}

function ResizeHandle({ axis, label, value, min = 0, max = 100, onResize, fromEnd = false }: {
	axis: ResizeAxis;
	label: string;
	value: number;
	min?: number;
	max?: number;
	onResize: (coordinate: number) => void;
	fromEnd?: boolean;
}) {
	return (
		<hr
			aria-label={label}
			aria-orientation={axis === "x" ? "vertical" : "horizontal"}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={Math.round(value)}
			tabIndex={0}
			onKeyDown={(event) => {
				if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
				event.preventDefault();
				const parent = event.currentTarget.parentElement?.getBoundingClientRect();
				if (!parent) return;
				const bar = event.currentTarget.getBoundingClientRect();
				const local = axis === "x" ? (bar.left + bar.width / 2) - parent.left : (bar.top + bar.height / 2) - parent.top;
				const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -24 : 24;
				onResize((fromEnd ? (axis === "x" ? parent.width : parent.height) - local : local) + direction);
			}}
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
			(event.currentTarget as HTMLHRElement).dataset.dragging = "true";
			}}
			onPointerMove={(event) => {
				if (event.currentTarget.dataset.dragging !== "true") return;
				const parent = event.currentTarget.parentElement?.getBoundingClientRect();
				if (!parent) return;
				const coordinate = axis === "x" ? event.clientX - parent.left : event.clientY - parent.top;
				onResize(fromEnd ? (axis === "x" ? parent.width : parent.height) - coordinate : coordinate);
			}}
			onPointerUp={(event) => {
				event.currentTarget.dataset.dragging = "false";
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
			}}
			className={`m-0 border-0 bg-transparent p-0 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 ${axis === "x" ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"} ${fromEnd ? "-mr-1" : ""}`}
		/>
	);
}

function InboxRail({ activeSection, collapsed, onToggleCollapsed, userEmail, accepting, acceptingPending, profileOpen, soundEnabled, onAccept, onSelect, onToggleProfile, onToggleSound, onOpenSettings, onManageSites }: {
	activeSection: WorkspaceSection;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	userEmail: string;
	accepting: boolean;
	acceptingPending: boolean;
	profileOpen: boolean;
	soundEnabled: boolean;
	onAccept: () => void;
	onSelect: (section: WorkspaceSection) => void;
	onToggleProfile: () => void;
	onToggleSound: () => void;
	onOpenSettings: () => void;
	onManageSites?: () => void;
}) {
	const items: Array<{ id: WorkspaceSection; label: string; icon: typeof MessagesSquare }> = [
		{ id: "inbox", label: "Диалоги", icon: MessagesSquare },
		{ id: "team", label: "Команда", icon: UsersRound },
		{ id: "archive", label: "Архив", icon: Archive },
	];
	return (
		<aside className={`relative z-30 flex shrink-0 flex-col border-r border-border bg-surface/75 py-3 transition-[width] duration-200 ${collapsed ? "w-[62px] items-center" : "w-[208px]"}`}>
			<div className={`mb-5 flex w-full items-center gap-2.5 px-3 ${collapsed ? "justify-center px-0" : ""}`}>
				<div className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-background text-accent"><MessagesSquare size={18} /></div>
				{!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">SupportOS</div><div className="truncate text-[10px] text-muted">Рабочее место агента</div></div>}
				{!collapsed && <button type="button" title="Свернуть меню" onClick={onToggleCollapsed} className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-elevated"><PanelLeftClose size={14} /></button>}
			</div>
			{collapsed && <button type="button" title="Развернуть меню" onClick={onToggleCollapsed} className="mb-3 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated"><PanelLeftOpen size={15} /></button>}
			{!collapsed && <div className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Рабочие разделы</div>}
			<nav className={`flex w-full flex-col gap-1.5 ${collapsed ? "items-center px-2" : "px-2"}`}>
				{items.map(({ id, label, icon: Icon }) => (
					<button key={id} type="button" title={collapsed ? label : undefined} aria-label={label} onClick={() => onSelect(id)} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-left text-xs font-medium transition ${collapsed ? "w-10 justify-center px-0" : "w-full"} ${activeSection === id ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}>
						<Icon size={16} className="shrink-0" />
						{!collapsed && <span>{label}</span>}
					</button>
				))}
			</nav>
			{!collapsed && <div className="mt-auto mx-3 mb-2 rounded-xl border border-border bg-background/60 p-3"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${accepting ? "bg-emerald-400" : "bg-muted"}`} /><span className="text-[11px] font-medium">{accepting ? "Принимаю чаты" : "Приём выключен"}</span></div><div className="mt-1 pl-4 text-[10px] text-muted">Управление в профиле</div></div>}
			<div className={`mt-auto flex w-full items-center px-2 ${collapsed ? "justify-center" : "gap-2 px-3"}`}>
				<button type="button" title={collapsed ? "Профиль агента" : undefined} aria-label="Профиль агента" onClick={onToggleProfile} className="relative grid size-10 shrink-0 place-items-center rounded-full border border-border bg-background text-xs font-semibold hover:border-accent/60">
					{initials(userEmail)}
					<span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface ${accepting ? "bg-emerald-400" : "bg-muted"}`} />
				</button>
				{!collapsed && <button type="button" onClick={onToggleProfile} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{userEmail.split("@")[0] || "Агент"}</span><span className="block truncate text-[10px] text-muted">{userEmail || "Открыть настройки"}</span></button>}
			</div>
			{profileOpen && (
				<div className="absolute bottom-3 left-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-border bg-surface p-2 shadow-2xl">
					<div className="border-b border-border px-3 py-2.5">
						<div className="text-xs font-semibold">Настройки агента</div>
						<div className="mt-1 truncate text-[11px] text-muted">{userEmail || "Аккаунт SupportOS"}</div>
					</div>
					<button type="button" disabled={acceptingPending} onClick={onAccept} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-surface-elevated disabled:opacity-50">
						<span><span className="block text-xs font-medium">Приём чатов</span><span className="mt-0.5 block text-[10px] text-muted">{accepting ? "Вы в очереди распределения" : "Новые диалоги не назначаются"}</span></span>
						<span className={`h-5 w-9 rounded-full p-0.5 transition ${accepting ? "bg-emerald-500" : "bg-surface-elevated"}`}><span className={`block size-4 rounded-full bg-white transition ${accepting ? "translate-x-4" : ""}`} /></span>
					</button>
					<button type="button" onClick={onToggleSound} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs hover:bg-surface-elevated">
						{soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />} Звуковые уведомления {soundEnabled ? "включены" : "выключены"}
					</button>
					<button type="button" onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs hover:bg-surface-elevated"><Settings2 size={15} /> Личные настройки</button>
					{onManageSites && <button type="button" onClick={onManageSites} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs hover:bg-surface-elevated"><Globe2 size={15} /> Источники чатов</button>}
					<a href="/chatwoot-demo.html" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs hover:bg-surface-elevated"><ExternalLink size={15} /> Тестовый сайт с чатом</a>
					<Link to="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"><Headphones size={15} /> Настройки SupportOS</Link>
				</div>
			)}
		</aside>
	);
}

function AgentSettingsDialog({ email, accepting, acceptingPending, soundEnabled, onAccept, onToggleSound, onClose }: {
	email: string;
	accepting: boolean;
	acceptingPending: boolean;
	soundEnabled: boolean;
	onAccept: () => void;
	onToggleSound: () => void;
	onClose: () => void;
}) {
	return (
					<div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
			<section role="dialog" aria-modal="true" aria-labelledby="agent-settings-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
				<div className="flex items-start justify-between"><div><h2 id="agent-settings-title" className="text-base font-semibold">Настройки агента</h2><p className="mt-1 text-xs text-muted">{email || "Личные параметры рабочего места"}</p></div><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-elevated"><X size={16} /></button></div>
				<div className="mt-4 divide-y divide-border rounded-xl border border-border">
					<button type="button" disabled={acceptingPending} onClick={onAccept} className="flex w-full items-center justify-between gap-4 p-3 text-left disabled:opacity-50"><span><span className="block text-xs font-medium">Принимать новые чаты</span><span className="mt-1 block text-[11px] text-muted">{accepting ? "Включено — очередь распределяется автоматически" : "Выключено — новые диалоги не назначаются"}</span></span><span className={`h-5 w-9 shrink-0 rounded-full p-0.5 ${accepting ? "bg-emerald-500" : "bg-surface-elevated"}`}><span className={`block size-4 rounded-full bg-white ${accepting ? "translate-x-4" : ""}`} /></span></button>
					<button type="button" onClick={onToggleSound} className="flex w-full items-center justify-between gap-4 p-3 text-left"><span><span className="block text-xs font-medium">Звуковые уведомления</span><span className="mt-1 block text-[11px] text-muted">Сигнал при новых событиях в диалогах</span></span>{soundEnabled ? <Volume2 size={16} className="text-accent" /> : <VolumeX size={16} className="text-muted" />}</button>
				</div>
				<div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">Готово</button></div>
			</section>
		</div>
	);
}

function TeamWorkspace({ agents, teams, presence, currentAgentId }: {
	agents: ChatwootAgent[];
	teams: ChatwootTeam[];
	presence: Array<{ chatwoot_agent_id: number; accepting: boolean; heartbeat_at: string }>;
	currentAgentId?: number;
}) {
	const [tab, setTab] = useState<"agents" | "teams">("agents");
	const [search, setSearch] = useState("");
	const online = presence.filter((item) => Date.now() - Date.parse(item.heartbeat_at) < 90_000);
	const filteredAgents = agents.filter((agent) => `${agent.name} ${agent.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));
	const filteredTeams = teams.filter((team) => team.name.toLowerCase().includes(search.toLowerCase()));
	return (
		<section className="supportos-scroll min-h-0 flex-1 overflow-auto p-4 sm:p-6">
			<div className="mx-auto max-w-5xl">
				<div className="grid gap-3 sm:grid-cols-3">
					<StatCard label="Агенты" value={agents.length} icon={<UsersRound size={16} />} />
					<StatCard label="В SupportOS" value={online.length} icon={<Headphones size={16} />} />
					<StatCard label="Команды" value={teams.length} icon={<MessagesSquare size={16} />} />
				</div>
				<div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface/40">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
						<div className="flex gap-1 rounded-lg bg-background p-1">
							<button type="button" onClick={() => setTab("agents")} className={`rounded-md px-3 py-2 text-xs ${tab === "agents" ? "bg-surface-elevated text-foreground" : "text-muted"}`}>Агенты</button>
							<button type="button" onClick={() => setTab("teams")} className={`rounded-md px-3 py-2 text-xs ${tab === "teams" ? "bg-surface-elevated text-foreground" : "text-muted"}`}>Команды</button>
						</div>
						<div className="relative min-w-[220px] flex-1 sm:max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "agents" ? "Найти агента…" : "Найти команду…"} className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-accent" /></div>
					</div>
					{tab === "agents" ? filteredAgents.map((agent) => {
						const state = presence.find((item) => item.chatwoot_agent_id === agent.id);
						const isOnline = state && Date.now() - Date.parse(state.heartbeat_at) < 90_000;
						return <div key={agent.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-3 last:border-0"><div className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-background text-xs font-semibold">{initials(agent.name)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{agent.name}{agent.id === currentAgentId && <span className="ml-2 text-[10px] text-accent">Вы</span>}</div><div className="truncate text-xs text-muted">{agent.email || "Почта не указана"}</div></div><span className="hidden rounded-full bg-background px-2 py-1 text-[10px] text-muted sm:block">{agent.role || "Агент"}</span><span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted"><i className={`size-2 rounded-full ${state?.accepting && isOnline ? "bg-emerald-400" : isOnline ? "bg-amber-300" : "bg-zinc-500"}`} />{state?.accepting && isOnline ? "Принимает чаты" : isOnline ? "В SupportOS" : agent.availability_status || "Не в сети"}</span></div>;
					}) : filteredTeams.map((team) => <div key={team.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-4 last:border-0"><div className="grid size-10 place-items-center rounded-xl border border-border bg-background text-accent"><UsersRound size={17} /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{team.name}</div><div className="text-xs text-muted">{team.agents?.length ?? 0} агентов{team.description ? ` · ${team.description}` : ""}</div></div><span className="rounded-full bg-background px-2.5 py-1 text-[10px] text-muted">{team.allow_auto_assign ? "Автоназначение" : "Ручное назначение"}</span></div>)}
					{((tab === "agents" && filteredAgents.length === 0) || (tab === "teams" && filteredTeams.length === 0)) && <div className="p-10 text-center text-sm text-muted">Ничего не найдено</div>}
				</div>
			</div>
		</section>
	);
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
	return <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-4"><div className="grid size-9 place-items-center rounded-lg bg-accent/10 text-accent">{icon}</div><div><div className="text-lg font-semibold">{value}</div><div className="text-[11px] text-muted">{label}</div></div></div>;
}

type ActiveSort = "player" | "email" | "agent" | "project" | "updated";
function ActiveChatsTable({ rows, isLoading, isError, error, canOpen, page, hasMore, onPage, onOpen, inboxes, labels, inboxId, onInbox, label, onLabel, search, onSearch }: {
	rows: ChatwootConversation[];
	isLoading: boolean;
	isError: boolean;
	error: unknown;
	canOpen: boolean;
	page: number;
	hasMore: boolean;
	onPage: (page: number) => void;
	onOpen: (id: number) => void;
	inboxes: Array<{ id: number; name: string }>;
	labels: string[];
	inboxId: string;
	onInbox: (value: string) => void;
	label: string;
	onLabel: (value: string) => void;
	search: string;
	onSearch: (value: string) => void;
}) {
	const [sort, setSort] = useState<ActiveSort>("updated");
	const [direction, setDirection] = useState<"asc" | "desc">("desc");
	const sorted = [...rows].sort((left, right) => {
		const value = (item: ChatwootConversation) => {
			if (sort === "player") return item.meta?.sender?.name ?? "";
			if (sort === "email") return item.meta?.sender?.email ?? "";
			if (sort === "agent") return item.meta?.assignee?.name ?? "";
			if (sort === "project") return item.meta?.inbox?.name ?? "";
			return item.updated_at ?? item.created_at ?? 0;
		};
		const a = value(left);
		const b = value(right);
		const compare = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "ru", { sensitivity: "base" });
		return direction === "asc" ? compare : -compare;
	});
	const sortBy = (column: ActiveSort) => {
		if (sort === column) setDirection((value) => value === "asc" ? "desc" : "asc");
		else { setSort(column); setDirection(column === "updated" ? "desc" : "asc"); }
	};
	const dateTime = (value?: number) => value ? new Date(value > 1e12 ? value : value * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
	const heading = (key: ActiveSort, title: string) => <button type="button" onClick={() => sortBy(key)} className="inline-flex items-center gap-1.5 text-left hover:text-foreground">{title}<span className={sort === key ? "text-accent" : "text-muted/60"}>{sort === key ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button>;
	return (
		<section className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/20 px-4 py-3">
				<div className="relative min-w-[200px] flex-1 sm:max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Игрок, почта или диалог" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-accent" /></div>
				<select value={inboxId} onChange={(event) => onInbox(event.target.value)} className="h-9 min-w-32 rounded-lg border border-border bg-background px-2.5 text-xs"><option value="">Все проекты</option>{inboxes.map((inbox) => <option key={inbox.id} value={inbox.id}>{inbox.name}</option>)}</select>
				<select value={label} onChange={(event) => onLabel(event.target.value)} className="h-9 min-w-28 rounded-lg border border-border bg-background px-2.5 text-xs"><option value="">Все теги</option>{labels.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
				<div className="ml-auto rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] text-muted">Все активные диалоги · Chatwoot</div>
			</div>
			<div className="supportos-scroll min-h-0 flex-1 overflow-auto">
				<table className="w-full min-w-[960px] border-collapse text-left text-xs">
					<thead className="sticky top-0 z-10 border-b border-border bg-surface text-[10px] font-semibold uppercase tracking-wide text-muted"><tr>
						<th className="px-4 py-3">{heading("player", "Игрок")}</th><th className="px-4 py-3">{heading("email", "Email")}</th><th className="px-4 py-3">{heading("agent", "Агент")}</th><th className="px-4 py-3">{heading("project", "Проект")}</th><th className="px-4 py-3">Теги</th><th className="px-4 py-3">Статус</th><th className="px-4 py-3">{heading("updated", "Последняя активность")}</th>
					</tr></thead>
					<tbody className="divide-y divide-border/70">
						{isLoading ? <tr><td colSpan={7} className="p-10 text-center text-muted"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Загружаем активные чаты…</td></tr> : isError ? <tr><td colSpan={7} className="p-8 text-center text-red-400">{error instanceof Error ? error.message : "Не удалось загрузить чаты"}</td></tr> : sorted.length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-muted">Активных чатов не найдено</td></tr> : sorted.map((item) => {
							const sender = item.meta?.sender;
							return <tr key={item.id} className="transition hover:bg-surface-elevated/50">
								<td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-[10px] font-semibold">{initials(sender?.name || sender?.email)}</span>{canOpen ? <button type="button" onClick={() => onOpen(item.id)} className="max-w-48 truncate text-left font-medium hover:text-accent">{sender?.name || `Диалог #${item.id}`}</button> : <span className="max-w-48 truncate font-medium">{sender?.name || `Диалог #${item.id}`}</span>}</div></td>
								<td className="px-4 py-3 text-muted">{sender?.email || "—"}</td><td className="px-4 py-3">{item.meta?.assignee?.name || <span className="text-amber-300">Не назначен</span>}</td><td className="px-4 py-3 text-muted">{item.meta?.inbox?.name || "—"}</td>
								<td className="px-4 py-3"><div className="flex max-w-52 flex-wrap gap-1">{item.labels?.length ? item.labels.map((tag) => <span key={tag} className="max-w-24 truncate rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">{tag}</span>) : <span className="text-muted">—</span>}</div></td>
								<td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-[10px] text-muted"><i className={`size-1.5 rounded-full ${item.status === "pending" ? "bg-amber-300" : "bg-emerald-400"}`} />{item.status === "pending" ? "Ожидает" : "Открыт"}</span></td><td className="px-4 py-3 text-muted">{dateTime(item.last_non_activity_message?.created_at ?? item.updated_at)}</td>
							</tr>;
						})}
					</tbody>
				</table>
			</div>
			<footer className="flex shrink-0 items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted"><span>Страница {page} · {rows.length} диалогов</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-border px-2.5 py-1.5 disabled:opacity-40">Назад</button><button type="button" disabled={!hasMore} onClick={() => onPage(page + 1)} className="rounded-lg border border-border px-2.5 py-1.5 disabled:opacity-40">Дальше</button></div></footer>
		</section>
	);
}

function ConversationRow({
	conversation,
	active,
	onClick,
	onTake,
}: {
	conversation: ChatwootConversation;
	active: boolean;
	onClick: () => void;
	onTake?: () => void;
}) {
	const sender = conversation.meta?.sender;
	const last = conversation.last_non_activity_message;
	return (
		<div
			className={`group flex w-full items-center border-b border-border/70 pr-2 transition hover:bg-surface-elevated/70 ${active ? "bg-accent/10" : ""}`}
		>
			<button
				type="button"
				onClick={onClick}
				className="min-w-0 flex-1 px-4 py-3 text-left"
			>
				<div className="flex min-w-0 gap-3">
					<div className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-elevated text-xs font-semibold text-muted">
						{initials(sender?.name)}
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-sm font-semibold">
								{sender?.name || sender?.email || `Диалог #${conversation.id}`}
							</span>
							<span className="shrink-0 text-[10px] text-muted">
								{dateLabel(last?.created_at ?? conversation.updated_at)}
							</span>
						</div>
						<div className="mt-0.5 flex items-center justify-between gap-2">
							<span className="truncate text-xs text-muted">
								{last?.content?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") ||
									"Новое обращение"}
							</span>
							<span className="shrink-0 text-[10px] text-muted">
								#{conversation.id}
							</span>
						</div>
						<div className="mt-2 flex min-w-0 items-center gap-1.5">
							<span className="max-w-28 truncate rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">
								{conversation.meta?.inbox?.name ?? "Входящие"}
							</span>
							{conversation.meta?.assignee?.name && (
								<span className="truncate text-[10px] text-muted">
									· {conversation.meta.assignee.name}
								</span>
							)}
							{conversation.labels?.slice(0, 2).map((tag) => (
								<span
									key={tag}
									className="truncate rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent"
								>
									{tag}
								</span>
							))}
						</div>
					</div>
				</div>
			</button>
			{onTake && (
				<button
					type="button"
					onClick={onTake}
					title="Взять в работу"
					className="hidden shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] font-medium text-muted hover:text-foreground group-hover:block"
				>
					Взять
				</button>
			)}
		</div>
	);
}

function ConversationPane({
	id,
	style,
	active,
	layout,
	showWorkspaceControls,
	onLayout,
	onReload,
	agents,
	inboxes,
	labels,
	binds,
	language,
	onLanguage,
	onActivate,
	onClose,
	onChanged,
	onChoose,
	onToggleMaximize,
	maximized,
}: {
	id: number | null;
	style?: CSSProperties;
	active: boolean;
	layout: LayoutMode;
	showWorkspaceControls: boolean;
	onLayout: (layout: LayoutMode) => void;
	onReload: () => void;
	agents: ChatwootAgent[];
	inboxes: Array<{ id: number; name: string }>;
	labels: string[];
	binds: Bind[];
	language: LanguageCode;
	onLanguage: (language: LanguageCode) => void;
	onActivate: () => void;
	onClose: () => void;
	onChanged: () => void;
	onChoose: () => void;
	onToggleMaximize: () => void;
	maximized: boolean;
}) {
	const client = useQueryClient();
	const [text, setText] = useState("");
	const [privateNote, setPrivateNote] = useState(false);
	const [assignOpen, setAssignOpen] = useState(false);
	const [bindSearch, setBindSearch] = useState("");
	const [showBinds, setShowBinds] = useState(false);
	const [tagOpen, setTagOpen] = useState(false);
	const [showCustomer, setShowCustomer] = useState(true);
	const [customerWidth, setCustomerWidth] = useState(248);
	const [confirmBlock, setConfirmBlock] = useState(false);
	const [olderMessages, setOlderMessages] = useState<ChatwootMessage[]>([]);
	const [hasOlderMessages, setHasOlderMessages] = useState(true);
	const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
	const [olderMessagesError, setOlderMessagesError] = useState("");
	const messageViewport = useRef<HTMLDivElement>(null);
	const previousScrollHeight = useRef<number | null>(null);
	const followMessages = useRef(true);
	const query = useQuery({
		queryKey: ["chatwoot", "conversation", id],
		queryFn: () => chatwootService.conversation(id as number),
		enabled: id != null,
		refetchInterval: 15000,
	});
	const conversation = query.data as ChatwootConversation | undefined;
	const latestMessagesQuery = useQuery({
		queryKey: ["chatwoot", "messages", id, "latest"],
		queryFn: () => chatwootService.conversationMessages(id as number),
		enabled: id != null,
		refetchInterval: 3000,
	});
	const latestMessages = latestMessagesQuery.data
		? latestMessagesQuery.data.payload ??
			latestMessagesQuery.data.data?.payload ??
			latestMessagesQuery.data.messages ??
			[]
		: (conversation?.messages ?? query.data?.payload?.messages ?? []);
	const messages = useMemo(() => {
		const unique = new Map<number, ChatwootMessage>();
		for (const message of [...olderMessages, ...latestMessages]) unique.set(message.id, message);
		return [...unique.values()].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
	}, [olderMessages, latestMessages]);
	const latestMessageId = messages.at(-1)?.id;
	useEffect(() => {
		setOlderMessages([]);
		setHasOlderMessages(true);
		setOlderMessagesError("");
		followMessages.current = true;
	}, [id]);
	useEffect(() => {
		if (!latestMessagesQuery.data) return;
		const page = latestMessagesQuery.data.payload ?? latestMessagesQuery.data.data?.payload ?? latestMessagesQuery.data.messages ?? [];
		if (page.length < 20) setHasOlderMessages(false);
	}, [latestMessagesQuery.data]);
	useEffect(() => {
		const viewport = messageViewport.current;
		if (!viewport || latestMessageId == null) return;
		if (previousScrollHeight.current !== null) {
			viewport.scrollTop += viewport.scrollHeight - previousScrollHeight.current;
			previousScrollHeight.current = null;
			return;
		}
		if (!followMessages.current) return;
		viewport.scrollTop = viewport.scrollHeight;
	}, [latestMessageId, messages.length]);
	const loadOlderMessages = async () => {
		const firstId = messages[0]?.id;
		if (!id || !firstId || loadingOlderMessages || !hasOlderMessages) return;
		setLoadingOlderMessages(true);
		setOlderMessagesError("");
		try {
			const viewport = messageViewport.current;
			if (viewport) previousScrollHeight.current = viewport.scrollHeight;
			const result = await chatwootService.conversationMessages(id, firstId);
			const page = result.payload ?? result.data?.payload ?? result.messages ?? [];
			setOlderMessages((current) => {
				const unique = new Map(current.map((message) => [message.id, message]));
				for (const message of page) unique.set(message.id, message);
				return [...unique.values()].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
			});
			setHasOlderMessages(page.length >= 20);
		} catch (error) {
			setOlderMessagesError(error instanceof Error ? error.message : "Не удалось загрузить историю");
		} finally {
			setLoadingOlderMessages(false);
		}
	};
	const sender = conversation?.meta?.sender;
	const contactId = sender?.id ?? conversation?.contact_id;
	const contact = useQuery({
		queryKey: ["chatwoot", "contact", contactId],
		queryFn: () => chatwootService.contact(contactId as number),
		enabled: contactId != null,
		staleTime: 60000,
	});
	const send = useMutation({
		mutationFn: () =>
			chatwootService.sendMessage(id as number, text.trim(), privateNote),
		onSuccess: () => {
			setText("");
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversation", id],
			});
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversations"],
			});
		},
	});
	const status = useMutation({
		mutationFn: (value: "open" | "resolved") =>
			chatwootService.setStatus(id as number, value),
		onSuccess: () => {
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversation", id],
			});
			onChanged();
		},
	});
	const assign = useMutation({
		mutationFn: (assigneeId: number | null) =>
			chatwootService.assign(id as number, assigneeId),
		onSuccess: () => {
			setAssignOpen(false);
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversation", id],
			});
			onChanged();
		},
	});
	const tagMutation = useMutation({
		mutationFn: (next: string[]) =>
			chatwootService.setLabels(id as number, next),
		onSuccess: () => {
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversation", id],
			});
			onChanged();
		},
	});
	const block = useMutation({
		mutationFn: (value: boolean) =>
			chatwootService.blockContact(contactId as number, value),
		onSuccess: () => {
			setConfirmBlock(false);
			void client.invalidateQueries({
				queryKey: ["chatwoot", "contact", contactId],
			});
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversation", id],
			});
		},
	});
	const allBinds = useMemo(
		() => binds.filter((bind) => !bind.archived),
		[binds],
	);
	const filteredBinds = allBinds
		.filter((bind) =>
			`${getBindTitle(bind, language)} ${getBindTranslation(bind, language)?.content ?? ""}`
				.toLowerCase()
				.includes(bindSearch.toLowerCase()),
		)
		.slice(0, 8);
	const currentContact =
		(contact.data as ChatwootContact | undefined) ?? sender;
	const insertBind = (bind: Bind) => {
		const translation = getBindTranslation(bind, language);
		if (!translation) return;
		setText(
			(value) =>
				`${value}${value && !value.endsWith("\n") ? "\n" : ""}${translation.content}`,
		);
		setPrivateNote(false);
		setShowBinds(false);
		setBindSearch("");
	};
	if (!id)
		return (
			<div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-8 text-center">
				<div className="grid size-14 place-items-center rounded-2xl border border-border bg-surface text-muted">
					<MessageSquareText size={23} />
				</div>
				<h2 className="mt-4 text-sm font-semibold">Панель свободна</h2>
				<p className="mt-1 max-w-60 text-xs leading-relaxed text-muted">
					Выберите диалог из списка
				</p>
				<button
					type="button"
					onClick={onChoose}
					className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-surface-elevated"
				>
					<Plus size={14} /> Выбрать диалог
				</button>
			</div>
		);
	const tags = conversation?.labels ?? [];
	return (
		<section
			style={style}
			onFocusCapture={onActivate}
			className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${active ? "" : ""}`}
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<header className="flex min-h-[56px] shrink-0 items-center justify-between gap-2 border-b border-border pl-12 pr-3 py-2">
					<div className="flex min-w-0 items-center gap-2.5">
						<div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-elevated text-[11px] font-semibold">
							{initials(sender?.name)}
						</div>
						<div className="min-w-0">
							<h2 className="truncate text-sm font-semibold">
								{sender?.name || sender?.email || `Диалог #${id}`}
							</h2>
							<p className="truncate text-[11px] text-muted">
								{conversation?.meta?.inbox?.name || `#${id}`}
								{conversation?.status === "pending" ? " · ожидает" : ""}
							</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						{showWorkspaceControls && (
							<div className="mr-1 flex items-center rounded-lg border border-border bg-surface p-0.5">
								<button
									type="button"
									onClick={() => onLayout("single")}
									title="Одно окно"
									aria-label="Одно окно"
									className={`grid size-7 place-items-center rounded-md ${layout === "single" ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}
								>
									<Maximize2 size={13} />
								</button>
								<button
									type="button"
									onClick={() => onLayout("columns")}
									title="Два окна рядом"
									aria-label="Два окна рядом"
									className={`grid size-7 place-items-center rounded-md ${layout === "columns" ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}
								>
									<Columns2 size={13} />
								</button>
								<button
									type="button"
									onClick={() => onLayout("rows")}
									title="Два окна одно над другим"
									aria-label="Два окна одно над другим"
									className={`grid size-7 place-items-center rounded-md ${layout === "rows" ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}
								>
									<Rows2 size={13} />
								</button>
								<button
									type="button"
									onClick={onReload}
									title="Обновить переписку"
									aria-label="Обновить переписку"
									className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-elevated hover:text-foreground"
								>
									<RefreshCw size={13} className={latestMessagesQuery.isFetching ? "animate-spin" : ""} />
								</button>
							</div>
						)}
						<div className="relative">
							<button
								type="button"
								onClick={() => setAssignOpen(!assignOpen)}
								className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted hover:bg-surface-elevated"
							>
								<UserRound size={13} />
								<span className="hidden max-w-24 truncate sm:block">
									{conversation?.meta?.assignee?.name ?? "Назначить"}
								</span>
								<ChevronDown size={12} />
							</button>
							{assignOpen && (
								<div className="absolute right-0 top-9 z-20 max-h-64 w-52 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
									<button
										type="button"
										onClick={() => assign.mutate(null)}
										className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-surface-elevated"
									>
										Снять назначение
									</button>
									{agents.map((agent) => (
										<button
											key={agent.id}
											type="button"
											onClick={() => assign.mutate(agent.id)}
											className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-surface-elevated"
										>
											{agent.name}
										</button>
									))}
								</div>
							)}
						</div>
						<button
							type="button"
							onClick={() => setShowCustomer(!showCustomer)}
							title="Карточка игрока"
							className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated"
						>
							<UserRound size={14} />
						</button>
						<button
							type="button"
							onClick={onToggleMaximize}
							title={maximized ? "Вернуть разделение" : "Развернуть диалог"}
							className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated"
						>
							{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
						</button>
						<button
							type="button"
							title={
								conversation?.status === "resolved" ? "Открыть" : "Завершить"
							}
							onClick={() =>
								status.mutate(
									conversation?.status === "resolved" ? "open" : "resolved",
								)
							}
							className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated"
						>
							<CheckCheck size={14} />
						</button>
						<button
							type="button"
							title="Закрыть вкладку"
							onClick={onClose}
							className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated"
						>
							<X size={15} />
						</button>
					</div>
				</header>
				<div className="relative z-20 flex min-h-8 shrink-0 flex-wrap items-center gap-1.5 overflow-visible border-b border-border px-3 py-1.5">
					{tags.map((tag) => (
						<button
							key={tag}
							type="button"
							onClick={() =>
								tagMutation.mutate(tags.filter((item) => item !== tag))
							}
							title="Нажмите, чтобы убрать метку"
							className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-[10px] text-accent"
						>
							{tag} ×
						</button>
					))}
					<div className="relative z-30">
						<button
							type="button"
							onClick={() => setTagOpen(!tagOpen)}
							className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground"
						>
							<Tag size={11} /> Добавить тег
						</button>
						{tagOpen && (
							<div className="supportos-scroll absolute left-0 top-[calc(100%+8px)] z-[90] max-h-64 w-60 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-2xl">
								{labels
									.filter((tag) => !tags.includes(tag))
									.map((tag) => (
										<button
											key={tag}
											type="button"
											onClick={() => {
												tagMutation.mutate([...tags, tag]);
												setTagOpen(false);
											}}
											className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-surface-elevated"
										>
											{tag}
										</button>
									))}
							</div>
						)}
					</div>
					<span className="ml-auto shrink-0 text-[10px] text-muted">
						Проект:{" "}
						{inboxes.find((box) => box.id === conversation?.inbox_id)?.name ??
							conversation?.meta?.inbox?.name ??
							"—"}
					</span>
				</div>
				<div
					ref={messageViewport}
					onScroll={(event) => {
						const viewport = event.currentTarget;
						followMessages.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
					}}
					className="supportos-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
				>
					{hasOlderMessages && messages.length > 0 && (
						<div className="sticky top-0 z-10 mb-4 flex justify-center">
							<button
								type="button"
								disabled={loadingOlderMessages}
								onClick={() => void loadOlderMessages()}
								className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-muted shadow-sm hover:text-foreground disabled:opacity-60"
							>
								{loadingOlderMessages ? <LoaderCircle size={12} className="animate-spin" /> : null}
								{loadingOlderMessages ? "Загружаем историю…" : "Загрузить более ранние сообщения"}
							</button>
						</div>
					)}
					{olderMessagesError && (
						<p role="alert" className="mb-3 text-center text-xs text-red-400">
							{olderMessagesError}
						</p>
					)}
					{query.isLoading || latestMessagesQuery.isLoading ? (
						<div className="flex h-full items-center justify-center text-sm text-muted">
							<LoaderCircle className="mr-2 animate-spin" size={16} />
							Загружаем переписку
						</div>
					) : query.isError || latestMessagesQuery.isError ? (
						<div className="m-auto max-w-sm rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
							{(latestMessagesQuery.error ?? query.error) instanceof Error
								? (latestMessagesQuery.error ?? query.error)?.message
								: "Не удалось загрузить диалог"}
						</div>
					) : messages.length === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted">
							Сообщений пока нет
						</div>
					) : (
						<div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
							{messages.map((message) => (
								<MessageBubble key={message.id} message={message} />
							))}
						</div>
					)}
				</div>
				<footer className="shrink-0 border-t border-border bg-surface/40 p-3">
					<div className="mb-2 flex items-center justify-between gap-2">
						<div className="flex items-center gap-1.5">
							<button
								type="button"
								onClick={() => setPrivateNote(!privateNote)}
								className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${privateNote ? "bg-amber-500/10 text-amber-300" : "text-muted hover:bg-surface-elevated"}`}
							>
								{privateNote ? "Внутренняя заметка" : "Ответ клиенту"}
							</button>
							<div className="relative">
								<button
									type="button"
									onClick={() => setShowBinds(!showBinds)}
									className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted hover:text-foreground"
								>
									<MessageSquareText size={12} /> Быстрый бинд
								</button>
								{showBinds && (
									<div className="absolute bottom-9 left-0 z-30 w-[min(360px,75vw)] rounded-xl border border-border bg-surface p-2 shadow-2xl">
										<input
											value={bindSearch}
											onChange={(event) => setBindSearch(event.target.value)}
											placeholder="Найти бинд…"
											className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-accent"
										/>
										<div className="my-2 flex gap-1">
											{languages.map((item) => (
												<button
													key={item.id}
													type="button"
													onClick={() => onLanguage(item.id)}
													className={`rounded px-2 py-1 text-[10px] ${language === item.id ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-elevated"}`}
												>
													{item.label}
												</button>
											))}
										</div>
										<div className="max-h-52 overflow-y-auto">
											{filteredBinds.length ? (
												filteredBinds.map((bind) => (
													<button
														key={bind.id}
														type="button"
														onClick={() => insertBind(bind)}
														className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-elevated"
													>
														<span className="block truncate text-xs font-medium">
															{getBindTitle(bind, language)}
														</span>
														<span className="mt-0.5 block truncate text-[10px] text-muted">
															{getBindTranslation(bind, language)?.content}
														</span>
													</button>
												))
											) : (
												<p className="p-3 text-xs text-muted">
													Бинды не найдены
												</p>
											)}
										</div>
									</div>
								)}
							</div>
						</div>
						<div className="flex items-center gap-2">
							<span className="hidden text-[10px] text-muted sm:block">
								Ctrl + Enter
							</span>
							<button
								type="button"
								disabled={!text.trim() || send.isPending}
								onClick={() => send.mutate()}
								className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
							>
								<Send size={13} />
								{send.isPending ? "Отправка" : "Отправить"}
							</button>
						</div>
					</div>
					<textarea
						value={text}
						onChange={(event) => setText(event.target.value)}
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								(event.ctrlKey || event.metaKey) &&
								text.trim()
							) {
								event.preventDefault();
								send.mutate();
							}
						}}
						placeholder={
							privateNote
								? "Заметка видна только команде…"
								: "Напишите ответ клиенту…"
						}
						rows={3}
						className="supportos-scroll block max-h-36 min-h-[76px] w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none placeholder:text-muted focus:border-accent/60"
					/>
					{send.isError && (
						<p role="alert" className="mt-1 text-xs text-red-400">
							{send.error instanceof Error
								? send.error.message
								: "Не удалось отправить"}
						</p>
					)}
				</footer>
			</div>
			{showCustomer && (
				<>
				<ResizeHandle axis="x" label="Изменить ширину карточки клиента" value={customerWidth} min={200} max={420} fromEnd onResize={(width) => setCustomerWidth(Math.min(420, Math.max(200, width)))} />
				<aside style={{ width: customerWidth }} className="supportos-scroll hidden shrink-0 overflow-y-auto border-l border-border bg-surface/30 p-3 xl:block">
					<div className="mb-3 flex items-center justify-between">
						<h3 className="text-xs font-semibold">Игрок</h3>
						<button
							type="button"
							onClick={() => setShowCustomer(false)}
							className="text-muted hover:text-foreground"
						>
							<X size={13} />
						</button>
					</div>
					<div className="mb-4 flex flex-col items-center rounded-xl border border-border bg-surface p-3 text-center">
						<div className="grid size-12 place-items-center rounded-full border border-border bg-surface-elevated text-sm font-semibold">
							{initials(currentContact?.name ?? sender?.name)}
						</div>
						<div className="mt-2 w-full truncate text-sm font-semibold">
							{currentContact?.name || sender?.name || "Без имени"}
						</div>
						<div className="w-full truncate text-[11px] text-muted">
							{currentContact?.email || sender?.email || "Email не указан"}
						</div>
					</div>
					<div className="space-y-3 text-xs">
						<Info label="Никнейм" value={currentContact?.identifier} />
						<Info
							label="Логин"
							value={String(
								currentContact?.custom_attributes?.login ??
									currentContact?.additional_attributes?.username ??
									currentContact?.additional_attributes?.login ??
									"",
							)}
						/>
						<Info label="Телефон" value={currentContact?.phone_number} />
						<Info label="ID контакта" value={String(contactId ?? "")} />
						<Info label="Проект" value={conversation?.meta?.inbox?.name} />
						<Info
							label="Ответственный"
							value={conversation?.meta?.assignee?.name}
						/>
						{Object.entries({
							...currentContact?.custom_attributes,
							...currentContact?.additional_attributes,
						})
							.filter(
								([key, value]) =>
									value != null &&
									value !== "" &&
									!["login", "username"].includes(key.toLowerCase()),
							)
							.slice(0, 8)
							.map(([key, value]) => (
								<Info
									key={key}
									label={key.replaceAll("_", " ")}
									value={
										typeof value === "string" || typeof value === "number"
											? String(value)
											: JSON.stringify(value)
									}
								/>
							))}
					</div>
					<div className="mt-4 border-t border-border pt-3">
						<button
							type="button"
							disabled={!contactId || block.isPending}
							onClick={() => setConfirmBlock(true)}
							className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] ${currentContact?.blocked ? "border-amber-500/30 text-amber-300" : "border-red-500/20 text-red-300 hover:bg-red-500/5"}`}
						>
							<Ban size={13} />
							{currentContact?.blocked
								? "Разблокировать игрока"
								: "Заблокировать игрока"}
						</button>
						{confirmBlock && (
							<div className="mt-2 rounded-lg border border-border bg-background p-2">
								<p className="text-[10px] text-muted">
									{currentContact?.blocked
										? "Снять блокировку с игрока?"
										: "Заблокировать игрока в Chatwoot?"}
								</p>
								<div className="mt-2 flex gap-1">
									<button
										type="button"
										onClick={() => setConfirmBlock(false)}
										className="flex-1 rounded border border-border px-2 py-1 text-[10px]"
									>
										Отмена
									</button>
									<button
										type="button"
										onClick={() => block.mutate(!currentContact?.blocked)}
										className="flex-1 rounded bg-red-500/15 px-2 py-1 text-[10px] text-red-300"
									>
										Подтвердить
									</button>
								</div>
							</div>
						)}
					</div>
				</aside>
				</>
			)}
		</section>
	);
}

function Info({ label, value }: { label: string; value?: string | null }) {
	if (!value) return null;
	return (
		<div>
			<div className="text-[10px] text-muted">{label}</div>
			<div className="mt-0.5 break-all text-[11px]">{value}</div>
		</div>
	);
}
function MessageBubble({ message }: { message: ChatwootMessage }) {
	const type = String(message.message_type ?? "").toLowerCase();
	const activity = type === "2" || type === "activity";
	const outgoing = type === "1" || type === "outgoing";
	if (activity) {
		return (
			<div className="flex justify-center px-3 py-1">
				<div className="max-w-[min(90%,42rem)] rounded-full border border-border/70 bg-surface-elevated/70 px-3 py-1.5 text-center text-[11px] leading-relaxed text-muted">
					{message.content
						? renderMessageContent(message.content)
						: "Событие диалога"}
					{message.created_at ? (
						<span className="ml-2 whitespace-nowrap text-[10px] opacity-70">
							{dateLabel(message.created_at)}
						</span>
					) : null}
				</div>
			</div>
		);
	}
	return (
		<div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
			<article
				className={`max-w-[min(82%,42rem)] min-w-0 rounded-2xl px-3.5 py-2.5 ${message.private ? "border border-amber-500/20 bg-amber-500/5" : outgoing ? "bg-accent/15" : "border border-border bg-surface"}`}
			>
				{message.private && (
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
						Внутренняя заметка
					</div>
				)}
				{!outgoing && (
					<div className="mb-1 text-[10px] font-semibold text-muted">
						{message.sender?.name || "Клиент"}
					</div>
				)}
				{message.content && (
					<div className="chatwoot-message-content break-words text-[13px] leading-relaxed">
						{renderMessageContent(message.content)}
					</div>
				)}
				{message.attachments?.map((file) => (
					<a
						key={`${file.data_url}-${file.file_size}`}
						href={
							file.data_url?.startsWith("https://") ? file.data_url : undefined
						}
						target="_blank"
						rel="noreferrer"
						className="mt-2 block text-xs text-accent underline"
					>
						Открыть вложение
					</a>
				))}
				<div className="mt-1 text-right text-[10px] text-muted">
					{dateLabel(message.created_at)}
				</div>
			</article>
		</div>
	);
}

function renderMessageContent(content: string): ReactNode {
	if (typeof DOMParser === "undefined" || !/<[a-z][\s\S]*>/i.test(content)) {
		return <span className="whitespace-pre-wrap">{content}</span>;
	}
	const parsed = new DOMParser().parseFromString(content, "text/html");
	const blocked = new Set([
		"SCRIPT",
		"STYLE",
		"IFRAME",
		"OBJECT",
		"EMBED",
		"SVG",
		"MATH",
	]);
	const supported = new Set([
		"P", "BR", "STRONG", "B", "EM", "I", "U", "S", "DEL", "CODE", "PRE",
		"UL", "OL", "LI", "BLOCKQUOTE", "DIV", "SPAN", "H1", "H2", "H3", "H4",
		"H5", "H6", "A", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH",
	]);
	const renderNode = (node: Node, path: string): ReactNode => {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent;
		if (!(node instanceof HTMLElement) || blocked.has(node.tagName)) return null;
		const children = Array.from(node.childNodes).map((child, index) =>
			renderNode(child, `${path}.${index}`),
		);
		if (!supported.has(node.tagName)) return children;
		const tag = node.tagName.toLowerCase();
		if (tag === "a") {
			const href = node.getAttribute("href")?.trim();
			if (!href || !/^(https?:|mailto:)/i.test(href)) return children;
			return createElement(
				"a",
				{
					key: path,
					href,
					target: "_blank",
					rel: "noopener noreferrer",
					className: "text-accent underline underline-offset-2",
				},
				children,
			);
		}
		return createElement(tag, { key: path }, children);
	};
	return Array.from(parsed.body.childNodes).map((node, index) => renderNode(node, String(index)));
}
function SetupCard({
	error,
	onRetry,
}: {
	error?: string;
	onRetry: () => void;
}) {
	return (
		<div className="flex h-full min-h-[420px] items-center justify-center bg-background p-6 text-foreground">
			<div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
				<div className="grid size-11 place-items-center rounded-xl border border-border bg-background text-accent">
					<MessageCircle size={20} />
				</div>
				<h1 className="mt-4 text-lg font-semibold">Подключение Chatwoot</h1>
				<p className="mt-1 text-sm leading-relaxed text-muted">
					Добавьте серверные переменные окружения в локальный `.env` и в Vercel.
				</p>
				<div className="my-4 space-y-2 rounded-xl border border-border bg-background p-3 font-mono text-xs">
					<div>CHATWOOT_BASE_URL=https://…</div>
					<div>CHATWOOT_ACCOUNT_ID=…</div>
					<div>CHATWOOT_ACCESS_TOKEN=…</div>
				</div>
				<p className="text-xs leading-relaxed text-muted">
					Токен используется только сервером SupportOS. Для личного назначения
					почта агента Chatwoot должна совпадать с почтой SupportOS.
				</p>
				{error && (
					<p role="alert" className="mt-3 text-xs text-red-400">
						{error}
					</p>
				)}
				<button
					type="button"
					onClick={onRetry}
					className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-surface-elevated"
				>
					<RefreshCw size={14} /> Проверить подключение
				</button>
			</div>
		</div>
	);
}
