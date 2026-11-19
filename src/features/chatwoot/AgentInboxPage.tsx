import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Archive,
	Ban,
	CalendarDays,
	CheckCheck,
	ChevronDown,
	ExternalLink,
	FileText,
	Globe2,
	Headphones,
	LoaderCircle,
	LockKeyhole,
	MessageCircle,
	MessageSquareText,
	MessagesSquare,
	PanelLeftClose,
	PanelLeftOpen,
	Paperclip,
	Plus,
	RefreshCw,
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
import { createElement, type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Bind } from "@/entities/bind";
import { WebsiteDomainsDialog } from "@/features/chatwoot/WebsiteDomainsDialog";
import { ChatwootWebhookSettingsDialog } from "@/features/chatwoot/ChatwootWebhookSettingsDialog";
import { ChatDirectorySettingsDialog } from "@/features/chatwoot/ChatDirectorySettingsDialog";
import { CustomAttributesDialog } from "@/features/chatwoot/CustomAttributesDialog";
import { subscribeToChatwootEvents } from "@/services/chatwoot-realtime";
import {
	type ChatwootAgent,
	type ChatwootCoachingNote,
	type ChatwootContact,
	type ChatwootConversation,
	type ChatwootCustomAttributeDefinition,
	type ChatwootInbox,
	type ChatwootMessage,
	type ChatwootPriority,
	type ChatwootStatus,
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
import { ChatOperationsPage } from "./ChatOperationsPage";
import { ActiveChatsTable } from "./ActiveChatsTable";
import { useChatPopover } from "./useChatPopover";
import { InboxModal } from "./InboxModal";
import { CoachingComposer, type CoachingRecipient, CoachingThreadTabs, ObservationHeader } from "./ChatCoaching";
import { crmWorkspaceUrl } from "@/widgets/CRM/CRMFrame";
import "./inbox-workspace.css";

type Scope = "mine" | "queue" | "history" | "active";
type WorkspaceSection = "inbox" | "team" | "archive" | "supervisor";
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
function withoutConversation(result: unknown, id: number) {
	if (Array.isArray(result)) return result.filter((item) => (item as ChatwootConversation).id !== id);
	if (!result || typeof result !== "object") return result;
	const value = result as {
		data?: { payload?: ChatwootConversation[]; [key: string]: unknown };
		payload?: ChatwootConversation[];
		[key: string]: unknown;
	};
	if (Array.isArray(value.data?.payload))
		return { ...value, data: { ...value.data, payload: value.data.payload.filter((item) => item.id !== id) } };
	if (Array.isArray(value.payload)) return { ...value, payload: value.payload.filter((item) => item.id !== id) };
	return result;
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
	const parentClient = useQueryClient();
	const identity = useAuthStore((state) => {
		const session = state.session;
		const access = session?.user.access;
		return session ? `${session.user.id}:${session.sessionId ?? ""}:${access?.version ?? ""}:${access?.roles.map((role) => role.id).join(",") ?? ""}` : "";
	});
	return <InboxSession key={identity} parentClient={parentClient} />;
}

function InboxSession({ parentClient }: { parentClient: QueryClient }) {
	const [client] = useState(() => new QueryClient({ defaultOptions: parentClient.getDefaultOptions() }));
	useEffect(() => () => client.clear(), [client]);
	return <QueryClientProvider client={client}><AgentInboxWorkspace /></QueryClientProvider>;
}

type ChatDraft = { text: string; privateNote: boolean; coachTo?: CoachingRecipient };

function AgentInboxWorkspace() {
	const client = useQueryClient();
	const [scope, setScope] = useState<Scope>("mine");
	const [activeSection, setActiveSection] = useState<WorkspaceSection>("inbox");
	const [railCollapsed, setRailCollapsed] = useState(false);
	const [listWidth, setListWidth] = useState(() => {
		try { return Number(localStorage.getItem("supportos:chatwoot:list-width")) || 320; } catch { return 320; }
	});
	const [activePage, setActivePage] = useState(1);
	const [conversationId, setConversationId] = useState<number | null>(null);
	const drafts = useRef(new Map<number, ChatDraft>());
	const [supervisionId, setSupervisionId] = useState<number | null>(null);
	const [manageObservedChat, setManageObservedChat] = useState(false);
	const observationTrigger = useRef<HTMLElement | null>(null);
	const supervisionDrafts = useRef(new Map<number, ChatDraft>());
	const [realtimeSubscribed, setRealtimeSubscribed] = useState(false);
	const [coachingRealtimeConnected, setCoachingRealtimeConnected] = useState(false);
	const [webhookSeen, setWebhookSeen] = useState(false);
	const [search, setSearch] = useState("");
	const [queueOpen, setQueueOpen] = useState(true);
	const [inboxId, setInboxId] = useState("");
	const [agentId, setAgentId] = useState("");
	const [label, setLabel] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [historyStatus, setHistoryStatus] = useState<"resolved" | "snoozed">("resolved");
	const [sitesOpen, setSitesOpen] = useState(false);
	const [webhookSettingsOpen, setWebhookSettingsOpen] = useState(false);
	const [directorySettingsOpen, setDirectorySettingsOpen] = useState(false);
	const [attributesOpen, setAttributesOpen] = useState(false);
	const [profileOpen, setProfileOpen] = useState(false);
	const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
	const [soundEnabled, setSoundEnabled] = useState(() => {
		try { return localStorage.getItem("supportos:chatwoot:sound") !== "off"; } catch { return true; }
	});
	const audioContext = useRef<AudioContext | null>(null);
	const seenConversationActivity = useRef<Map<number, number | string> | null>(null);
	const user = useAuthStore((s) => s.session?.user);
	const accessToken = useAuthStore((s) => s.session?.accessToken);
	const canWork = useAuthStore(
		(s) => s.session?.user.access?.permissions.includes("work") === true,
	);
	const binds = useKnowledgeStore((s) => s.binds);
	const remoteBinds = useKnowledgeStore((s) => s.remoteBinds);
	const language = useKnowledgeStore((s) => s.language);
	const setLanguage = useKnowledgeStore((s) => s.setLanguage);
	const connection = useQuery({
		queryKey: ["chatwoot", "health", user?.email],
		queryFn: chatwootService.health,
		retry: false,
	});
	const capabilities = connection.data?.capabilities;
	const canManageSites = capabilities?.manageProjects === true;
	const canManageChatCapacity = capabilities?.manageRouting === true;
	const canManageWebhookSettings = capabilities?.manageWebhooks === true;
	const canSupervise = capabilities?.supervise === true;
	const managingObservedChat = canSupervise && capabilities?.manageAllChats === true && manageObservedChat;
	const realtimeConnected = realtimeSubscribed && (webhookSeen || Boolean(connection.data?.lastWebhookAt));
	useEffect(() => {
		if (!connection.data?.configured || !accessToken || !user?.id || !(canWork || canSupervise)) {
			setRealtimeSubscribed(false);
			setCoachingRealtimeConnected(false);
			return;
		}
		let refreshTimer: number | undefined;
		let disposed = false;
		const scheduleRefresh = () => {
			if (refreshTimer !== undefined) return;
			refreshTimer = window.setTimeout(() => {
				refreshTimer = undefined;
				void client.invalidateQueries({ queryKey: ["chatwoot", "conversations"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "active-overview"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "conversation-counts"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "messages"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "conversation"] }, { cancelRefetch: false });
			}, 650);
		};
		const unsubscribe = subscribeToChatwootEvents(
			accessToken,
			() => {
				if (disposed) return;
				setWebhookSeen(true);
				scheduleRefresh();
			},
			(status) => {
				if (disposed) return;
				setRealtimeSubscribed(status === "SUBSCRIBED");
				if (status === "SUBSCRIBED") scheduleRefresh();
			},
			{
				userId: user.id,
				onNote: () => {
					void client.invalidateQueries({ queryKey: ["chatwoot", "coaching-notes"] });
				},
				onStatus: (status) => {
					if (disposed) return;
					setCoachingRealtimeConnected(status === "SUBSCRIBED");
					if (status === "SUBSCRIBED")
						void client.invalidateQueries({ queryKey: ["chatwoot", "coaching-notes"] });
				},
			},
		);
		return () => {
			disposed = true;
			if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
			unsubscribe();
		};
	}, [connection.data?.configured, accessToken, user?.id, canWork, canSupervise, client]);
	const directory = useQuery({
		queryKey: ["chatwoot", "directory"],
		queryFn: chatwootService.inboxDirectory,
		enabled: connection.data?.configured === true,
		staleTime: 30000,
		refetchInterval: 30000,
	});
	const presence = useQuery({
		queryKey: ["chatwoot", "presence"],
		queryFn: () => chatwootService.presence(),
		enabled: connection.data?.configured === true,
		refetchInterval: 5000,
	});
	const displayedScope: Scope = activeSection === "archive" ? "history" : scope;
	const watching = useQuery({
		queryKey: ["chatwoot", "supervision"],
		queryFn: chatwootService.supervision,
		enabled: connection.data?.configured === true && canSupervise && displayedScope === "active",
		refetchInterval: 30000,
		retry: false,
	});
	const changeWatch = useMutation({
		mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => chatwootService.setSupervision(id, enabled),
		onSuccess: ({ id, watching }) => {
			client.setQueryData<{ ids: number[] }>(["chatwoot", "supervision"], (cached) => {
				const ids = new Set(cached?.ids ?? []);
				if (watching) ids.add(id);
				else ids.delete(id);
				return { ids: [...ids] };
			});
			void client.invalidateQueries({ queryKey: ["chatwoot", "supervision"] });
			void client.invalidateQueries({ queryKey: ["chatwoot", "active-overview"] });
			if (!watching && id === supervisionId) closeObservation();
		},
	});
	const watched = new Set(watching.data?.ids ?? []);
	const queueInbox = displayedScope === "queue" && !canSupervise
		? inboxId || String(directory.data?.inboxes[0]?.id ?? "")
		: inboxId;
	const request: ConversationSearch = {
		scope: displayedScope,
		status: displayedScope === "history" ? historyStatus : "open",
		page: activePage,
		...(queueInbox ? { inboxId: Number(queueInbox) } : {}),
		...(displayedScope === "history" && canSupervise && agentId ? { agentId: Number(agentId) } : {}),
		...(label ? { label } : {}),
		...(displayedScope === "history" && from ? { from } : {}),
		...(displayedScope === "history" && to ? { to } : {}),
		...(search.trim() ? { query: search.trim() } : {}),
	};
	useEffect(() => {
		setActivePage(1);
	}, [activeSection, scope, inboxId, agentId, label, from, to, search, historyStatus]);
	const conversations = useQuery({
		queryKey: ["chatwoot", "conversations", request],
		queryFn: () => chatwootService.conversations(request),
		enabled: connection.data?.configured === true && displayedScope !== "active" && (activeSection === "inbox" || activeSection === "archive"),
		staleTime: displayedScope === "queue" ? 2000 : 0,
		refetchInterval: displayedScope === "history" ? 20000 : realtimeConnected ? 12000 : 3000,
		retry: 1,
	});
	const conversationCounts = useQuery({
		queryKey: ["chatwoot", "conversation-counts", inboxId, user?.email],
		queryFn: () => chatwootService.conversationCounts(inboxId ? Number(inboxId) : undefined),
		enabled: connection.data?.configured === true && activeSection === "inbox",
		staleTime: 5000,
		refetchInterval: realtimeConnected ? 12000 : 5000,
		retry: 1,
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
	const chatCapacity = useMutation({
		mutationFn: ({ agentId, maxActiveChats }: { agentId: number; maxActiveChats: number }) => chatwootService.setAgentCapacity(agentId, maxActiveChats),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey: ["chatwoot", "directory"] });
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversations"] });
		},
	});
	const takeConversation = useMutation({
		mutationFn: chatwootService.take,
		onMutate: async (id) => {
			await client.cancelQueries({ queryKey: ["chatwoot", "conversations"] });
			const queued = client.getQueriesData({ queryKey: ["chatwoot", "conversations"] })
				.filter(([key]) => (key[2] as ConversationSearch | undefined)?.scope === "queue");
			const counts = client.getQueriesData({ queryKey: ["chatwoot", "conversation-counts"] });
			for (const [key, cached] of queued) client.setQueryData(key, withoutConversation(cached, id));
			client.setQueriesData({ queryKey: ["chatwoot", "conversation-counts"] }, (cached) => {
				if (!cached || typeof cached !== "object") return cached;
				const value = cached as { queueCount?: number | null };
				return value.queueCount == null ? cached : { ...value, queueCount: Math.max(0, value.queueCount - 1) };
			});
			return { queued, counts };
		},
		onError: (_error, _id, context) => {
			for (const [key, cached] of context?.queued ?? []) client.setQueryData(key, cached);
			for (const [key, cached] of context?.counts ?? []) client.setQueryData(key, cached);
		},
		onSettled: () => {
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversations"] });
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversation-counts"] });
			void client.invalidateQueries({ queryKey: ["chatwoot", "presence"] });
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
		setConversationId(id);
		if (window.matchMedia("(width < 768px)").matches) setQueueOpen(false);
	};
	const closeConversation = () => {
		setConversationId(null);
		if (window.matchMedia("(width < 768px)").matches) setQueueOpen(true);
	};
	const openObservation = (id: number) => {
		setManageObservedChat(false);
		setSupervisionId(id);
	};
	const startObservation = (id: number) => {
		observationTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		openObservation(id);
		if (!watched.has(id) && !changeWatch.isPending) changeWatch.mutate({ id, enabled: true });
	};
	const closeObservation = () => {
		setManageObservedChat(false);
		setSupervisionId(null);
		const trigger = observationTrigger.current;
		observationTrigger.current = null;
		if (trigger) window.requestAnimationFrame(() => { if (trigger.isConnected) trigger.focus({ preventScroll: true }); });
	};
	const reload = () => {
		void client.invalidateQueries({ queryKey: ["chatwoot", "conversations"] });
		void client.invalidateQueries({ queryKey: ["chatwoot", "active-overview"] });
		void client.invalidateQueries({ queryKey: ["chatwoot", "conversation-counts"] });
		void client.invalidateQueries({ queryKey: ["chatwoot", "presence"] });
	};
	const openEmptyPane = () => {
		setQueueOpen(true);
	};
	const selectSection = (section: WorkspaceSection) => {
		setActiveSection(section);
		setProfileOpen(false);
		if (section === "inbox") setScope("mine");
		if (section === "archive") setScope("history");
		if (window.matchMedia("(width < 768px)").matches) setQueueOpen(true);
		setActivePage(1);
	};
	const selectScope = (next: Scope) => {
		setScope(next);
		setActivePage(1);
		if (next !== "active" && window.matchMedia("(width < 768px)").matches) setQueueOpen(true);
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
	const prefetchQueue = () => {
		if (scope === "queue" || activeSection !== "inbox") return;
		const queueRequest: ConversationSearch = {
			scope: "queue",
			status: "open",
			...(inboxId ? { inboxId: Number(inboxId) } : {}),
			...(label ? { label } : {}),
			...(search.trim() ? { query: search.trim() } : {}),
		};
		void client.prefetchQuery({
			queryKey: ["chatwoot", "conversations", queueRequest],
			queryFn: () => chatwootService.conversations(queueRequest),
			staleTime: 8000,
		});
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
		<div className="supportos-inbox flex h-full min-h-0 w-full text-foreground" onPointerDownCapture={unlockAudio}>
			<InboxRail
				activeSection={activeSection}
				collapsed={railCollapsed}
				onToggleCollapsed={() => setRailCollapsed((value) => !value)}
				userEmail={user?.email ?? ""}
				accessRole={capabilities?.role}
				accepting={presence.data?.current.accepting === true}
				acceptingPending={accepting.isPending || presence.isLoading || !presence.data}
				profileOpen={profileOpen}
				soundEnabled={soundEnabled}
				onAccept={() => accepting.mutate(!presence.data?.current.accepting)}
				onSelect={selectSection}
				canSupervise={canSupervise}
				onToggleProfile={() => setProfileOpen(!profileOpen)}
				onToggleSound={toggleSound}
				onOpenSettings={() => { setAgentSettingsOpen(true); setProfileOpen(false); }}
				onManageSites={canManageSites ? () => { setSitesOpen(true); setProfileOpen(false); } : undefined}
				onManageAttributes={canManageSites ? () => { setAttributesOpen(true); setProfileOpen(false); } : undefined}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{(presence.isError || accepting.isError || chatCapacity.isError) && (
				<div
					role="alert"
					className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs chat-text-warning"
				>
					{chatCapacity.error instanceof Error
						? chatCapacity.error.message
						: presence.error instanceof Error
						? presence.error.message
						: accepting.error instanceof Error
							? accepting.error.message
							: "Не удалось проверить статус агента"}
				</div>
			)}
			<div className="flex min-h-0 flex-1 flex-col">
				{activeSection === "inbox" && <div className="chat-scope-bar flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto px-1.5 py-2 sm:gap-1.5 sm:px-3" aria-label="Списки диалогов">
					<div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
					{(["mine", "queue", ...(canSupervise ? ["active" as const] : [])] as const).map((item) => (
						<button key={item} type="button" aria-pressed={scope === item} onPointerEnter={item === "queue" ? prefetchQueue : undefined} onFocus={item === "queue" ? prefetchQueue : undefined} onClick={() => selectScope(item)} className={`shrink-0 whitespace-nowrap rounded-lg px-1.5 py-2 text-xs font-medium transition sm:px-3 ${scope === item ? "bg-surface-elevated text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}>
							{item === "mine" ? "Мои" : item === "queue" ? "Очередь" : "Активные"}
							{item === "mine" && <span aria-label={`${conversationCounts.data?.mineCount ?? 0} моих чатов`} className="ml-1.5 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-muted">{conversationCounts.isLoading ? "…" : conversationCounts.isError || conversationCounts.data?.mineCount == null ? "—" : conversationCounts.data.mineCount}</span>}
							{item === "queue" && <span aria-label={conversationCounts.data?.queueCount == null ? "Количество чатов в очереди недоступно" : `${conversationCounts.data.queueCount} чатов в очереди`} className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] tabular-nums chat-text-warning">{conversationCounts.isLoading ? "…" : conversationCounts.isError ? "—" : conversationCounts.data?.queueCount ?? "—"}</span>}
							{item === "active" && <span className="ml-1.5 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-muted">{conversationCounts.isLoading ? "…" : conversationCounts.isError || conversationCounts.data?.activeCount == null ? "—" : conversationCounts.data.activeCount}</span>}
						</button>
					))}
					</div>
					<span className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] ${realtimeConnected ? "bg-emerald-500/10 chat-text-success" : "bg-surface-elevated text-muted"}`} role="status" title={realtimeConnected ? "Обновляется онлайн" : "Автообновление"}>
						<i aria-hidden="true" className={`size-1.5 rounded-full ${realtimeConnected ? "bg-emerald-400" : "bg-zinc-500"}`} />
						<span className="sr-only md:not-sr-only">{realtimeConnected ? "Обновляется онлайн" : "Автообновление"}</span>
					</span>
				</div>}
				<div className="flex min-h-0 flex-1">
				{activeSection === "supervisor" ? (
					<ChatOperationsPage agents={agents} inboxes={inboxes} canEdit={canManageChatCapacity}
						onOpen={(id) => { selectSection("inbox"); setScope("active"); startObservation(id); }} />
				) : activeSection === "team" ? (
					<TeamWorkspace
						agents={agents}
						teams={directory.data?.teams ?? []}
						presence={directory.data?.presence ?? []}
						currentAgentId={presence.data?.current.agentId}
						canManageChatCapacity={canManageChatCapacity}
						canManageWebhookSettings={canManageWebhookSettings}
						onManageWebhooks={() => setWebhookSettingsOpen(true)}
						onManageDirectory={canManageSites ? () => setDirectorySettingsOpen(true) : undefined}
						capacityPending={chatCapacity.isPending}
						onSetCapacity={(agentId, maxActiveChats) => chatCapacity.mutate({ agentId, maxActiveChats })}
						loading={directory.isLoading}
						error={directory.error?.message}
						onRetry={() => void directory.refetch()}
					/>
				) : <>
				{queueOpen && scope !== "active" && (
					<aside aria-label={displayedScope === "history" ? "Архив диалогов" : "Список диалогов"} style={{ "--chat-list-width": `${listWidth}px` } as CSSProperties} className="chat-list flex w-full min-w-0 shrink-0 flex-col border-r border-border md:w-[var(--chat-list-width)] md:min-w-[260px] md:max-w-[min(520px,45%)]">
						<div className="border-b border-border p-3">
							<div className="relative">
								<Search
									size={14}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
								/>
								<input
									value={search}
									aria-label="Поиск диалогов"
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Игрок, сообщение или №"
									className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted focus:border-accent"
								/>
							</div>
							<div className="mt-2 grid grid-cols-2 gap-2">
								<select
									value={queueInbox}
									onChange={(event) => setInboxId(event.target.value)}
									className="h-8 min-w-0 rounded-lg border border-border bg-background px-2 text-xs"
								>
									{(displayedScope !== "queue" || canSupervise || !inboxes.length) && <option value="">{displayedScope === "queue" && !canSupervise ? "Нет доступных проектов" : "Все проекты"}</option>}
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
									<select aria-label="Статус в архиве" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value === "snoozed" ? "snoozed" : "resolved")} className="col-span-2 h-8 rounded-lg border border-border bg-background px-2 text-xs">
										<option value="resolved">Завершённые</option><option value="snoozed">Отложенные</option>
									</select>
									{canSupervise && <select
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
									</select>}
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
							<span>{displayedScope === "queue" ? conversationCounts.data?.queueCount ?? "—" : rows.length}</span>
						</div>
						{takeConversation.isError && (
							<div role="alert" className="border-b border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] chat-text-danger">
								{takeConversation.error instanceof Error ? takeConversation.error.message : "Не удалось взять чат"}
							</div>
						)}
						<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto pb-3">
							{conversations.isLoading ? (
								<div className="p-6 text-center text-sm text-muted">
									<LoaderCircle
										className="mx-auto mb-2 animate-spin"
										size={18}
									/>
									Загружаем диалоги
								</div>
							) : conversations.isError && rows.length === 0 ? (
								<div role="alert" className="space-y-3 p-5 text-center text-sm chat-text-danger">
									<p>
									{conversations.error instanceof Error
										? conversations.error.message
										: "Не удалось загрузить очередь"}
									</p>
									<button type="button" onClick={() => void conversations.refetch()} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-elevated">Повторить</button>
								</div>
							) : rows.length === 0 ? (
								<div className="p-8 text-center text-sm text-muted">
									{search || label || inboxId || from || to ? "По выбранным условиям диалогов нет" : displayedScope === "queue" ? "Очередь пуста" : displayedScope === "history" ? "В архиве пока нет диалогов" : "Нет назначенных диалогов"}
								</div>
							) : (
								rows.map((item) => (
									<ConversationRow
										key={item.id}
										conversation={item}
										projectName={item.meta?.inbox?.name ?? inboxes.find((project) => project.id === item.inbox_id)?.name}
										active={conversationId === item.id}
										onClick={() => placeConversation(item.id)}
										onTake={
											displayedScope === "queue"
												? () => takeConversation.mutate(item.id)
												: undefined
										}
										taking={takeConversation.isPending && takeConversation.variables === item.id}
									/>
								))
							)}
						</div>
						{(activePage > 1 || conversations.data?.hasMore === true) && (
							<footer className="flex shrink-0 items-center justify-between border-t border-border px-3 py-2 text-[10px] text-muted">
								<span>Страница {activePage} · {rows.length} диалогов</span>
								<div className="flex items-center gap-1.5">
									<button type="button" disabled={activePage <= 1 || conversations.isFetching} onClick={() => setActivePage((page) => Math.max(1, page - 1))} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Назад</button>
									<button type="button" disabled={conversations.data?.hasMore !== true || conversations.isFetching} onClick={() => setActivePage((page) => page + 1)} className="rounded-md border border-border px-2 py-1 disabled:opacity-40">Дальше</button>
								</div>
							</footer>
						)}
					</aside>
				)}
				{queueOpen && scope !== "active" && <div className="hidden md:flex"><ResizeHandle axis="x" label="Изменить ширину списка" value={listWidth} min={260} max={520} onResize={resizeList} /></div>}
				<main className={`relative min-h-0 min-w-0 flex-1 flex-col ${queueOpen && scope !== "active" ? "hidden md:flex" : "flex"}`}>
					{scope === "active" && canSupervise ? (
						<div className="chat-observation-layout relative flex min-h-0 min-w-0 flex-1" data-observation-open={supervisionId !== null}>
							<ActiveChatsTable agents={agents} inboxes={inboxes} teams={directory.data?.teams ?? []}
								labels={labels} realtime={realtimeConnected} selectedId={supervisionId} watched={watched}
								watchingError={(changeWatch.error ?? watching.error)?.message}
								changingId={changeWatch.isPending ? changeWatch.variables?.id : undefined}
								onOpen={startObservation}
								onStop={(id) => changeWatch.mutate({ id, enabled: false })}
							/>
							{supervisionId !== null && (
								<aside aria-label="Наблюдение за диалогом" className="chat-observation-panel absolute inset-0 z-30 flex min-h-0 min-w-0 flex-col border-l border-border bg-surface shadow-xl xl:static xl:w-[45%] xl:min-w-[460px] xl:shrink-0 xl:shadow-none">
									<ObservationHeader managing={managingObservedChat} canManage={capabilities?.manageAllChats === true}
										watching={watched.has(supervisionId)} watchPending={changeWatch.isPending}
										onMode={() => setManageObservedChat(!manageObservedChat)}
										onStop={() => changeWatch.mutate({ id: supervisionId, enabled: false })}
										onClose={closeObservation} />
									{changeWatch.isError && changeWatch.variables?.id === supervisionId && (
										<p role="alert" className="border-b border-border px-3 py-2 text-xs chat-text-danger">{changeWatch.error.message}</p>
									)}
									<ConversationPane key={`${supervisionId}/${managingObservedChat}`} id={supervisionId}
										supervising={!managingObservedChat} docked
										draft={(managingObservedChat ? drafts : supervisionDrafts).current.get(supervisionId)}
										onDraft={(id, draft) => {
											const currentDrafts = (managingObservedChat ? drafts : supervisionDrafts).current;
											if (draft.text) currentDrafts.set(id, draft);
											else currentDrafts.delete(id);
										}}
										onOpenRelated={openObservation} realtimeConnected={realtimeConnected}
										coachingRealtimeConnected={coachingRealtimeConnected}
										agents={agents} teams={directory.data?.teams ?? []} inboxes={inboxes} labels={labels}
										binds={managingObservedChat ? [...remoteBinds, ...binds] : []} language={language} onLanguage={setLanguage}
										onClose={closeObservation} onChanged={reload} onChoose={openEmptyPane}
									/>
								</aside>
							)}
						</div>
					) : <>
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
					<div className="flex min-h-0 flex-1 overflow-hidden">
						<ConversationPane
							key={conversationId ?? "empty"}
							id={conversationId}
							draft={conversationId == null ? undefined : drafts.current.get(conversationId)}
							onDraft={(id, draft) => {
								if (draft.text) drafts.current.set(id, draft);
								else drafts.current.delete(id);
							}}
							onOpenRelated={placeConversation}
							realtimeConnected={realtimeConnected}
							coachingRealtimeConnected={coachingRealtimeConnected}
							agents={agents}
							teams={directory.data?.teams ?? []}
							inboxes={inboxes}
							labels={labels}
							binds={[...remoteBinds, ...binds]}
							language={language}
							onLanguage={setLanguage}
							onClose={closeConversation}
							onChanged={reload}
							onChoose={openEmptyPane}
						/>
					</div>
					</>}
				</main>
				</>}
			</div>
			</div>
			</div>
			{sitesOpen && canManageSites && (
				<WebsiteDomainsDialog onClose={() => setSitesOpen(false)} canDelete={capabilities?.deleteProjects === true} />
			)}
			{webhookSettingsOpen && canManageWebhookSettings && (
				<ChatwootWebhookSettingsDialog onClose={() => setWebhookSettingsOpen(false)} />
			)}
			{attributesOpen && canManageSites && (
				<CustomAttributesDialog onClose={() => setAttributesOpen(false)} />
			)}
			{directorySettingsOpen && canManageSites && <ChatDirectorySettingsDialog agents={agents} onClose={() => setDirectorySettingsOpen(false)} />}
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

function ResizeHandle({ axis, label, value, min = 0, max = 100, onResize, fromEnd = false }: {
	axis: ResizeAxis;
	label: string;
	value: number;
	min?: number;
	max?: number;
	onResize: (coordinate: number) => void;
	fromEnd?: boolean;
}) {
	const drag = useRef<{ origin: number; value: number } | null>(null);
	const resizeTo = (next: number) => onResize(Math.min(max, Math.max(min, next)));
	return (
		<hr
			aria-label={label}
			aria-orientation={axis === "x" ? "vertical" : "horizontal"}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={Math.round(value)}
			tabIndex={0}
			onKeyDown={(event) => {
				const backward = axis === "x" ? "ArrowLeft" : "ArrowUp";
				const forward = axis === "x" ? "ArrowRight" : "ArrowDown";
				if (![backward, forward, "Home", "End"].includes(event.key)) return;
				event.preventDefault();
				if (event.key === "Home" || event.key === "End") {
					resizeTo(event.key === "Home" ? min : max);
					return;
				}
				resizeTo(value + (event.key === backward ? -16 : 16) * (fromEnd ? -1 : 1));
			}}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				drag.current = { origin: axis === "x" ? event.clientX : event.clientY, value };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
				const offset = (axis === "x" ? event.clientX : event.clientY) - drag.current.origin;
				resizeTo(drag.current.value + offset * (fromEnd ? -1 : 1));
			}}
			onLostPointerCapture={() => { drag.current = null; }}
			className={`m-0 shrink-0 touch-none self-stretch border-0 bg-transparent p-0 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 ${axis === "x" ? "h-auto w-2 cursor-col-resize" : "h-2 w-auto cursor-row-resize"}`}
		/>
	);
}

function InboxRail({ activeSection, collapsed, onToggleCollapsed, userEmail, accessRole, accepting, acceptingPending, profileOpen, soundEnabled, onAccept, onSelect, canSupervise, onToggleProfile, onToggleSound, onOpenSettings, onManageSites, onManageAttributes }: {
	activeSection: WorkspaceSection;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	userEmail: string;
	accessRole?: "support" | "shift" | "qc" | "admin" | "creator";
	accepting: boolean;
	acceptingPending: boolean;
	profileOpen: boolean;
	soundEnabled: boolean;
	onAccept: () => void;
	onSelect: (section: WorkspaceSection) => void;
	canSupervise: boolean;
	onToggleProfile: () => void;
	onToggleSound: () => void;
	onOpenSettings: () => void;
	onManageSites?: () => void;
	onManageAttributes?: () => void;
}) {
	const profile = useChatPopover<HTMLElement>(profileOpen, onToggleProfile);
	const items: Array<{ id: WorkspaceSection; label: string; icon: typeof MessagesSquare }> = [
		{ id: "inbox", label: "Диалоги", icon: MessagesSquare },
		{ id: "team", label: "Команда", icon: UsersRound },
		{ id: "archive", label: "Архив", icon: Archive },
	];
	if (canSupervise) items.push({ id: "supervisor", label: "Руководитель", icon: Headphones });
	return (
		<aside ref={profile} data-compact={collapsed} className="chat-rail relative z-40 flex shrink-0 flex-col items-center border-r border-border py-2 transition-[width] duration-200 md:py-3">
			<button type="button" aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"} title={collapsed ? "Развернуть меню" : "Свернуть меню"} onClick={onToggleCollapsed} className="chat-rail-toggle mb-1 grid size-8 place-items-center self-end rounded-lg text-muted hover:bg-surface-elevated md:mr-2">
				{collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
			</button>
			<nav aria-label="Рабочие разделы чатов" className="flex w-full flex-col gap-1 px-1.5 md:px-2">
				{items.map(({ id, label, icon: Icon }) => (
					<button key={id} type="button" title={label} aria-label={label} aria-current={activeSection === id ? "page" : undefined} onClick={() => { if (profileOpen) onToggleProfile(); onSelect(id); }} className={`flex h-10 w-full items-center gap-2.5 rounded-lg text-left text-xs font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground ${collapsed ? "justify-center" : "px-2.5"}`}>
						<Icon size={16} className="shrink-0" />
						{!collapsed && <span className="chat-rail-caption truncate">{label}</span>}
					</button>
				))}
			</nav>
			<div className={`chat-rail-footer mt-auto flex w-full items-center gap-2 border-t border-border px-2 pt-2 ${collapsed ? "justify-center" : ""}`}>
				<button type="button" title="Профиль агента" aria-label="Профиль агента" aria-expanded={profileOpen} onClick={onToggleProfile} className="relative grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-xs font-semibold hover:border-accent/60">
					{initials(userEmail)}
					<span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface ${accepting ? "bg-emerald-400" : "bg-muted"}`} />
				</button>
				{!collapsed && <button type="button" onClick={onToggleProfile} className="chat-rail-copy min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{userEmail.split("@")[0] || "Агент"}</span><span className="block truncate text-[11px] text-muted">{accepting ? "Принимаю чаты" : "Приём выключен"}</span></button>}
			</div>
			{profileOpen && (
				<div className="chat-rail-profile supportos-scroll absolute bottom-2 left-[calc(100%+8px)] z-50 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-xl">
					<div className="border-b border-border px-3 py-2.5">
						<div className="text-xs font-semibold">Настройки агента</div>
						<div className="mt-1 truncate text-[11px] text-muted">{userEmail || "Аккаунт SupportOS"}</div>
						{accessRole && <div className="mt-1 text-[10px] font-medium text-accent">Роль SupportOS · {({ support: "Support", shift: "Shift", qc: "QC", admin: "Admin", creator: "Creator" })[accessRole]}</div>}
					</div>
					<button type="button" role="switch" aria-checked={accepting} disabled={acceptingPending} onClick={onAccept} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left hover:bg-surface-elevated disabled:opacity-50">
						<span><span className="block text-xs font-medium">Приём чатов</span><span className="mt-0.5 block text-[10px] text-muted">{accepting ? "Вы в очереди распределения" : "Новые диалоги не назначаются"}</span></span>
						<span className={`h-5 w-9 rounded-full p-0.5 transition ${accepting ? "bg-emerald-500" : "bg-surface-elevated"}`}><span className={`block size-4 rounded-full bg-white transition ${accepting ? "translate-x-4" : ""}`} /></span>
					</button>
					<button type="button" onClick={onToggleSound} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs hover:bg-surface-elevated">
						{soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />} Звуковые уведомления {soundEnabled ? "включены" : "выключены"}
					</button>
					<button type="button" onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs hover:bg-surface-elevated"><Settings2 size={15} /> Личные настройки</button>
					{onManageSites && <button type="button" onClick={onManageSites} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs hover:bg-surface-elevated"><Globe2 size={15} /> Источники чатов</button>}
					{onManageAttributes && <button type="button" onClick={onManageAttributes} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs hover:bg-surface-elevated"><Settings2 size={15} /> Поля Chatwoot</button>}
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
		<InboxModal labelledBy="agent-settings-title" className="max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-xl sm:p-5" onClose={onClose}>
				<div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 id="agent-settings-title" className="text-base font-semibold">Настройки агента</h2><p className="mt-1 truncate text-xs text-muted">{email || "Личные параметры рабочего места"}</p></div><button type="button" aria-label="Закрыть настройки агента" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-elevated"><X size={16} /></button></div>
				<div className="mt-4 divide-y divide-border rounded-xl border border-border">
					<button type="button" disabled={acceptingPending} onClick={onAccept} className="flex w-full items-center justify-between gap-4 p-3 text-left disabled:opacity-50"><span><span className="block text-xs font-medium">Принимать новые чаты</span><span className="mt-1 block text-[11px] text-muted">{accepting ? "Включено — очередь распределяется автоматически" : "Выключено — новые диалоги не назначаются"}</span></span><span className={`h-5 w-9 shrink-0 rounded-full p-0.5 ${accepting ? "bg-emerald-500" : "bg-surface-elevated"}`}><span className={`block size-4 rounded-full bg-white ${accepting ? "translate-x-4" : ""}`} /></span></button>
					<button type="button" onClick={onToggleSound} className="flex w-full items-center justify-between gap-4 p-3 text-left"><span><span className="block text-xs font-medium">Звуковые уведомления</span><span className="mt-1 block text-[11px] text-muted">Сигнал при новых событиях в диалогах</span></span>{soundEnabled ? <Volume2 size={16} className="text-accent" /> : <VolumeX size={16} className="text-muted" />}</button>
				</div>
				<div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">Готово</button></div>
		</InboxModal>
	);
}

function TeamWorkspace({ agents, teams, presence, currentAgentId, canManageChatCapacity, canManageWebhookSettings, onManageWebhooks, onManageDirectory, capacityPending, onSetCapacity, loading, error, onRetry }: {
	agents: ChatwootAgent[];
	teams: ChatwootTeam[];
	presence: Array<{ chatwoot_agent_id: number; accepting: boolean; max_active_chats?: number; heartbeat_at: string }>;
	currentAgentId?: number;
	canManageChatCapacity: boolean;
	canManageWebhookSettings: boolean;
	onManageWebhooks: () => void;
	onManageDirectory?: () => void;
	capacityPending: boolean;
	onSetCapacity: (agentId: number, maxActiveChats: number) => void;
	loading: boolean;
	error?: string;
	onRetry: () => void;
}) {
	const [tab, setTab] = useState<"agents" | "teams">("agents");
	const [search, setSearch] = useState("");
	const online = presence.filter((item) => Date.now() - Date.parse(item.heartbeat_at) < 90_000);
	const filteredAgents = agents.filter((agent) => `${agent.name} ${agent.email ?? ""}`.toLowerCase().includes(search.toLowerCase()));
	const filteredTeams = teams.filter((team) => team.name.toLowerCase().includes(search.toLowerCase()));
	return (
		<section aria-label="Команда чатов" className="supportos-scroll min-h-0 min-w-0 flex-1 overflow-auto p-2.5 sm:p-6">
			<div className="mx-auto max-w-5xl">
				<div className="grid grid-cols-3 gap-1.5 sm:gap-3">
					<StatCard label="Агенты" value={agents.length} icon={<UsersRound size={16} />} />
					<StatCard label="В SupportOS" value={online.length} icon={<Headphones size={16} />} />
					<StatCard label="Команды" value={teams.length} icon={<MessagesSquare size={16} />} />
				</div>
				<div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface/40 sm:mt-5">
					<div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5 sm:p-3">
						<div className="flex gap-1 rounded-lg bg-background p-1">
							<button type="button" aria-pressed={tab === "agents"} onClick={() => { setTab("agents"); setSearch(""); }} className={`rounded-md px-3 py-2 text-xs ${tab === "agents" ? "bg-surface-elevated text-foreground" : "text-muted"}`}>Агенты</button>
							<button type="button" aria-pressed={tab === "teams"} onClick={() => { setTab("teams"); setSearch(""); }} className={`rounded-md px-3 py-2 text-xs ${tab === "teams" ? "bg-surface-elevated text-foreground" : "text-muted"}`}>Команды</button>
						</div>
						<div className="relative order-last min-w-0 basis-full sm:order-0 sm:ml-auto sm:max-w-xs sm:flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input aria-label={tab === "agents" ? "Найти агента" : "Найти команду"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "agents" ? "Найти агента…" : "Найти команду…"} className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-accent" /></div>
						{canManageWebhookSettings && <button type="button" onClick={onManageWebhooks} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-elevated"><Settings2 size={14} />Вебхуки</button>}
						{onManageDirectory && <button type="button" onClick={onManageDirectory} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-elevated"><Settings2 size={14} />Команды и теги</button>}
					</div>
					{tab === "agents" ? filteredAgents.map((agent) => {
						const state = presence.find((item) => item.chatwoot_agent_id === agent.id);
						const isOnline = state && Date.now() - Date.parse(state.heartbeat_at) < 90_000;
						const status = state?.accepting && isOnline ? "Принимает" : isOnline ? "В SupportOS" : agent.availability_status === "online" ? "В Chatwoot" : "Не в сети";
						return <div key={agent.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 border-b border-border/70 px-3 py-3 last:border-0 md:flex md:gap-3 md:px-4">
							<div className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-elevated text-xs font-semibold">{initials(agent.name)}</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium" title={agent.name}>{agent.name}{agent.id === currentAgentId && <span className="ml-2 text-[10px] text-accent">Вы</span>}</div>
								<div className="truncate text-xs text-muted" title={agent.email}>{agent.email || "Почта не указана"}</div>
							</div>
							<div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-2">
								<span className="hidden rounded-full bg-background px-2 py-1 text-[11px] text-muted lg:block">{agent.role === "administrator" ? "Администратор" : "Агент"}</span>
								<span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted"><i className={`size-1.5 rounded-full ${state?.accepting && isOnline ? "bg-emerald-400" : isOnline ? "bg-amber-300" : "bg-zinc-500"}`} />{status}</span>
								<AgentCapacityField agent={agent} editable={canManageChatCapacity} saving={capacityPending} onSave={onSetCapacity} />
							</div>
						</div>;
					}) : filteredTeams.map((team) => <div key={team.id} className="flex items-center gap-3 border-b border-border/70 px-4 py-4 last:border-0"><div className="grid size-10 place-items-center rounded-xl border border-border bg-background text-accent"><UsersRound size={17} /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{team.name}</div><div className="text-xs text-muted">{team.agents?.length ?? 0} агентов{team.description ? ` · ${team.description}` : ""}</div></div><span className="rounded-full bg-background px-2.5 py-1 text-[10px] text-muted">{team.allow_auto_assign ? "Автоназначение" : "Ручное назначение"}</span></div>)}
					{loading && <div role="status" className="p-7 text-center text-sm text-muted"><LoaderCircle className="mr-2 inline animate-spin" size={15} />Загружаем команду…</div>}
					{error && <div role="alert" className="space-y-2 p-7 text-center text-sm chat-text-danger"><p>{error}</p><button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground">Повторить</button></div>}
					{!loading && !error && (tab === "agents" ? filteredAgents.length === 0 : filteredTeams.length === 0) && <div className="p-7 text-center text-sm text-muted">{search ? "По запросу ничего не найдено" : tab === "agents" ? "Нет доступных агентов" : "Команд пока нет"}</div>}
				</div>
			</div>
		</section>
	);
}

function AgentCapacityField({ agent, editable, saving, onSave }: {
	agent: ChatwootAgent;
	editable: boolean;
	saving: boolean;
	onSave: (agentId: number, maxActiveChats: number) => void;
}) {
	const limit = agent.max_active_chats ?? 4;
	if (!editable)
		return <span className="rounded-lg border border-border/70 px-2.5 py-1.5 text-[10px] text-muted">Лимит · {limit}</span>;
	return (
		<label className="flex items-center gap-2 text-[10px] text-muted">
			<span>Лимит чатов</span>
			<input
				key={`${agent.id}:${limit}`}
				aria-label={`Максимум чатов для ${agent.name}`}
				defaultValue={limit}
				type="number"
				min={1}
				max={50}
				disabled={saving}
				onBlur={(event) => {
					const value = Number(event.currentTarget.value);
					if (!Number.isInteger(value) || value < 1 || value > 50) {
						event.currentTarget.value = String(limit);
						return;
					}
					if (value !== limit) onSave(agent.id, value);
				}}
				className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-center text-xs text-foreground outline-none focus:border-accent disabled:opacity-50"
			/>
		</label>
	);
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
	return <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface/60 px-2.5 py-2 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
		<div aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent sm:size-9">{icon}</div>
		<div><div className="text-base font-semibold tabular-nums sm:text-lg">{value}</div><div className="text-[11px] leading-tight text-muted">{label}</div></div>
	</div>;
}

function ConversationRow({
	conversation,
	projectName,
	active,
	onClick,
	onTake,
	taking = false,
}: {
	conversation: ChatwootConversation;
	projectName?: string;
	active: boolean;
	onClick: () => void;
	onTake?: () => void;
	taking?: boolean;
}) {
	const sender = conversation.meta?.sender;
	const last = conversation.last_non_activity_message;
	return (
		<div
			data-active={active}
			className="chat-list-row group flex w-full items-center border-b border-border/70 pr-2 transition hover:bg-surface-elevated/70"
		>
			<button
				type="button"
				aria-pressed={active}
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
								{projectName ?? (conversation.inbox_id ? `Источник #${conversation.inbox_id}` : "Входящие")}
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
				disabled={taking}
					title="Взять в работу"
					className="shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] font-medium text-muted hover:text-foreground disabled:opacity-50"
				>
					{taking ? "Берём…" : "Взять"}
				</button>
			)}
		</div>
	);
}

function ConversationPane({
	id,
	supervising = false,
	docked = false,
	realtimeConnected,
	coachingRealtimeConnected,
	agents,
	teams,
	draft,
	onDraft,
	onOpenRelated,
	inboxes,
	labels,
	binds,
	language,
	onLanguage,
	onClose,
	onChanged,
	onChoose,
}: {
	id: number | null;
	supervising?: boolean;
	docked?: boolean;
	realtimeConnected: boolean;
	coachingRealtimeConnected: boolean;
	agents: ChatwootAgent[];
	teams: ChatwootTeam[];
	draft?: ChatDraft;
	onDraft: (id: number, draft: ChatDraft) => void;
	onOpenRelated: (id: number) => void;
	inboxes: ChatwootInbox[];
	labels: string[];
	binds: Bind[];
	language: LanguageCode;
	onLanguage: (language: LanguageCode) => void;
	onClose: () => void;
	onChanged: () => void;
	onChoose: () => void;
}) {
	const client = useQueryClient();
	const [text, setText] = useState(draft?.text ?? "");
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [attachmentError, setAttachmentError] = useState("");
	const fileInput = useRef<HTMLInputElement>(null);
	const [privateNote, setPrivateNote] = useState(draft?.privateNote ?? false);
	const [draftCoachTo, setDraftCoachTo] = useState<CoachingRecipient | null>(draft?.coachTo ?? null);
	useEffect(() => {
		if (id != null) onDraft(id, { text, privateNote, coachTo: draftCoachTo ?? undefined });
	}, [id, text, privateNote, draftCoachTo, onDraft]);
	const [assignOpen, setAssignOpen] = useState(false);
	const [bindSearch, setBindSearch] = useState("");
	const [showBinds, setShowBinds] = useState(false);
	const [tagOpen, setTagOpen] = useState(false);
	const tagMenuRef = useChatPopover<HTMLDivElement>(tagOpen, () => setTagOpen(false));
	const assignMenu = useChatPopover<HTMLDivElement>(assignOpen, () => setAssignOpen(false));
	const bindMenu = useChatPopover<HTMLDivElement>(showBinds, () => setShowBinds(false));
	const [showCustomer, setShowCustomer] = useState(false);
	const customerClose = useRef<HTMLButtonElement>(null);
	const customerToggle = useRef<HTMLButtonElement>(null);
	const [customerWidth, setCustomerWidth] = useState(248);
	const [confirmBlock, setConfirmBlock] = useState(false);
	const [olderMessages, setOlderMessages] = useState<ChatwootMessage[]>([]);
	const [hasOlderMessages, setHasOlderMessages] = useState(true);
	const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
	const [olderMessagesError, setOlderMessagesError] = useState("");
	const [optimisticMessage, setOptimisticMessage] = useState<ChatwootMessage | null>(null);
	const messageViewport = useRef<HTMLDivElement>(null);
	const previousScrollHeight = useRef<number | null>(null);
	const olderMessagesRequest = useRef(false);
	const followMessages = useRef(true);
	const [privateOnly, setPrivateOnly] = useState(false);
	const [showLatest, setShowLatest] = useState(false);
	const currentConversationId = useRef(id);
	useEffect(() => {
		if (showCustomer) customerClose.current?.focus();
	}, [showCustomer]);
	const closeCustomer = () => {
		setShowCustomer(false);
		customerToggle.current?.focus();
	};
	const query = useQuery({
		queryKey: ["chatwoot", "conversation", id],
		queryFn: () => chatwootService.conversation(id as number),
		enabled: id != null,
		refetchInterval: realtimeConnected ? 12000 : 5000,
	});
	const conversation = query.data as ChatwootConversation | undefined;
	const canWrite = !supervising && conversation?.access?.write === true;
	const canNote = !supervising && conversation?.access?.note === true;
	const canTake = !supervising && conversation?.access?.take === true;
	const sendAsNote = !canWrite || privateNote;
	useEffect(() => {
		if (canNote && !canWrite) setPrivateNote(true);
	}, [canNote, canWrite]);
	const latestMessagesQuery = useQuery({
		queryKey: ["chatwoot", "messages", id, "latest"],
		queryFn: () => chatwootService.conversationMessages(id as number),
		enabled: id != null,
		refetchInterval: realtimeConnected ? 12000 : 3000,
	});
	const latestMessages = latestMessagesQuery.data
		? latestMessagesQuery.data.payload ??
			latestMessagesQuery.data.data?.payload ??
			latestMessagesQuery.data.messages ??
			[]
		: (conversation?.messages ?? []);
	const messages = useMemo(() => {
		const unique = new Map<number, ChatwootMessage>();
		for (const message of [...olderMessages, ...latestMessages, ...(optimisticMessage ? [optimisticMessage] : [])]) unique.set(message.id, message);
		return [...unique.values()].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
	}, [olderMessages, latestMessages, optimisticMessage]);
	const latestMessageId = messages.at(-1)?.id;
	const coachingKey = ["chatwoot", "coaching-notes", id] as const;
	const coaching = useQuery({
		queryKey: coachingKey,
		queryFn: ({ signal }) => chatwootService.coachingNotes(id as number, signal),
		enabled: id != null && conversation?.access?.read === true,
		refetchInterval: coachingRealtimeConnected ? 15000 : 3500,
		retry: false,
	});
	const coachingNotes = coaching.data?.notes;
	const latestCoachingId = coachingNotes?.[0]?.id;
	const timeline = useMemo(() => [
		...messages.map((message) => ({
			key: `message-${message.id}`, time: (message.created_at ?? 0) * 1000, message,
		})),
		...(coachingNotes ?? []).map((note) => ({
			key: `coaching-${note.id}`, time: Date.parse(note.createdAt), note,
		})),
	].sort((left, right) => left.time - right.time), [messages, coachingNotes]);
	const visibleTimeline = privateOnly ? timeline.filter((entry) => "note" in entry) : timeline;
	const showCoachingTabs = supervising || privateOnly || Boolean(coachingNotes?.length);
	const coachingRequest = useRef<{ recipientAgentId: number; content: string; noteId: string } | null>(null);
	const coachRecipient = conversation?.coachRecipient;
	const changedRecipient = text.trim() && draftCoachTo && coachRecipient && draftCoachTo.id !== coachRecipient.id ? draftCoachTo : null;
	const sendCoach = useMutation({
		mutationFn: (note: NonNullable<typeof coachingRequest.current>) => chatwootService.sendCoachingNote(id as number, note),
		onSuccess: async (note) => {
			await client.cancelQueries({ queryKey: coachingKey });
			previousScrollHeight.current = null;
			followMessages.current = true;
			setShowLatest(false);
			client.setQueryData<{ notes: ChatwootCoachingNote[] }>(coachingKey, (cached) => ({
				notes: [note, ...(cached?.notes ?? []).filter((item) => item.id !== note.id)].slice(0, 100),
			}));
			coachingRequest.current = null;
			setDraftCoachTo(null);
			setText("");
			if (id != null) onDraft(id, { text: "", privateNote: false });
			void client.invalidateQueries({ queryKey: coachingKey });
		},
		onError: () => {
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversation", id] });
		},
	});
	const submitCoach = () => {
		const content = text.trim();
		if (!coachRecipient || !content || changedRecipient || sendCoach.isPending) return;
		const previous = coachingRequest.current;
		const request = previous?.recipientAgentId === coachRecipient.id && previous.content === content
			? previous : { recipientAgentId: coachRecipient.id, content, noteId: crypto.randomUUID() };
		coachingRequest.current = request;
		sendCoach.mutate(request);
	};
	const updateCoachingDraft = (value: string) => {
		if (!value.trim()) setDraftCoachTo(null);
		else if (!draftCoachTo && coachRecipient) setDraftCoachTo(coachRecipient);
		if (sendCoach.isSuccess || sendCoach.isError) sendCoach.reset();
		setText(value);
	};
	const changeThreadView = (onlyNotes: boolean) => {
		if (onlyNotes === privateOnly) return;
		previousScrollHeight.current = null;
		followMessages.current = true;
		setShowLatest(false);
		setPrivateOnly(onlyNotes);
	};
	useEffect(() => {
		currentConversationId.current = id;
		setSelectedFiles([]);
		setAttachmentError("");
		setOlderMessages([]);
		setHasOlderMessages(true);
		setOlderMessagesError("");
		setOptimisticMessage(null);
		olderMessagesRequest.current = false;
		previousScrollHeight.current = null;
		followMessages.current = true;
		setShowLatest(false);
		setPrivateOnly(false);
	}, [id]);
	useEffect(() => {
		if (!latestMessagesQuery.data) return;
		const page = latestMessagesQuery.data.payload ?? latestMessagesQuery.data.data?.payload ?? latestMessagesQuery.data.messages ?? [];
		if (page.length < 20) setHasOlderMessages(false);
	}, [latestMessagesQuery.data]);
	useLayoutEffect(() => {
		const viewport = messageViewport.current;
		if (!viewport || (latestMessageId == null && !latestCoachingId)) return;
		if (previousScrollHeight.current !== null) {
			viewport.scrollTop += viewport.scrollHeight - previousScrollHeight.current;
			previousScrollHeight.current = null;
			return;
		}
		if (!followMessages.current) return;
		viewport.scrollTop = viewport.scrollHeight;
	}, [latestMessageId, latestCoachingId, messages.length, privateOnly]);
	const conversationVisible = conversation?.access?.read === true && !query.isError;
	useEffect(() => {
		if (!conversationVisible || !messageViewport.current) return;
		const viewport = messageViewport.current;
		const observer = new ResizeObserver(() => {
			if (followMessages.current && previousScrollHeight.current === null) viewport.scrollTop = viewport.scrollHeight;
		});
		observer.observe(viewport);
		return () => observer.disconnect();
	}, [conversationVisible]);
	const loadOlderMessages = async () => {
		const firstId = messages[0]?.id;
		if (!id || !firstId || olderMessagesRequest.current || !hasOlderMessages) return;
		olderMessagesRequest.current = true;
		setLoadingOlderMessages(true);
		setOlderMessagesError("");
		try {
			const viewport = messageViewport.current;
			if (viewport) previousScrollHeight.current = viewport.scrollHeight;
			const result = await chatwootService.conversationMessages(id, firstId);
			const page = result.payload ?? result.data?.payload ?? result.messages ?? [];
			if (currentConversationId.current !== id) return;
			const knownIds = new Set(messages.map((message) => message.id));
			const unseen = page.filter((message) => !knownIds.has(message.id));
			setOlderMessages((current) => {
				const unique = new Map(current.map((message) => [message.id, message]));
				for (const message of unseen) unique.set(message.id, message);
				return [...unique.values()].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
			});
			setHasOlderMessages(page.length >= 20 && unseen.length > 0);
		} catch (error) {
			setOlderMessagesError(error instanceof Error ? error.message : "Не удалось загрузить историю");
		} finally {
			olderMessagesRequest.current = false;
			setLoadingOlderMessages(false);
		}
	};
	const sender = conversation?.meta?.sender;
	const contactId = sender?.id ?? conversation?.contact_id;
	const contact = useQuery({
		queryKey: ["chatwoot", "contact", contactId, id],
		queryFn: () => chatwootService.contact(contactId as number, id as number),
		enabled: showCustomer && conversation?.access?.read === true && contactId != null,
		staleTime: 60000,
	});
	const history = useQuery({
		queryKey: ["chatwoot", "contact-history", contactId, id],
		queryFn: () => chatwootService.contactHistory(contactId as number, id as number),
		enabled: showCustomer && conversation?.access?.read === true && contactId != null,
		staleTime: 60000,
	});
	const send = useMutation({
		mutationFn: async () => {
			const attachments = await Promise.all(selectedFiles.map(async (file) => {
				const bytes = new Uint8Array(await file.arrayBuffer());
				let binary = "";
				for (let offset = 0; offset < bytes.length; offset += 0x8000)
					binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
				return { name: file.name, type: file.type || "application/octet-stream", contentBase64: btoa(binary) };
			}));
			return chatwootService.sendMessage(id as number, text.trim(), sendAsNote, attachments);
		},
		onMutate: () => {
			setOptimisticMessage({ id: -Date.now(), content: text.trim(), private: sendAsNote, message_type: "outgoing", created_at: Math.floor(Date.now() / 1000), attachments: selectedFiles.map((file) => ({ file_name: file.name, file_type: file.type })) });
			return { conversationId: id };
		},
		onSuccess: (_result, _variables, context) => {
			if (context?.conversationId != null) onDraft(context.conversationId, { text: "", privateNote: false });
			if (currentConversationId.current === context?.conversationId) {
				setOptimisticMessage(null);
				setText("");
				setSelectedFiles([]);
				setAttachmentError("");
			}
			void client.invalidateQueries({ queryKey: ["chatwoot", "messages", id, "latest"] });
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversation", id],
			});
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversations"],
			});
		},
		onError: (_error, _variables, context) => {
			if (currentConversationId.current === context?.conversationId) setOptimisticMessage(null);
		},
	});
	const addFiles = (files: FileList | null) => {
		if (!files?.length) return;
		const next = [...selectedFiles, ...Array.from(files)];
		const totalSize = next.reduce((sum, file) => sum + file.size, 0);
		if (next.length > 5) {
			setAttachmentError("Можно прикрепить не более 5 файлов");
			return;
		}
		if (totalSize > 2_800_000) {
			setAttachmentError("Общий размер вложений не должен превышать 2,8 МБ");
			return;
		}
		setSelectedFiles(next);
		setAttachmentError("");
	};
	const status = useMutation({
		mutationFn: (value: { status: ChatwootStatus; snoozedUntil?: number }) =>
			chatwootService.setStatus(id as number, value.status, value.snoozedUntil),
		onSuccess: (_result, value) => {
			if (["resolved", "snoozed"].includes(value.status) && id != null) {
				for (const [key, cached] of client.getQueriesData({ queryKey: ["chatwoot", "conversations"] })) {
					const request = key[2] as ConversationSearch | undefined;
					if (request?.scope !== "history") client.setQueryData(key, withoutConversation(cached, id));
				}
				void client.invalidateQueries({ queryKey: ["chatwoot", "presence"] });
			}
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
	const assignTeam = useMutation({
		mutationFn: (teamId: number | null) => chatwootService.assignTeam(id as number, teamId),
		onSuccess: () => { void query.refetch(); onChanged(); },
	});
	const priority = useMutation({
		mutationFn: (value: ChatwootPriority | null) => chatwootService.setPriority(id as number, value),
		onSuccess: () => { void query.refetch(); onChanged(); },
	});
	const take = useMutation({
		mutationFn: () => chatwootService.take(id as number),
		onSettled: () => { void query.refetch(); onChanged(); },
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
			chatwootService.blockContact(id as number, contactId as number, value),
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
	const source = inboxes.find((inbox) => inbox.id === conversation?.inbox_id);
	const project = conversation?.meta?.inbox?.name ?? source?.name;
	const visitor = conversation?.visitor;
	const rawLogin = currentContact?.custom_attributes?.player_login ?? currentContact?.custom_attributes?.login ?? visitor?.login;
	const playerLogin = typeof rawLogin === "string" ? rawLogin : undefined;
	const crmUrl = crmWorkspaceUrl(conversation?.crm);
	const insertBind = (bind: Bind) => {
		const translation = getBindTranslation(bind, language);
		if (!translation) return;
		setText(
			(value) =>
				`${value}${value && !value.endsWith("\n") ? "\n" : ""}${translation.content}`,
		);
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
	if (!conversation?.access?.read || query.isError) return (
		<div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted">
			<div><p role={query.isError ? "alert" : "status"}>{query.error?.message ?? (query.isLoading ? "Загружаем диалог…" : "Диалог недоступен")}</p>
				{query.isError && <button type="button" onClick={() => void query.refetch()} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs">Повторить</button>}
			</div>
		</div>
	);
	const tags = conversation?.labels ?? [];
	const editError = status.error || assign.error || assignTeam.error || priority.error || take.error || tagMutation.error || block.error;
	return (
		<section
			className="chat-thread relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
		>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<header className={`chat-thread-header flex min-h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border pr-3 py-2.5 ${docked ? "chat-docked-thread-header pl-3" : "pl-12"}`}>
					<div className="flex min-w-0 items-center gap-2.5">
						<div className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-elevated text-[11px] font-semibold">
							{initials(sender?.name)}
						</div>
						<div className="min-w-0">
							<h2 className="truncate text-sm font-semibold" title={sender?.name}>
								{sender?.name || sender?.email || `Диалог #${id}`}
							</h2>
							<p className="truncate text-[11px] text-muted">
								{project ? `${project} · #${id}` : `#${id}`}
								{conversation.status === "pending" ? " · ожидает" : conversation.status === "snoozed" ? " · отложен" : conversation.status === "resolved" ? " · завершён" : ""}
							</p>
							{supervising && <p className="truncate text-[11px] text-muted" title={conversation.meta?.assignee?.name}>
								{conversation.meta?.assignee?.name ? `Агент · ${conversation.meta.assignee.name}` : coachRecipient ? "Назначенный агент" : "Агент не назначен"}
							</p>}
						</div>
					</div>
					<div className="chat-thread-actions flex shrink-0 flex-wrap items-center gap-1.5">
						{canWrite && <div ref={assignMenu} className="relative">
							<button
								type="button"
								aria-label="Назначить агента"
								aria-expanded={assignOpen}
								onClick={() => { setTagOpen(false); setShowBinds(false); setAssignOpen(!assignOpen); }}
								className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted hover:bg-surface-elevated"
							>
								<UserRound size={13} />
								<span className="chat-assignee-name hidden max-w-24 truncate sm:block">
									{conversation?.meta?.assignee?.name ?? "Назначить"}
								</span>
								<ChevronDown size={12} />
							</button>
							{assignOpen && (
								<div className="chat-popover chat-assign-popover absolute left-0 top-9 z-40 w-52 rounded-xl border border-border bg-surface p-1 shadow-xl sm:right-0 sm:left-auto">
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
						</div>}
						<button
							ref={customerToggle}
							type="button"
							onClick={() => { setAssignOpen(false); setTagOpen(false); setShowBinds(false); setShowCustomer(!showCustomer); }}
							title="Карточка игрока"
							aria-label="Карточка игрока"
							aria-expanded={showCustomer}
							className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated"
						>
							<UserRound size={14} />
						</button>
						{canWrite && <button
							type="button"
							title={
								["resolved", "snoozed"].includes(conversation.status) ? "Открыть" : "Завершить"
							}
							disabled={status.isPending}
							onClick={() => status.mutate({ status: ["resolved", "snoozed"].includes(conversation.status) ? "open" : "resolved" })}
							className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated"
						>
							<CheckCheck size={14} />
						</button>}
						{!docked && <button
							type="button"
							title="Закрыть вкладку"
							aria-label="Закрыть диалог"
							onClick={onClose}
							className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated"
						>
							<X size={15} />
						</button>}
					</div>
				</header>
				{(canWrite || conversation.priority || tags.length > 0) && <div className="chat-thread-meta relative z-20 flex min-h-8 shrink-0 flex-wrap items-center gap-1.5 overflow-visible border-b border-border px-3 py-1.5">
					{canWrite && <>
						<select aria-label="Приоритет" value={conversation.priority ?? ""} disabled={priority.isPending}
							onChange={(event) => priority.mutate((event.target.value || null) as ChatwootPriority | null)}
							className="h-7 max-w-28 rounded-md border border-border bg-surface px-1 text-[11px]">
							<option value="">Приоритет</option><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option><option value="urgent">Срочный</option>
						</select>
						<select aria-label="Статус и пауза" value="" disabled={status.isPending} onChange={(event) => {
							const value = event.target.value;
							if (value === "pending" || value === "open" || value === "resolved") status.mutate({ status: value });
							else if (value.startsWith("snooze:")) {
								const minutes = Number(value.split(":")[1]);
								status.mutate({ status: "snoozed", snoozedUntil: minutes ? Math.floor(Date.now() / 1000) + minutes * 60 : undefined });
							}
						}} className="h-7 max-w-32 rounded-md border border-border bg-surface px-1 text-[11px]">
							<option value="">Статус / пауза</option><option value="open">В работе</option><option value="pending">Ожидает</option><option value="resolved">Завершён</option>
							<option value="snooze:30">На 30 минут</option><option value="snooze:120">На 2 часа</option><option value="snooze:1440">На сутки</option><option value="snooze:0">До ответа клиента</option>
						</select>
						{teams.length > 0 && <select aria-label="Команда диалога" value={conversation.meta?.team?.id ?? ""} disabled={assignTeam.isPending} onChange={(event) => assignTeam.mutate(Number(event.target.value) || null)} className="h-7 max-w-36 rounded-md border border-border bg-surface px-1 text-[11px]">
							<option value="">Без команды</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
						</select>}
					</>}
					{!canWrite && conversation.priority && <span className="rounded border border-border px-2 py-1 text-[10px]">Приоритет: {({ low: "низкий", medium: "средний", high: "высокий", urgent: "срочный" })[conversation.priority]}</span>}
					{tags.map((tag) => canWrite ? (
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
					) : <span key={tag} className="rounded-full bg-accent/10 px-2 py-1 text-[10px] text-accent">{tag}</span>)}
					{canWrite && <div className="chat-tag-trigger relative z-30" ref={tagMenuRef}>
						<button
							type="button"
							onClick={() => { setAssignOpen(false); setShowBinds(false); setTagOpen(!tagOpen); }}
							aria-expanded={tagOpen}
							className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] text-muted hover:text-foreground"
						>
							<Tag size={11} /> Добавить тег
						</button>
						{tagOpen && (
							<div className="chat-popover chat-tag-popover supportos-scroll absolute left-0 top-[calc(100%+6px)] z-40 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
								{labels.filter((tag) => !tags.includes(tag)).length === 0 ? (
									<p className="px-3 py-3 text-center text-[11px] text-muted">Все доступные теги уже добавлены</p>
								) : labels.filter((tag) => !tags.includes(tag)).map((tag) => (
										<button
											key={tag}
											type="button"
										disabled={tagMutation.isPending}
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
					</div>}
				</div>}
				{editError && (
					<div role="alert" className="border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-[11px] chat-text-danger">
						{editError.message}
					</div>
				)}
				{showCoachingTabs && <CoachingThreadTabs count={coachingNotes?.length ?? 0} privateOnly={privateOnly} onChange={changeThreadView} />}
				{latestMessagesQuery.isError && messages.length > 0 && !privateOnly && (
					<p role="status" className="flex flex-wrap items-center justify-between gap-1 border-b border-border px-3 py-1.5 text-xs text-muted">
						Не удалось обновить сообщения
						<button type="button" className="font-medium text-accent" onClick={() => void latestMessagesQuery.refetch()}>Повторить</button>
					</p>
				)}
				<div className="relative min-h-0 flex-1">
				<div
					ref={messageViewport}
					role="log"
					aria-label={privateOnly ? "Подсказки в диалоге" : "Переписка"}
					aria-relevant="additions"
					onScroll={(event) => {
						const viewport = event.currentTarget;
						followMessages.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;
						setShowLatest(!followMessages.current);
						if (!privateOnly && viewport.scrollTop < 48) void loadOlderMessages();
					}}
					className="chat-thread-transcript supportos-scroll flex h-full flex-col overflow-y-auto px-3 py-4 sm:px-5"
				>
					{!privateOnly && hasOlderMessages && messages.length > 0 && (
						<div className="sticky top-0 z-10 mb-4 flex shrink-0 justify-center">
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
					{!privateOnly && olderMessagesError && (
						<p role="alert" className="mb-3 text-center text-xs chat-text-danger">
							{olderMessagesError}
						</p>
					)}
					{(privateOnly ? coaching.isLoading : latestMessagesQuery.isLoading && !visibleTimeline.length) ? (
						<div className="flex h-full items-center justify-center text-sm text-muted">
							<LoaderCircle className="mr-2 animate-spin" size={16} />
							{privateOnly ? "Загружаем подсказки…" : "Загружаем переписку…"}
						</div>
					) : (privateOnly ? coaching.isError : latestMessagesQuery.isError) && !visibleTimeline.length ? (
						<div role="alert" className="m-auto space-y-2 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm chat-text-danger">
							<p>{privateOnly ? "Не удалось загрузить подсказки" : "Не удалось загрузить переписку"}</p>
							<button type="button" onClick={() => void (privateOnly ? coaching.refetch() : latestMessagesQuery.refetch())}
								className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-elevated">Повторить</button>
						</div>
					) : visibleTimeline.length === 0 ? (
						<div className="m-auto flex flex-col items-center gap-2 px-3 text-center text-sm text-muted">
							{privateOnly ? <LockKeyhole size={19} className="chat-text-hint" /> : <MessageSquareText size={19} />}
							{privateOnly ? "Подсказок пока нет" : "Сообщений пока нет"}
						</div>
					) : (
						<div className="mt-auto flex w-full shrink-0 flex-col gap-3 px-1 sm:px-3">
							{visibleTimeline.map((entry) => "note" in entry ? (
								<CoachingBubble key={entry.key} note={entry.note} />
							) : <MessageBubble key={entry.key} message={entry.message} />)}
						</div>
					)}
				</div>
				{showLatest && <button type="button" onClick={() => {
					const viewport = messageViewport.current;
					if (viewport) viewport.scrollTop = viewport.scrollHeight;
					followMessages.current = true;
					setShowLatest(false);
				}} className="absolute right-3 bottom-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs text-foreground shadow-sm hover:bg-surface-elevated">
					<ChevronDown size={14} /> К последним сообщениям
				</button>}
				</div>
				{supervising ? (
					<CoachingComposer recipient={coachRecipient} previousRecipient={changedRecipient} text={text}
						pending={sendCoach.isPending} sent={sendCoach.isSuccess} error={sendCoach.error?.message}
						inactive={!["open", "pending"].includes(conversation.status)} onChange={updateCoachingDraft}
						onRetarget={() => { if (coachRecipient) setDraftCoachTo(coachRecipient); sendCoach.reset(); }}
						onSend={submitCoach} />
				) : privateOnly ? (
					<footer className="chat-thread-composer shrink-0 border-t border-border p-2.5">
						<button type="button" className="chat-observation-action" onClick={() => changeThreadView(false)}>
							<MessageSquareText size={14} /> Вернуться к переписке
						</button>
					</footer>
				) : (canWrite || canNote) ? <footer className="chat-thread-composer relative shrink-0 border-t border-border p-2.5 sm:p-3">
					<input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
					{selectedFiles.length > 0 && (
						<div className="mb-2 flex flex-wrap gap-2">
							{selectedFiles.map((file, index) => (
								<div key={`${file.name}-${file.lastModified}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs">
									<FileText size={13} className="shrink-0 text-accent" />
									<span className="max-w-56 truncate">{file.name}</span>
									<span className="shrink-0 text-muted">{(file.size / 1024).toFixed(0)} КБ</span>
									<button type="button" aria-label={`Удалить файл ${file.name}`} onClick={() => { setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index)); setAttachmentError(""); }} className="text-muted hover:text-foreground"><X size={13} /></button>
								</div>
							))}
						</div>
					)}
					<div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
						<div className="flex flex-wrap items-center gap-1.5">
							<div className="chat-operator-composer inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border p-0.5" role="group" aria-label="Кому отправить сообщение">
								{canWrite && <button type="button" aria-pressed={!sendAsNote} onClick={() => setPrivateNote(false)}
									className="rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground">Ответ игроку</button>}
								{canNote && <button type="button" aria-pressed={sendAsNote} data-private={sendAsNote} onClick={() => setPrivateNote(true)}
									className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground">
									<LockKeyhole size={11} /> Заметка команде
								</button>}
							</div>
							{canWrite && <div ref={bindMenu}>
								<button
									type="button"
									onClick={() => { setAssignOpen(false); setTagOpen(false); setShowBinds(!showBinds); }}
									aria-label="Быстрый бинд"
									title="Быстрый бинд"
									aria-expanded={showBinds}
									className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted hover:text-foreground"
								>
									<MessageSquareText size={12} /> <span className="chat-binds-caption">Быстрый бинд</span>
								</button>
								{showBinds && (
									<div className="chat-popover absolute bottom-full left-2.5 z-30 mb-1 w-[360px] rounded-xl border border-border bg-surface p-2 shadow-xl">
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
							</div>}
						</div>
						<div className="flex items-center gap-2">
							<button type="button" title="Прикрепить файл" aria-label="Прикрепить файл" onClick={() => fileInput.current?.click()} disabled={send.isPending || selectedFiles.length >= 5} className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"><Paperclip size={14} /></button>
							<span className="hidden text-[10px] text-muted sm:block">
								Enter · Shift+Enter — перенос
							</span>
							<button
								type="button"
								aria-label={sendAsNote ? "Отправить заметку команде" : "Отправить игроку"}
								title={sendAsNote ? "Отправить заметку команде" : "Отправить игроку"}
								disabled={(!text.trim() && !selectedFiles.length) || send.isPending}
								onClick={() => send.mutate()}
								className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
							>
								<Send size={13} />
								<span className="chat-send-caption">{send.isPending ? "Отправляем…" : sendAsNote ? "Отправить команде" : "Отправить игроку"}</span>
							</button>
						</div>
					</div>
					<textarea
						aria-label={sendAsNote ? "Заметка команде" : "Ответ игроку"}
						value={text}
						onChange={(event) => setText(event.target.value)}
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								!event.shiftKey &&
								!event.nativeEvent.isComposing &&
								event.keyCode !== 229 &&
								(text.trim() || selectedFiles.length > 0) &&
								!send.isPending
							) {
								event.preventDefault();
								send.mutate();
							}
						}}
						placeholder={
							sendAsNote
								? "Заметка видна только команде…"
								: "Напишите ответ клиенту…"
						}
						rows={3}
						className="supportos-scroll block max-h-36 min-h-14 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent/60"
					/>
					{attachmentError && <p role="alert" className="mt-1 text-xs chat-text-danger">{attachmentError}</p>}
					{send.isError && (
						<p role="alert" className="mt-1 text-xs chat-text-danger">
							{send.error instanceof Error
								? send.error.message
								: "Не удалось отправить"}
						</p>
					)}
				</footer> : <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted">
					<span>{canTake ? "Возьмите диалог, чтобы ответить игроку." : "Диалог доступен для просмотра."}</span>
					{canTake && <button type="button" disabled={take.isPending} onClick={() => take.mutate()} className="rounded-md bg-accent px-3 py-2 font-medium text-white disabled:opacity-50">Взять в работу</button>}
				</footer>}
			</div>
			{showCustomer && (
				<>
				<div className="chat-thread-customer-resize"><ResizeHandle axis="x" label="Изменить ширину карточки клиента" value={customerWidth} min={200} max={420} fromEnd onResize={setCustomerWidth} /></div>
				<aside aria-label="Карточка игрока" onKeyDown={(event) => { if (event.key === "Escape") closeCustomer(); }} style={{ width: customerWidth }} className="chat-thread-customer supportos-scroll absolute inset-y-0 right-0 z-30 max-w-full shrink-0 overflow-y-auto border-l border-border bg-surface p-3 shadow-xl">
					<div className="mb-3 flex items-center justify-between">
						<h3 className="text-xs font-semibold">Игрок</h3>
						<button
							ref={customerClose}
							type="button"
							aria-label="Закрыть карточку игрока"
							onClick={closeCustomer}
							className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground"
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
						<Info label="Логин игрока" value={playerLogin} />
						{currentContact?.identifier !== playerLogin && <Info label="Идентификатор игрока" value={currentContact?.identifier} />}
						<Info label="Телефон" value={currentContact?.phone_number} />
						<Info label="ID контакта" value={String(contactId ?? "")} />
						<section className="space-y-2 rounded-lg border border-border p-2.5">
							<h4 className="font-semibold">Источник обращения</h4>
							<Info label="Проект" value={project ?? (conversation?.inbox_id ? `Источник #${conversation.inbox_id}` : "Не определён")} />
							<Info label={visitor?.page ? "Страница входа" : "Сайт проекта"} value={visitor?.page ?? source?.website_url} />
							<Info label="IP" value={visitor?.ip ?? "Не передан"} />
							<Info label="Локация" value={[visitor?.city, visitor?.country].filter(Boolean).join(", ")} />
							<Info label="Устройство" value={[visitor?.device, visitor?.platform, visitor?.browser].filter(Boolean).join(" · ")} />
						</section>
						{crmUrl && <a href={crmUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-lg border border-border px-2 py-2 font-medium hover:bg-surface-elevated"><ExternalLink size={13} /> Открыть CRM проекта</a>}
						<section className="space-y-1.5 rounded-lg border border-border p-2.5">
							<h4 className="font-semibold">Предыдущие диалоги</h4>
							{history.isPending && contactId && <p className="text-muted">Загрузка…</p>}
							{history.isError && <p className="text-muted">История недоступна</p>}
							{history.data?.payload.length === 0 && <p className="text-muted">Нет доступных диалогов</p>}
							{history.data?.payload.map((chat) => (
								<button key={chat.id} type="button" onClick={() => onOpenRelated(chat.id)} className="flex w-full justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-surface-elevated">
									<span className="min-w-0 truncate">#{chat.id} · {inboxes.find((box) => box.id === chat.inbox_id)?.name ?? "Проект"}</span>
									<span className="shrink-0 text-muted">{chat.status === "resolved" ? "Завершён" : chat.status === "snoozed" ? "Отложен" : chat.status === "pending" ? "Ожидает" : "Открыт"}</span>
								</button>
							))}
						</section>
						<Info
							label="Ответственный"
							value={conversation?.meta?.assignee?.name}
						/>
						<CustomFieldsEditor
							conversationId={id}
							contactId={contactId}
							conversationValues={conversation?.custom_attributes ?? {}}
							contactValues={currentContact?.custom_attributes ?? {}}
							canEdit={canWrite}
						/>
					</div>
					{canWrite && <div className="mt-4 border-t border-border pt-3">
						<button
							type="button"
							disabled={!contactId || block.isPending}
							onClick={() => setConfirmBlock(true)}
							className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] ${currentContact?.blocked ? "border-amber-500/30 chat-text-warning" : "border-red-500/20 chat-text-danger hover:bg-red-500/5"}`}
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
										className="flex-1 rounded bg-red-500/15 px-2 py-1 text-[10px] chat-text-danger"
									>
										Подтвердить
									</button>
								</div>
							</div>
						)}
					</div>}
				</aside>
				</>
			)}
		</section>
	);
}

function CustomFieldsEditor({ conversationId, contactId, conversationValues, contactValues, canEdit }: {
	conversationId: number;
	contactId?: number;
	conversationValues: Record<string, unknown>;
	contactValues: Record<string, unknown>;
	canEdit: boolean;
}) {
	const conversationFields = useQuery({
		queryKey: ["chatwoot", "custom-attributes", 0],
		queryFn: () => chatwootService.customAttributes(0),
	});
	const contactFields = useQuery({
		queryKey: ["chatwoot", "custom-attributes", 1],
		queryFn: () => chatwootService.customAttributes(1),
	});
	const chats = conversationFields.data?.payload ?? [];
	const contacts = contactFields.data?.payload ?? [];
	if (!conversationFields.isLoading && !contactFields.isLoading && chats.length === 0 && contacts.length === 0) return null;
	return (
		<div className="space-y-3 border-t border-border pt-3">
			<h4 className="text-[11px] font-semibold">Пользовательские поля</h4>
			{conversationFields.isError || contactFields.isError ? <p className="text-[10px] chat-text-danger">Не удалось загрузить поля Chatwoot</p> : null}
			{conversationFields.isLoading || contactFields.isLoading ? <p className="text-[10px] text-muted">Загружаем поля…</p> : null}
			{chats.length > 0 && <div className="space-y-2"><p className="text-[10px] uppercase tracking-wide text-muted">Диалог</p>{chats.map((field) => <CustomFieldValue key={field.id} definition={field} value={conversationValues[field.attribute_key]} subjectId={conversationId} conversationId={conversationId} canEdit={canEdit} />)}</div>}
			{contacts.length > 0 && <div className="space-y-2"><p className="text-[10px] uppercase tracking-wide text-muted">Игрок</p>{contacts.map((field) => <CustomFieldValue key={field.id} definition={field} value={contactValues[field.attribute_key]} subjectId={contactId} conversationId={conversationId} contactId={contactId} canEdit={canEdit} />)}</div>}
		</div>
	);
}

function CustomFieldValue({ definition, value, subjectId, conversationId, contactId, canEdit }: {
	definition: ChatwootCustomAttributeDefinition;
	value: unknown;
	subjectId?: number;
	conversationId?: number;
	contactId?: number;
	canEdit: boolean;
}) {
	const client = useQueryClient();
	const [draft, setDraft] = useState(value == null ? "" : String(value));
	useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
	const save = useMutation({
		mutationFn: () => {
			if (!subjectId) throw new Error("Не найден контакт или диалог");
			let normalized: string | number | boolean | null = draft.trim() || null;
			if (definition.attribute_display_type === 7) normalized = draft === "true";
			else if ([1, 2, 3].includes(definition.attribute_display_type) && normalized != null) {
				const number = Number(normalized);
				if (!Number.isFinite(number)) throw new Error("Введите корректное число");
				normalized = number;
			}
			return chatwootService.setCustomAttributeValues({
				conversationId, contactId,
				attributes: { [definition.attribute_key]: normalized },
			});
		},
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: ["chatwoot", "conversation", conversationId] }),
				client.invalidateQueries({ queryKey: ["chatwoot", "contact", contactId] }),
			]);
		},
	});
	const className = "h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11px] outline-none focus:border-accent/60 disabled:opacity-60";
	const type = definition.attribute_display_type;
	return (
		<div className="min-w-0">
			<label className="mb-1 block truncate text-[10px] text-muted" title={definition.attribute_description ?? undefined}>{definition.attribute_display_name}</label>
			<div className="flex min-w-0 items-center gap-1.5">
				{type === 7 ? <select disabled={!canEdit} value={draft || "false"} onChange={(event) => setDraft(event.target.value)} className={className}><option value="false">Нет</option><option value="true">Да</option></select> : type === 6 ? <select disabled={!canEdit} value={draft} onChange={(event) => setDraft(event.target.value)} className={className}><option value="">Не выбрано</option>{(definition.attribute_values ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input disabled={!canEdit} type={type === 5 ? "date" : [1, 2, 3].includes(type) ? "number" : type === 4 ? "url" : "text"} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Не заполнено" className={className} />}
				{canEdit && draft !== (value == null ? (type === 7 ? "false" : "") : String(value)) && <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="shrink-0 rounded-md border border-border px-2 py-1.5 text-[10px] hover:bg-surface-elevated disabled:opacity-50">{save.isPending ? "…" : "Сохранить"}</button>}
			</div>
			{save.isError && <p role="alert" className="mt-1 text-[10px] chat-text-danger">{save.error instanceof Error ? save.error.message : "Не удалось сохранить"}</p>}
		</div>
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
function CoachingBubble({ note }: { note: ChatwootCoachingNote }) {
	return (
		<div className={`flex ${note.own ? "justify-end" : "justify-start"}`}>
			<article data-thread-bubble aria-label="Личная подсказка" className="chat-coaching-message min-w-0 max-w-[min(88%,42rem)]">
				<div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
					<span className="inline-flex items-center gap-1.5 text-xs font-semibold chat-text-hint">
						<LockKeyhole size={12} aria-hidden="true" /> {note.own ? "Лично агенту" : "Подсказка от супервайзера"}
					</span>
					<span className="text-[11px] text-muted">{note.own ? "Вы" : note.author}</span>
				</div>
				<p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{note.content}</p>
				<div className="mt-1 text-right text-[10px] text-muted">{dateLabel(Date.parse(note.createdAt) / 1000)}</div>
			</article>
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
				data-thread-bubble
				className={`max-w-[min(88%,42rem)] min-w-0 rounded-2xl px-3 py-2.5 shadow-sm sm:px-4 ${message.private ? "border border-amber-500/20 bg-amber-500/5" : outgoing ? "border border-accent/15 bg-accent/15" : "border border-border/80 bg-surface"}`}
			>
				{message.private && (
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide chat-text-warning">
						Внутренняя заметка
					</div>
				)}
				{!outgoing && (
					<div className="mb-1 text-[10px] font-semibold text-muted">
						{message.sender?.name || "Игрок"}
					</div>
				)}
				{message.content && (
					<div className="chatwoot-message-content break-words text-[13px] leading-relaxed">
						{renderMessageContent(message.content)}
					</div>
				)}
				{message.attachments?.map((file) => (
					<a
						key={`${file.file_name}-${file.data_url}-${file.file_size}`}
						href={
							file.data_url && /^https?:\/\//i.test(file.data_url) ? file.data_url : undefined
						}
						target={file.data_url && /^https?:\/\//i.test(file.data_url) ? "_blank" : undefined}
						rel="noreferrer"
						className={`mt-2 block text-xs ${file.data_url && /^https?:\/\//i.test(file.data_url) ? "text-accent underline" : "text-muted"}`}
					>
						{file.file_name || "Открыть вложение"}
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
					<p role="alert" className="mt-3 text-xs chat-text-danger">
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
