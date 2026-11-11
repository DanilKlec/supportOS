import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Ban,
	CalendarDays,
	CheckCheck,
	ChevronDown,
	Columns2,
	Globe2,
	LoaderCircle,
	MessageCircle,
	MessageSquareText,
	PanelLeftClose,
	PanelLeftOpen,
	Plus,
	RefreshCw,
	Search,
	Send,
	Tag,
	UserRound,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Bind } from "@/entities/bind";
import { WebsiteDomainsDialog } from "@/features/chatwoot/WebsiteDomainsDialog";
import {
	type ChatwootAgent,
	type ChatwootContact,
	type ChatwootConversation,
	type ChatwootMessage,
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

type Scope = "mine" | "queue" | "history";
type LayoutMode = "single" | "columns" | "rows";
const languages: Array<{ id: LanguageCode; label: string }> = [
	{ id: "ru", label: "RU" },
	{ id: "en", label: "EN" },
	{ id: "de", label: "DE" },
	{ id: "pt", label: "PT" },
	{ id: "el", label: "GR" },
];

function rowsFrom(result: unknown): ChatwootConversation[] {
	if (Array.isArray(result)) return result as ChatwootConversation[];
	const value = result as {
		data?: { payload?: ChatwootConversation[] };
		payload?: ChatwootConversation[];
	};
	return value.data?.payload ?? value.payload ?? [];
}
function listFrom<T>(result: unknown): T[] {
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
	const [layout, setLayout] = useState<LayoutMode>("columns");
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
	const canManageSites = useAuthStore(
		(s) => s.session?.user.access?.permissions.includes("technical") === true,
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
	const request: ConversationSearch = {
		scope,
		status: scope === "history" ? "resolved" : "open",
		page: 1,
		...(inboxId ? { inboxId: Number(inboxId) } : {}),
		...(scope === "history" && agentId ? { agentId: Number(agentId) } : {}),
		...(label ? { label } : {}),
		...(scope === "history" && from ? { from } : {}),
		...(scope === "history" && to ? { to } : {}),
		...(search.trim() ? { query: search.trim() } : {}),
	};
	const conversations = useQuery({
		queryKey: ["chatwoot", "conversations", request],
		queryFn: () => chatwootService.conversations(request),
		enabled: connection.data?.configured === true,
		refetchInterval: 15000,
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
		<div className="flex h-full min-h-0 flex-col bg-background text-foreground">
			<header className="flex min-h-[62px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
				<div className="flex min-w-0 items-center gap-3">
					<div className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-accent">
						<MessageCircle size={18} />
					</div>
					<div className="min-w-0">
						<h1 className="truncate text-base font-semibold">
							Рабочее место агента
						</h1>
						<p className="truncate text-[11px] text-muted">
							Чаты, очередь и база быстрых ответов
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<div
						className={`hidden rounded-full px-2.5 py-1 text-[11px] sm:block ${presence.data?.current.accepting ? "bg-emerald-500/10 text-emerald-400" : "bg-surface-elevated text-muted"}`}
					>
						{presence.data?.current.accepting ? "Принимаю чаты" : "Не принимаю"}
					</div>
					<button
						type="button"
						disabled={
							accepting.isPending || presence.isLoading || !presence.data
						}
						onClick={() => accepting.mutate(!presence.data?.current.accepting)}
						className={`h-8 rounded-lg border px-3 text-xs font-medium disabled:opacity-50 ${presence.data?.current.accepting ? "border-emerald-500/30 text-emerald-400" : "border-border hover:bg-surface-elevated"}`}
					>
						{accepting.isPending
							? "Сохраняю…"
							: presence.data?.current.accepting
								? "Приём включён"
								: "Принимать чаты"}
					</button>
					{presence.data && (
						<span className="hidden text-[10px] text-muted xl:inline">
							{
								presence.data.team.filter(
									(member) => member.accepting && member.active,
								).length
							}{" "}
							агентов на приёме
						</span>
					)}
					{canManageSites && (
						<button
							type="button"
							onClick={() => setSitesOpen(true)}
							className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-surface-elevated"
							title="Настроить подключённые сайты"
						>
							<Globe2 size={14} />
							<span className="hidden lg:inline">Сайты</span>
						</button>
					)}
					<div className="hidden rounded-lg border border-border bg-surface p-1 sm:flex">
						<button
							type="button"
							onClick={() => setLayout("single")}
							title="Одна панель"
							className={`rounded-md p-1.5 ${layout === "single" ? "bg-surface-elevated" : "text-muted"}`}
						>
							<PanelLeftOpen size={15} />
						</button>
						<button
							type="button"
							onClick={() => setLayout("columns")}
							title="Разделить по вертикали"
							className={`rounded-md p-1.5 ${layout === "columns" ? "bg-surface-elevated" : "text-muted"}`}
						>
							<Columns2 size={15} />
						</button>
						<button
							type="button"
							onClick={() => setLayout("rows")}
							title="Разделить по горизонтали"
							className={`rounded-md px-2 py-1 text-xs ${layout === "rows" ? "bg-surface-elevated" : "text-muted"}`}
						>
							↕
						</button>
					</div>
					<button
						type="button"
						onClick={reload}
						title="Обновить"
						className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated"
					>
						<RefreshCw
							size={15}
							className={conversations.isFetching ? "animate-spin" : ""}
						/>
					</button>
				</div>
			</header>
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
			<div className="flex min-h-0 flex-1">
				{queueOpen && (
					<aside className="flex w-[min(360px,38vw)] min-w-[260px] shrink-0 flex-col border-r border-border bg-surface/40">
						<div className="border-b border-border p-3">
							<div className="grid grid-cols-3 rounded-lg border border-border bg-background p-1">
								{(["mine", "queue", "history"] as const).map((item) => (
									<button
										key={item}
										type="button"
										onClick={() => setScope(item)}
										className={`rounded-md px-1.5 py-2 text-xs font-medium ${scope === item ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}
									>
										{item === "mine"
											? "Мои"
											: item === "queue"
												? "Очередь"
												: "Архив"}
									</button>
								))}
							</div>
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
							{scope === "history" && (
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
								{scope === "mine"
									? "Мои активные"
									: scope === "queue"
										? "Нераспределённые"
										: "История диалогов"}
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
											scope === "queue"
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
				<main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
						className={`flex min-h-0 flex-1 ${layout === "rows" ? "flex-col" : "flex-row"}`}
					>
						<ConversationPane
							id={conversationIds[0]}
							agents={agents}
							inboxes={inboxes}
							labels={labels}
							binds={[...remoteBinds, ...binds]}
							language={language}
							onLanguage={setLanguage}
							active={activePane === 0}
							onActivate={() => setActivePane(0)}
							onClose={() => setConversationIds((ids) => [null, ids[1]])}
							onChanged={reload}
							onChoose={openEmptyPane}
						/>
						{layout !== "single" && (
							<div
								className={
									layout === "rows"
										? "h-px shrink-0 bg-border"
										: "w-px shrink-0 bg-border"
								}
							/>
						)}
						{layout !== "single" && (
							<ConversationPane
								id={conversationIds[1]}
								agents={agents}
								inboxes={inboxes}
								labels={labels}
								binds={[...remoteBinds, ...binds]}
								language={language}
								onLanguage={setLanguage}
								active={activePane === 1}
								onActivate={() => setActivePane(1)}
								onClose={() => setConversationIds((ids) => [ids[0], null])}
								onChanged={reload}
								onChoose={openEmptyPane}
							/>
						)}
					</div>
				</main>
			</div>
			{sitesOpen && (
				<WebsiteDomainsDialog onClose={() => setSitesOpen(false)} />
			)}
		</div>
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
	active,
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
}: {
	id: number | null;
	active: boolean;
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
}) {
	const client = useQueryClient();
	const [text, setText] = useState("");
	const [privateNote, setPrivateNote] = useState(false);
	const [assignOpen, setAssignOpen] = useState(false);
	const [bindSearch, setBindSearch] = useState("");
	const [showBinds, setShowBinds] = useState(false);
	const [tagOpen, setTagOpen] = useState(false);
	const [showCustomer, setShowCustomer] = useState(true);
	const [confirmBlock, setConfirmBlock] = useState(false);
	const query = useQuery({
		queryKey: ["chatwoot", "conversation", id],
		queryFn: () => chatwootService.conversation(id as number),
		enabled: id != null,
		refetchInterval: 10000,
	});
	const conversation = query.data as ChatwootConversation | undefined;
	const messages =
		conversation?.messages ?? query.data?.payload?.messages ?? [];
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
			onFocusCapture={onActivate}
			className={`flex min-h-0 min-w-0 flex-1 ${active ? "" : ""}`}
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
				<div className="flex min-h-8 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1.5">
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
					<div className="relative">
						<button
							type="button"
							onClick={() => setTagOpen(!tagOpen)}
							className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground"
						>
							<Tag size={11} /> Добавить тег
						</button>
						{tagOpen && (
							<div className="absolute left-0 top-7 z-20 max-h-48 w-48 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
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
				<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
					{query.isLoading ? (
						<div className="flex h-full items-center justify-center text-sm text-muted">
							<LoaderCircle className="mr-2 animate-spin" size={16} />
							Загружаем переписку
						</div>
					) : query.isError ? (
						<div className="m-auto max-w-sm rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
							{query.error instanceof Error
								? query.error.message
								: "Не удалось загрузить диалог"}
						</div>
					) : messages.length === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted">
							Сообщений пока нет
						</div>
					) : (
						<div className="mx-auto flex max-w-3xl flex-col gap-3">
							{[...messages]
								.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
								.map((message) => (
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
				<aside className="supportos-scroll hidden w-[230px] shrink-0 overflow-y-auto border-l border-border bg-surface/30 p-3 xl:block">
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
	const outgoing =
		message.message_type === 1 || message.message_type === "outgoing";
	return (
		<div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
			<article
				className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${message.private ? "border border-amber-500/20 bg-amber-500/5" : outgoing ? "bg-accent/15" : "border border-border bg-surface"}`}
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
					<div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
						{message.content}
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
