import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Activity,
	Archive,
	ArrowDownToLine,
	Ban,
	Bell,
	CheckCheck,
	ChevronDown,
	ContactRound,
	ExternalLink,
	FileText,
	Inbox,
	Headphones,
	Languages,
	LoaderCircle,
	ListChecks,
	LockKeyhole,
	Maximize2,
	MessageCircle,
	MessageSquareText,
	MessagesSquare,
	Minimize2,
	PanelLeftClose,
	PanelLeftOpen,
	Paperclip,
	Plus,
	RefreshCw,
	Send,
	Settings2,
	Tag,
	UserRound,
	UsersRound,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import { createElement, Fragment, type CSSProperties, type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Bind } from "@/entities/bind";
import { AgentProfileDialog } from "@/features/chatwoot/AgentProfileDialog";
import { ChatActivityPage, ChatTeamIndicator } from "@/features/chatwoot/ChatActivityPage";
import { WebsiteDomainsDialog } from "@/features/chatwoot/WebsiteDomainsDialog";
import { ChatwootWebhookSettingsDialog } from "@/features/chatwoot/ChatwootWebhookSettingsDialog";
import { assignedChatsKey, CHAT_SOUND_PREFERENCE } from "./chat-alerts";
import { ChatDirectorySettingsDialog } from "@/features/chatwoot/ChatDirectorySettingsDialog";
import { CustomAttributesDialog } from "@/features/chatwoot/CustomAttributesDialog";
import { subscribeToChatwootEvents } from "@/services/chatwoot-realtime";
import {
	type ChatwootAgent,
	type ChatwootCoachingNote,
	type ChatwootConversation,
	type ChatwootCustomAttributeDefinition,
	type ChatwootInbox,
	type ChatwootMessage,
	type ChatwootPriority,
	type ChatwootStatus,
	type ChatwootTeam,
	type ConversationSearch,
	chatwootFileBase64,
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
import { ChatwootCapacityPanel } from "./ChatwootCapacityPanel";
import { ActiveChatsTable } from "./ActiveChatsTable";
import { ChatClockProvider, chatElapsedTime, useChatClock, WaitingTime } from "./ChatClock";
import { depositTags, projectTagScope, tagsForProject, totalDepositFrom } from "./chat-tags";
import { ConversationActions, conversationPriorityLabels, conversationStatusLabels } from "./ConversationActions";
import { ChatSettingsWorkspace } from "./ChatSettingsWorkspace";
import { ChatSearch } from "./ChatFilters";
import { ChatBulkActions } from "./ChatBulkActions";
import { ChatContactEditor } from "./ChatContactEditor";
import { ChatContactsWorkspace } from "./ChatContactsWorkspace";
import { ConversationListToolbar, type ConversationFilters, countConversationFilters, emptyConversationFilters } from "./ConversationListToolbar";
import { chatWindowsReducer, ConversationWindows, initialChatWindows, MAX_CHAT_WINDOWS } from "./ConversationWindows";
import { useChatPopover } from "./useChatPopover";
import { CoachingComposer, type CoachingRecipient, CoachingThreadTabs, ObservationHeader } from "./ChatCoaching";
import { crmWorkspaceUrl } from "@/widgets/CRM/CRMFrame";
import { searchBinds } from "@/shared/lib/bind-search";
import { replyLanguageName, replyLanguages, translateChatReply } from "./reply-translation";
import "./inbox-workspace.css";

type Scope = "mine" | "queue" | "history" | "active";
type WorkspaceSection = "inbox" | "activity" | "team" | "archive" | "contacts" | "supervisor" | "settings";
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
const chatDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function dateLabel(timestamp?: number) {
	if (!timestamp) return "";
	return new Date(
		timestamp > 1e12 ? timestamp : timestamp * 1000,
	).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function conversationWaitingSince(conversation: ChatwootConversation, last = conversation.last_non_activity_message) {
	if (conversation.status !== "open" && conversation.status !== "pending") return;
	const since = conversation.waiting_since;
	if (last && !last.private) {
		const type = String(last.message_type);
		if (["1", "outgoing"].includes(type) && last.sender?.type?.toLowerCase() !== "agentbot" &&
			since && last.created_at && timestampMs(last.created_at) >= timestampMs(since)) return;
		if (!since && ["0", "incoming"].includes(type)) return last.created_at;
	}
	return since || undefined;
}

const timestampMs = (timestamp: number) => timestamp > 1e12 ? timestamp : timestamp * 1000;

function firstReplyPending(conversation: ChatwootConversation, since?: number) {
	const firstReply = conversation.first_reply_created_at;
	if (firstReply !== undefined) return firstReply === null || firstReply === 0 || firstReply === "0";
	return Boolean(since && since === conversation.created_at);
}

function ReplyTime({ timestamp }: { timestamp?: number }) {
	const now = useChatClock();
	return timestamp ? <time title={new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toLocaleString("ru-RU")}>
		{dateLabel(timestamp)} <span className="tabular-nums opacity-80">· {chatElapsedTime(timestamp, now)} назад</span>
	</time> : null;
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
	return <QueryClientProvider client={client}><ChatClockProvider><AgentInboxWorkspace notificationClient={parentClient} /></ChatClockProvider></QueryClientProvider>;
}

type CoachingDraft = { text: string; coachTo?: CoachingRecipient };
type MessageDraft = { text: string; files: File[] };
type ComposerMode = "reply" | "note";
type OperatorDraft = { mode: ComposerMode; reply: MessageDraft; note: MessageDraft; replyLanguage?: string };
type UpdateOperatorDraft = (id: number, change: (current: OperatorDraft) => OperatorDraft) => void;
const emptyMessageDraft: MessageDraft = { text: "", files: [] };
const emptyOperatorDraft: OperatorDraft = { mode: "reply", reply: emptyMessageDraft, note: emptyMessageDraft };

function AgentInboxWorkspace({ notificationClient }: { notificationClient: QueryClient }) {
	const client = useQueryClient();
	const [scope, setScope] = useState<Scope>("mine");
	const [activeSection, setActiveSection] = useState<WorkspaceSection>("inbox");
	const [railCollapsed, setRailCollapsed] = useState(false);
	const [listWidth, setListWidth] = useState(() => {
		try { return Number(localStorage.getItem("supportos:chatwoot:list-width")) || 320; } catch { return 320; }
	});
	const [activePage, setActivePage] = useState(1);
	const [bulkSelection, setBulkSelection] = useState<{ key: string; ids: Set<number> } | null>(null);
	const [bulkBusy, setBulkBusy] = useState(false);
	const [chatWindows, dispatchChatWindow] = useReducer(chatWindowsReducer, initialChatWindows);
	const [addingChat, setAddingChat] = useState(false);
	const [drafts, setDrafts] = useState(() => new Map<number, OperatorDraft>());
	const updateOperatorDraft: UpdateOperatorDraft = useCallback((id, change) => {
		setDrafts((previous) => {
			const draft = previous.get(id) ?? emptyOperatorDraft;
			const next = change(draft);
			if (next === draft) return previous;
			const updated = new Map(previous);
			if (next.mode === "reply" && !next.replyLanguage && !next.reply.text && !next.note.text && !next.reply.files.length && !next.note.files.length)
				updated.delete(id);
			else updated.set(id, next);
			return updated;
		});
	}, []);
	const rememberTitle = useCallback((id: number, title: string) => {
		dispatchChatWindow({ type: "title", id, title });
	}, []);
	const [supervisionId, setSupervisionId] = useState<number | null>(null);
	const observationTrigger = useRef<HTMLElement | null>(null);
	const supervisionDrafts = useRef(new Map<number, CoachingDraft>());
	const rememberCoachingDraft = useCallback((id: number, draft: CoachingDraft) => {
		if (draft.text) supervisionDrafts.current.set(id, draft);
		else supervisionDrafts.current.delete(id);
	}, []);
	const [realtimeSubscribed, setRealtimeSubscribed] = useState(false);
	const [coachingRealtimeConnected, setCoachingRealtimeConnected] = useState(false);
	const [webhookSeen, setWebhookSeen] = useState(false);
	const [queueOpen, setQueueOpen] = useState(true);
	const [listFilters, setListFilters] = useState<Record<Exclude<Scope, "active">, ConversationFilters>>({
		mine: emptyConversationFilters, queue: emptyConversationFilters, history: emptyConversationFilters,
	});
	const [historyStatus, setHistoryStatus] = useState<"resolved" | "snoozed">("resolved");
	const [sitesOpen, setSitesOpen] = useState(false);
	const [webhookSettingsOpen, setWebhookSettingsOpen] = useState(false);
	const [directorySettingsOpen, setDirectorySettingsOpen] = useState(false);
	const [attributesOpen, setAttributesOpen] = useState(false);
	const [profileOpen, setProfileOpen] = useState(false);
	const [agentProfileOpen, setAgentProfileOpen] = useState(false);
	const editAgentProfile = () => { setProfileOpen(false); setAgentProfileOpen(true); };
	const [soundEnabled, setSoundEnabled] = useState(() => {
		try { return localStorage.getItem(CHAT_SOUND_PREFERENCE) !== "off"; } catch { return true; }
	});
	const user = useAuthStore((s) => s.session?.user);
	const accessToken = useAuthStore((s) => s.session?.accessToken);
	const canWork = useAuthStore(
		(s) => s.session?.user.access?.permissions.includes("work") === true,
	);
	const canTranslate = user?.access?.permissions.includes("translator.use") === true;
	const binds = useKnowledgeStore((s) => s.binds);
	const remoteBinds = useKnowledgeStore((s) => s.remoteBinds);
	const composerBinds = useMemo(
		() => Array.from(new Map([...binds, ...remoteBinds].map((bind) => [bind.id, bind])).values()),
		[binds, remoteBinds],
	);
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
	const canOpenChatSettings = canManageSites || canManageWebhookSettings;
	const canBrowseContacts = capabilities?.manageAllChats === true;
	const canSupervise = capabilities?.supervise === true;
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
				void notificationClient.invalidateQueries({ queryKey: assignedChatsKey }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "conversations"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "active-overview"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "conversation-counts"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "messages"] }, { cancelRefetch: false });
				void client.invalidateQueries({ queryKey: ["chatwoot", "conversation"] }, { cancelRefetch: false });
			}, 0);
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
				onAssignment: () => {
					void client.invalidateQueries({ queryKey: assignedChatsKey });
					void notificationClient.invalidateQueries({ queryKey: assignedChatsKey }, { cancelRefetch: false });
					scheduleRefresh();
				},
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
	}, [connection.data?.configured, accessToken, user?.id, canWork, canSupervise, client, notificationClient]);
	const directory = useQuery({
		queryKey: ["chatwoot", "directory"],
		queryFn: chatwootService.inboxDirectory,
		enabled: connection.data?.configured === true,
		staleTime: 30000,
		refetchInterval: 30000,
	});
	const teamStatus = useQuery({
		queryKey: ["chatwoot", "team-status"],
		queryFn: chatwootService.teamStatus,
		enabled: connection.data?.configured === true,
		refetchInterval: 10_000,
	});
	const presence = useQuery({
		queryKey: ["chatwoot", "presence"],
		queryFn: () => chatwootService.presence(),
		enabled: connection.data?.configured === true,
		refetchInterval: 5000,
	});
	const displayedScope: Scope = activeSection === "archive" ? "history" : scope;
	const listScope = displayedScope === "active" ? "mine" : displayedScope;
	const filters = listFilters[listScope];
	const { search, inboxId, agentId, label, from, to } = filters;
	const [searchRequest, setSearchRequest] = useState({ scope: listScope, text: search });
	useEffect(() => {
		const timer = window.setTimeout(() => setSearchRequest({ scope: listScope, text: search }), 220);
		return () => window.clearTimeout(timer);
	}, [listScope, search]);
	const queryText = (searchRequest.scope === listScope ? searchRequest.text : search).trim();
	const updateListFilters = (patch: Partial<ConversationFilters>) => {
		setListFilters((current) => ({ ...current, [listScope]: { ...current[listScope], ...patch } }));
		if (patch.search === "") setSearchRequest({ scope: listScope, text: "" });
		setActivePage(1);
	};
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
	const request: ConversationSearch = {
		scope: displayedScope,
		status: displayedScope === "history" ? historyStatus : "open",
		page: activePage,
		...(inboxId ? { inboxId: Number(inboxId) } : {}),
		...(displayedScope === "history" && canSupervise && agentId ? { agentId: Number(agentId) } : {}),
		...(label ? { label } : {}),
		...(displayedScope === "history" && from ? { from } : {}),
		...(displayedScope === "history" && to ? { to } : {}),
		...(queryText ? { query: queryText } : {}),
	};
	const conversations = useQuery({
		queryKey: ["chatwoot", "conversations", request],
		queryFn: () => chatwootService.conversations(request),
		enabled: connection.data?.configured === true && displayedScope !== "active" && (activeSection === "inbox" || activeSection === "archive"),
		staleTime: displayedScope === "queue" ? 2000 : 0,
		refetchInterval: displayedScope === "history" ? 20000 : realtimeConnected ? 12000 : 3000,
		refetchIntervalInBackground: displayedScope !== "history",
		retry: 1,
	});
	const conversationCounts = useQuery({
		queryKey: ["chatwoot", "conversation-counts", listScope === "queue" ? inboxId : "", user?.email],
		queryFn: () => chatwootService.conversationCounts(listScope === "queue" && inboxId ? Number(inboxId) : undefined),
		enabled: connection.data?.configured === true && ["inbox", "team", "activity"].includes(activeSection),
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
			void client.invalidateQueries({ queryKey: ["chatwoot", "team-status"] });
		},
	});
	const chatCapacity = useMutation({
		mutationFn: ({ agentId, maxActiveChats }: { agentId: number; maxActiveChats: number }) => chatwootService.setAgentCapacity(agentId, maxActiveChats),
		onSuccess: async ({ agentId, maxActiveChats }) => {
			const key = ["chatwoot", "directory"];
			await client.cancelQueries({ queryKey: key });
			client.setQueryData<Awaited<ReturnType<typeof chatwootService.inboxDirectory>>>(key, (current) =>
				current ? { ...current, agents: current.agents.map((agent) => agent.id === agentId ? { ...agent, max_active_chats: maxActiveChats } : agent) } : current,
			);
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversations"] });
			void client.invalidateQueries({ queryKey: key });
		},
	});
	const takeConversation = useMutation({
		mutationFn: ({ id }: { id: number; add?: boolean; replaceId?: number }) => chatwootService.take(id),
		onSuccess: (_result, { id, add, replaceId }) => { if (activeSection === "inbox" && scope === "queue") openTakenChat(id, { add, replaceId }); },
		onMutate: async ({ id }) => {
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
		onSettled: (_result, _error, { id }) => {
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversation", id] });
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
	const bulkKey = JSON.stringify([activeSection, request, filters.search]);
	const canSelectChats = activeSection === "inbox" && displayedScope === "mine" && canWork;
	const selectedChats = canSelectChats && bulkSelection?.key === bulkKey ? bulkSelection.ids : undefined;
	const updateSelectedChats = (ids: number[]) => setBulkSelection((current) =>
		current?.key === bulkKey ? { key: bulkKey, ids: new Set(ids) } : current,
	);
	const placeConversation = (id: number, options: { title?: string; add?: boolean; replaceId?: number } = {}) => {
		dispatchChatWindow({ type: "open", id, ...options });
		setAddingChat(false);
		if (window.matchMedia("(width < 768px)").matches) setQueueOpen(false);
	};
	const closeConversation = (id: number) => {
		dispatchChatWindow({ type: "close", id });
		if (chatWindows.panes.length === 1) {
			setAddingChat(false);
			if (window.matchMedia("(width < 768px)").matches) setQueueOpen(true);
		}
	};
	const openObservation = (id: number) => {
		setSupervisionId(id);
	};
	const startObservation = (id: number) => {
		observationTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		openObservation(id);
		if (!watched.has(id) && !changeWatch.isPending) changeWatch.mutate({ id, enabled: true });
	};
	const closeObservation = () => {
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
		if (section === activeSection) {
			if (section === "archive" || (section === "inbox" && scope !== "active")) setQueueOpen(true);
			return;
		}
		setBulkSelection(null);
		if (section === "inbox") setScope("mine");
		if (section === "archive") setScope("history");
		if (section === "inbox" || section === "archive") {
			setQueueOpen(true);
		} else setAddingChat(false);
		setActivePage(1);
	};
	const selectScope = (next: Scope) => {
		if (next !== "active") setQueueOpen(true);
		if (next === scope) return;
		setBulkSelection(null);
		setScope(next);
		if (next === "active") setAddingChat(false);
		setActivePage(1);
	};
	const toggleSound = () => {
		const next = !soundEnabled;
		try { localStorage.setItem(CHAT_SOUND_PREFERENCE, next ? "on" : "off"); } catch { /* preference remains in session */ }
		setSoundEnabled(next);
	};
	const resizeList = (width: number) => {
		const next = Math.min(520, Math.max(260, width));
		setListWidth(next);
		try { localStorage.setItem("supportos:chatwoot:list-width", String(next)); } catch { /* preference remains in session */ }
	};
	const openTakenChat = (id: number, placement: { add?: boolean; replaceId?: number }) => {
		setScope("mine");
		setActivePage(1);
		placeConversation(id, placement);
	};
	const prefetchQueue = () => {
		if (scope === "queue" || activeSection !== "inbox") return;
		const queueFilters = listFilters.queue;
		const project = queueFilters.inboxId;
		const queueRequest: ConversationSearch = {
			scope: "queue",
			status: "open",
			page: 1,
			...(project ? { inboxId: Number(project) } : {}),
			...(queueFilters.label ? { label: queueFilters.label } : {}),
			...(queueFilters.search.trim() ? { query: queueFilters.search.trim() } : {}),
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
		<div className="supportos-inbox flex h-full min-h-0 w-full text-foreground">
			<InboxRail
				activeSection={activeSection}
				collapsed={railCollapsed}
				onToggleCollapsed={() => setRailCollapsed((value) => !value)}
				userEmail={user?.email ?? ""}
				accessRole={capabilities?.role}
				accepting={presence.data?.current.accepting === true}
				acceptingPending={accepting.isPending || presence.isLoading || !presence.data}
				handoffPending={presence.data?.current.handoffPending === true}
				profileOpen={profileOpen}
				profileAgent={agents.find((agent) => agent.id === presence.data?.current.agentId)}
				onEditProfile={editAgentProfile}
				soundEnabled={soundEnabled}
				onAccept={() => accepting.mutate(!presence.data?.current.accepting)}
				onSelect={selectSection}
				canSupervise={canSupervise}
				onToggleProfile={() => setProfileOpen(!profileOpen)}
				onToggleSound={toggleSound}
				canOpenChatSettings={canOpenChatSettings}
				canBrowseContacts={canBrowseContacts}
			/>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			{(presence.isError || accepting.isError) && (
				<div
					role="alert"
					className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs chat-text-warning"
				>
					{presence.error instanceof Error
						? presence.error.message
						: accepting.error instanceof Error
							? accepting.error.message
							: "Не удалось проверить статус агента"}
				</div>
			)}
			<div className="flex min-h-0 flex-1 flex-col">
				{activeSection === "inbox" && <nav className="chat-scope-bar" aria-label="Списки диалогов">
					<div className="chat-scope-tabs">
						{([{ id: "mine", title: "Мои", icon: MessageSquareText, count: conversationCounts.data?.mineCount },
							{ id: "queue", title: "Очередь", icon: Inbox, count: conversationCounts.data?.queueCount },
							...(canSupervise ? [{ id: "active" as const, title: "Активные", icon: Activity, count: conversationCounts.data?.activeCount }] : [])] as const).map(({ id, title, icon: Icon, count }) => (
							<button key={id} type="button" aria-pressed={scope === id} data-scope={id} onClick={() => selectScope(id)}
								onPointerEnter={id === "queue" ? prefetchQueue : undefined} onFocus={id === "queue" ? prefetchQueue : undefined} className="chat-scope-tab">
								<Icon size={15} className="chat-scope-icon" aria-hidden="true" />
								{title}<span className="chat-scope-count">{conversationCounts.isLoading ? "…" : count ?? "—"}</span>
							</button>
						))}
					</div>
					<ChatTeamIndicator team={teamStatus.data} active={conversationCounts.data?.activeCount} onOpen={() => selectSection("team")} />
					<span className="chat-connection" data-live={realtimeConnected} role="status" title={realtimeConnected ? "Обновляется онлайн" : "Автообновление"}>
						<i aria-hidden="true" />
						<span>{realtimeConnected ? "Обновляется онлайн" : "Автообновление"}</span>
					</span>
				</nav>}
				{(activeSection === "activity" || activeSection === "team") && <div className="chat-scope-bar">
					<ChatTeamIndicator team={teamStatus.data} active={conversationCounts.data?.activeCount} onOpen={() => selectSection("team")} />
				</div>}
				<div className="flex min-h-0 flex-1">
				{activeSection === "activity" ? (
					<ChatActivityPage team={teamStatus.data} />
				) : activeSection === "supervisor" ? (
					<ChatOperationsPage agents={agents} inboxes={inboxes} canEdit={canManageChatCapacity}
						onOpen={(id) => { selectSection("inbox"); setScope("active"); startObservation(id); }} />
				) : activeSection === "settings" && canOpenChatSettings ? (
					<ChatSettingsWorkspace
						onSources={canManageSites ? () => setSitesOpen(true) : undefined}
						onDirectory={canManageSites ? () => setDirectorySettingsOpen(true) : undefined}
						onFields={canManageSites ? () => setAttributesOpen(true) : undefined}
						onWebhooks={canManageWebhookSettings ? () => setWebhookSettingsOpen(true) : undefined}
					/>
				) : activeSection === "contacts" && canBrowseContacts ? (
					<ChatContactsWorkspace inboxes={inboxes} onConversation={(id, title) => { selectSection("inbox"); placeConversation(id, { title }); }} />
				) : activeSection === "team" ? (
					<TeamWorkspace
						agents={agents}
						inboxes={inboxes}
						teams={directory.data?.teams ?? []}
						presence={directory.data?.presence ?? []}
						currentAgentId={presence.data?.current.agentId}
						canManageChatCapacity={canManageChatCapacity}
						canInvite={canManageSites}
						onManageTeams={canManageSites ? () => setDirectorySettingsOpen(true) : undefined}
						onEditProfile={editAgentProfile}
						onSetCapacity={async (agentId, maxActiveChats) => { await chatCapacity.mutateAsync({ agentId, maxActiveChats }); }}
						loading={directory.isLoading}
						error={directory.error?.message}
						onRetry={() => void directory.refetch()}
					/>
				) : <>
				{queueOpen && scope !== "active" && (
					<aside aria-label={displayedScope === "history" ? "Архив диалогов" : "Список диалогов"} style={{ "--chat-list-width": `${listWidth}px` } as CSSProperties} className="chat-list flex w-full min-w-0 shrink-0 flex-col border-r border-border md:w-[var(--chat-list-width)] md:min-w-[260px] md:max-w-[min(520px,45%)]">
						{chatWindows.panes.length > 0 && <button type="button" className="chat-window-list-back md:hidden" onClick={() => { setAddingChat(false); setQueueOpen(false); }}>
							<PanelLeftClose size={14} /> К открытым чатам
						</button>}
						<div className="chat-list-heading">
							<div className="chat-list-heading-icon" aria-hidden="true">
								{listScope === "history" ? <Archive size={17} /> : listScope === "queue" ? <Inbox size={17} /> : <MessagesSquare size={17} />}
							</div>
							<h2>{listScope === "mine" ? "Мои диалоги" : listScope === "queue" ? "Ожидают назначения" : "Архив диалогов"}</h2>
							{conversations.isSuccess && <span title="На этой странице" className="chat-scope-count">{rows.length}</span>}
						</div>
						<ConversationListToolbar key={listScope} userId={user?.id} scope={listScope} filters={filters} update={updateListFilters}
							project={inboxId}
							inboxes={inboxes} agents={agents} labels={labels} canFilterByAgent={canSupervise}
							historyStatus={historyStatus} onHistoryStatus={(value) => { setHistoryStatus(value); setActivePage(1); }}
						/>
						{addingChat && <div className="chat-window-choose">
							<p role="status">Выберите чат для нового окна <span className="whitespace-nowrap">({chatWindows.panes.length + 1} из {MAX_CHAT_WINDOWS})</span></p>
							<button type="button" className="shrink-0 rounded-md px-2 py-1.5 text-xs hover:bg-surface-elevated" onClick={() => setAddingChat(false)}>Отмена</button>
						</div>}
						{selectedChats && !addingChat ? <ChatBulkActions key={bulkKey} available={rows.map((row) => row.id)} selected={selectedChats}
							agents={agents} onSelect={updateSelectedChats} onClose={() => setBulkSelection(null)} onChanged={reload} onBusy={setBulkBusy} />
							: canSelectChats && rows.length > 1 && !addingChat && (
								<button type="button" disabled={bulkBusy} onClick={() => setBulkSelection({ key: bulkKey, ids: new Set() })} className="chat-batch-trigger">
									<ListChecks size={14} aria-hidden="true" /> Выбрать несколько
								</button>
							)}
						{takeConversation.isError && (
							<div role="alert" className="border-b border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] chat-text-danger">
								{takeConversation.error instanceof Error ? takeConversation.error.message : "Не удалось взять чат"}
							</div>
						)}
						<div className="chat-list-results supportos-scroll min-h-0 flex-1 overflow-y-auto">
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
										: "Не удалось загрузить диалоги"}
									</p>
									<button type="button" onClick={() => void conversations.refetch()} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-elevated">Повторить</button>
								</div>
							) : rows.length === 0 ? (
								<div className="chat-list-empty">
									<Inbox size={22} aria-hidden="true" className="chat-empty-icon" />
									<p className="text-sm font-medium">{search.trim() || countConversationFilters(filters) ? "Диалогов не найдено" : listScope === "queue" ? "Очередь пуста" : listScope === "history" ? (historyStatus === "snoozed" ? "Нет отложенных диалогов" : "Нет завершённых диалогов") : "У вас нет открытых диалогов"}</p>
									{(search.trim() || countConversationFilters(filters) > 0) && <button type="button" onClick={() => updateListFilters(emptyConversationFilters)} className="rounded-md px-2 py-1.5 text-xs text-accent hover:bg-surface-elevated">Очистить поиск и фильтры</button>}
									{listScope === "mine" && !search.trim() && countConversationFilters(filters) === 0 && <button type="button" onClick={() => selectScope("queue")} className="rounded-md px-2 py-1.5 text-xs text-accent hover:bg-surface-elevated">Посмотреть очередь</button>}
								</div>
							) : (
								rows.map((item) => (
									<ConversationRow
										key={item.id}
										conversation={item}
										project={inboxes.find((project) => project.id === item.inbox_id)}
										active={chatWindows.activeId === item.id}
										opened={chatWindows.panes.some((pane) => pane.id === item.id)}
										checked={selectedChats?.has(item.id)}
										onCheck={selectedChats && !addingChat ? (checked) => updateSelectedChats(checked ? [...selectedChats, item.id] : [...selectedChats].filter((id) => id !== item.id)) : undefined}
										checkBusy={bulkBusy}
										onClick={() => placeConversation(item.id, { add: addingChat, title: item.meta?.sender?.name || item.meta?.sender?.email })}
										onTake={
											displayedScope === "queue"
												? () => takeConversation.mutate({ id: item.id, add: addingChat, replaceId: chatWindows.activeId ?? undefined })
												: undefined
										}
										taking={takeConversation.isPending && takeConversation.variables?.id === item.id}
										takeDisabled={takeConversation.isPending}
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
				{queueOpen && scope !== "active" && <div className="chat-pane-divider hidden md:block"><ResizeHandle label="Изменить ширину списка" value={listWidth} min={260} max={520} onResize={resizeList} /></div>}
				<main className={`relative min-h-0 min-w-0 flex-1 flex-col ${queueOpen && scope !== "active" ? "hidden md:flex" : "flex"}`}>
					{scope === "active" && canSupervise ? (
						<div className="chat-observation-layout relative flex min-h-0 min-w-0 flex-1" data-observation-open={supervisionId !== null}>
							<ActiveChatsTable userId={user?.id} agents={agents} inboxes={inboxes} teams={directory.data?.teams ?? []}
								labels={labels} realtime={realtimeConnected} selectedId={supervisionId} watched={watched}
								counts={conversationCounts.data}
								onRefreshCounts={() => { void conversationCounts.refetch(); void watching.refetch(); }}
								watchingError={(changeWatch.error ?? watching.error)?.message}
								changingId={changeWatch.isPending ? changeWatch.variables?.id : undefined}
								onOpen={startObservation}
								onStop={(id) => changeWatch.mutate({ id, enabled: false })}
							/>
							{supervisionId !== null && (
								<aside aria-label="Наблюдение за диалогом" className="chat-observation-panel absolute inset-0 z-30 flex min-h-0 min-w-0 flex-col border-l border-border bg-surface shadow-xl xl:static xl:w-[45%] xl:min-w-[460px] xl:shrink-0 xl:shadow-none">
									<ObservationHeader key={`header-${supervisionId}`} watching={watched.has(supervisionId)} watchPending={changeWatch.isPending}
										onStop={() => changeWatch.mutate({ id: supervisionId, enabled: false })}
										onClose={closeObservation} />
									{changeWatch.isError && changeWatch.variables?.id === supervisionId && (
										<p role="alert" className="border-b border-border px-3 py-2 text-xs chat-text-danger">{changeWatch.error.message}</p>
									)}
									<ConversationPane key={supervisionId} id={supervisionId}
										supervising docked
										coachingDraft={supervisionDrafts.current.get(supervisionId)}
										onCoachingDraft={rememberCoachingDraft}
										onOpenRelated={openObservation} realtimeConnected={realtimeConnected}
										coachingRealtimeConnected={coachingRealtimeConnected}
										agents={agents} teams={directory.data?.teams ?? []} inboxes={inboxes} labels={labels}
										binds={[]} language={language} onLanguage={setLanguage}
										onClose={closeObservation} onChanged={reload} onChoose={openEmptyPane}
									/>
								</aside>
							)}
						</div>
					) : (
					<ConversationWindows state={chatWindows} listOpen={queueOpen} choosing={addingChat}
						onToggleList={() => { if (queueOpen) setAddingChat(false); setQueueOpen(!queueOpen); }}
						onAdd={() => { if (!bulkBusy) setBulkSelection(null); setAddingChat(!addingChat); setQueueOpen(true); }}
						onFocus={(id) => dispatchChatWindow({ type: "focus", id })}
						renderPane={(id, { visible, tiled, canExpand, expanded, listControl, addControl }) => <ConversationPane
							id={id}
							listControl={listControl}
							addControl={addControl}
							visible={visible}
							selected={id !== null && id === chatWindows.activeId}
							tiled={tiled}
							expanded={expanded}
							onExpand={canExpand && id !== null ? () => dispatchChatWindow({ type: "expand", id }) : undefined}
							operatorDraft={id == null ? undefined : drafts.get(id)}
							onOperatorDraft={updateOperatorDraft}
							onTitle={rememberTitle}
							onOpenRelated={(relatedId) => placeConversation(relatedId, { replaceId: id ?? undefined })}
							realtimeConnected={realtimeConnected}
							coachingRealtimeConnected={coachingRealtimeConnected}
							canTranslate={canTranslate}
							nativeAutoTranslate={connection.data?.nativeAutoTranslate === true}
							agents={agents}
							teams={directory.data?.teams ?? []}
							inboxes={inboxes}
							labels={labels}
							binds={composerBinds}
							language={language}
							onLanguage={setLanguage}
							onClose={() => { if (id !== null) closeConversation(id); }}
							onTake={displayedScope === "queue" ? (id) => takeConversation.mutate({ id, replaceId: id }) : undefined}
							takeDisabled={takeConversation.isPending}
							onChanged={reload}
							onChoose={openEmptyPane}
						/>}
					/>
					)}
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
			{agentProfileOpen && <AgentProfileDialog onClose={() => setAgentProfileOpen(false)} profileUrl={connection.data?.profileUrl} />}
		</div>
	);
}

function ResizeHandle({ label, value, min, max, onResize, fromEnd = false }: {
	label: string;
	value: number;
	min: number;
	max: number;
	onResize: (coordinate: number) => void;
	fromEnd?: boolean;
}) {
	const drag = useRef<{ origin: number; value: number } | null>(null);
	const resizeTo = (next: number) => onResize(Math.min(max, Math.max(min, next)));
	return (
		<hr
			aria-label={label}
			aria-orientation="vertical"
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={Math.round(value)}
			tabIndex={0}
			onKeyDown={(event) => {
				if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
				event.preventDefault();
				if (event.key === "Home" || event.key === "End") {
					resizeTo(event.key === "Home" ? min : max);
					return;
				}
				resizeTo(value + (event.key === "ArrowLeft" ? -16 : 16) * (fromEnd ? -1 : 1));
			}}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				drag.current = { origin: event.clientX, value };
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
				const offset = event.clientX - drag.current.origin;
				resizeTo(drag.current.value + offset * (fromEnd ? -1 : 1));
			}}
			onLostPointerCapture={() => { drag.current = null; }}
			className="chat-pane-resize"
		/>
	);
}

function InboxRail({ activeSection, collapsed, onToggleCollapsed, userEmail, accessRole, accepting, acceptingPending, handoffPending, profileOpen, profileAgent, onEditProfile, soundEnabled, onAccept, onSelect, canSupervise, onToggleProfile, onToggleSound, canOpenChatSettings, canBrowseContacts }: {
	activeSection: WorkspaceSection;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	userEmail: string;
	accessRole?: "support" | "shift" | "qc" | "admin" | "creator";
	accepting: boolean;
	acceptingPending: boolean;
	handoffPending: boolean;
	profileOpen: boolean;
	profileAgent?: ChatwootAgent;
	onEditProfile: () => void;
	soundEnabled: boolean;
	onAccept: () => void;
	onSelect: (section: WorkspaceSection) => void;
	canSupervise: boolean;
	onToggleProfile: () => void;
	onToggleSound: () => void;
	canOpenChatSettings: boolean;
	canBrowseContacts: boolean;
}) {
	const profile = useChatPopover<HTMLElement>(profileOpen, onToggleProfile);
	const items: Array<{ id: WorkspaceSection; label: string; icon: typeof MessagesSquare }> = [
		{ id: "inbox", label: "Диалоги", icon: MessagesSquare },
		{ id: "activity", label: "Активность", icon: Activity },
		{ id: "team", label: "Команда", icon: UsersRound },
		{ id: "archive", label: "Архив", icon: Archive },
	];
	if (canBrowseContacts) items.push({ id: "contacts", label: "Контакты", icon: ContactRound });
	if (canSupervise) items.push({ id: "supervisor", label: "Руководитель", icon: Headphones });
	if (canOpenChatSettings) items.push({ id: "settings", label: "Настройки чатов", icon: Settings2 });
	return (
		<aside ref={profile} data-compact={collapsed} className="chat-rail relative z-40 flex shrink-0 flex-col items-center border-r border-border py-2 transition-[width] duration-200 md:py-3">
			<nav aria-label="Рабочие разделы чатов" className="flex w-full flex-col gap-1 px-1.5 md:px-2">
				{items.map(({ id, label, icon: Icon }) => (
					<button key={id} type="button" title={label} aria-label={label} aria-current={activeSection === id ? "page" : undefined} onClick={() => { if (profileOpen) onToggleProfile(); onSelect(id); }} className={`flex h-10 w-full items-center gap-2.5 rounded-lg text-left text-xs font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground ${collapsed ? "justify-center" : "px-2.5"}`}>
						<Icon size={16} className="shrink-0" />
						{!collapsed && <span className="chat-rail-caption truncate">{label}</span>}
					</button>
				))}
			</nav>
			<div className="mt-auto w-full">
			<button type="button" aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"} title={collapsed ? "Развернуть меню" : "Свернуть меню"} onClick={onToggleCollapsed} className="chat-rail-toggle mb-1 ml-auto mr-2 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated">
				{collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
			</button>
			<div className={`chat-rail-footer flex w-full items-center gap-2 border-t border-border px-2 pt-2 ${collapsed ? "justify-center" : ""}`}>
				<button type="button" title="Профиль агента" aria-label="Профиль агента" aria-expanded={profileOpen} onClick={onToggleProfile} className="relative grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-xs font-semibold hover:border-accent/60">
					<ChatAvatar name={profileAgent?.available_name || profileAgent?.name || userEmail} src={profileAgent?.thumbnail} />
					<span className={`absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface ${accepting ? "bg-emerald-400" : "bg-muted"}`} />
				</button>
				{!collapsed && <button type="button" onClick={onToggleProfile} className="chat-rail-copy min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{profileAgent?.available_name || profileAgent?.name || userEmail.split("@")[0] || "Агент"}</span><span className="block truncate text-[11px] text-muted">{handoffPending ? "Передача чатов…" : acceptingPending ? "Загружаем статус…" : accepting ? "Принимаю чаты" : "Приём выключен"}</span></button>}
			</div>
			</div>
			{profileOpen && (
				<div className="chat-rail-profile supportos-scroll absolute bottom-2 left-[calc(100%+8px)] z-50 w-64 overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-xl">
					<div className="border-b border-border px-3 py-2.5">
						<div className="text-xs font-semibold">Настройки агента</div>
						<div className="mt-1 truncate text-[11px] text-muted">{userEmail || "Аккаунт SupportOS"}</div>
						{accessRole && <div className="mt-1 text-[10px] font-medium text-accent">Роль SupportOS · {({ support: "Support", shift: "Shift", qc: "QC", admin: "Admin", creator: "Creator" })[accessRole]}</div>}
					</div>
					<button type="button" role="switch" aria-label="Приём чатов" aria-checked={accepting} disabled={acceptingPending || handoffPending} onClick={onAccept} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-3 text-left hover:bg-surface-elevated disabled:opacity-50">
						<span><span className="block text-xs font-medium">Приём чатов</span><span className="mt-0.5 block text-[10px] text-muted">{handoffPending ? "Передаём активные чаты после обрыва связи" : accepting ? "Вы в очереди распределения" : "Новые диалоги не назначаются"}</span></span>
						<span className={`h-5 w-9 rounded-full p-0.5 transition ${accepting ? "bg-emerald-500" : "bg-surface-elevated"}`}><span className={`block size-4 rounded-full bg-white transition ${accepting ? "translate-x-4" : ""}`} /></span>
					</button>
					<button type="button" role="switch" aria-label="Звук уведомлений" aria-checked={soundEnabled} onClick={onToggleSound} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-xs hover:bg-surface-elevated">
						{soundEnabled ? <Volume2 size={15} className="shrink-0" /> : <VolumeX size={15} className="shrink-0" />}
						<span className="flex-1">Звук уведомлений</span>
						<span className="text-[11px] text-muted">{soundEnabled ? "Вкл." : "Выкл."}</span>
					</button>
					<BrowserChatNotifications />
					<button type="button" onClick={onEditProfile} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-xs hover:bg-surface-elevated"><UserRound size={15} /> Имя и фото в чате</button>
					<Link to="/settings" className="flex items-center gap-2.5 rounded-lg px-3 py-3 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"><Settings2 size={15} /> Личные настройки SupportOS</Link>
				</div>
			)}
		</aside>
	);
}

function BrowserChatNotifications() {
	const [permission, setPermission] = useState(() =>
		typeof Notification === "undefined" ? null : Notification.permission,
	);
	if (permission === null) return null;
	if (permission === "default") return (
		<button type="button" onClick={() => void Notification.requestPermission().then(setPermission).catch(() => undefined)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-xs hover:bg-surface-elevated">
			<Bell size={15} className="shrink-0" /> Включить уведомления браузера
		</button>
	);
	return <div className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-muted">
		<Bell size={15} className="shrink-0" />
		{permission === "granted" ? "Уведомления браузера включены" : "Разрешите уведомления в настройках сайта"}
	</div>;
}

function TeamWorkspace({ agents, inboxes, teams, presence, currentAgentId, canManageChatCapacity, canInvite, onEditProfile, onManageTeams, onSetCapacity, loading, error, onRetry }: {
	agents: ChatwootAgent[];
	inboxes: ChatwootInbox[];
	teams: ChatwootTeam[];
	presence: Array<{ chatwoot_agent_id: number; accepting: boolean; max_active_chats?: number; heartbeat_at: string }>;
	currentAgentId?: number;
	canManageChatCapacity: boolean;
	canInvite: boolean;
	onEditProfile: () => void;
	onManageTeams?: () => void;
	onSetCapacity: (agentId: number, maxActiveChats: number) => Promise<void>;
	loading: boolean;
	error?: string;
	onRetry: () => void;
}) {
	const [tab, setTab] = useState<"agents" | "teams">("agents");
	const [search, setSearch] = useState("");
	const [acceptingOnly, setAcceptingOnly] = useState(false);
	const [inviteOpen, setInviteOpen] = useState(false);
	const online = new Map(presence.filter((item) => Date.now() - Date.parse(item.heartbeat_at) < 90_000).map((item) => [item.chatwoot_agent_id, item]));
	const query = search.trim().toLowerCase();
	const filteredAgents = agents.filter((agent) =>
		(!acceptingOnly || online.get(agent.id)?.accepting) &&
		`${agent.name} ${agent.email ?? ""}`.toLowerCase().includes(query),
	);
	const filteredTeams = teams.filter((team) => team.name.toLowerCase().includes(query));
	return (
		<section aria-label="Команда чатов" className="chat-secondary-workspace supportos-scroll min-h-0 min-w-0 flex-1 overflow-auto p-2.5 sm:p-6">
			<div className="mx-auto max-w-5xl">
				<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-3">
					<StatCard label="Агенты" value={agents.length} icon={<UsersRound size={16} />} />
					<StatCard label="В сети в SupportOS" value={online.size} icon={<Activity size={16} />} />
					<StatCard label="Принимают чаты" value={[...online.values()].filter((agent) => agent.accepting).length} icon={<Headphones size={16} />} />
					<StatCard label="Команды" value={teams.length} icon={<MessagesSquare size={16} />} />
				</div>
				<div className="chat-support-panel mt-3 overflow-hidden sm:mt-5">
					<div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5 sm:p-3">
						<div role="group" aria-label="Справочник команды" className="chat-menu-tabs flex">
							<button type="button" aria-pressed={tab === "agents"} onClick={() => { setTab("agents"); setSearch(""); }}>Агенты</button>
							<button type="button" aria-pressed={tab === "teams"} onClick={() => { setTab("teams"); setSearch(""); }}>Команды</button>
						</div>
						<div className="order-last min-w-0 basis-full sm:order-0 sm:ml-auto sm:max-w-xs sm:flex-1">
							<ChatSearch label={tab === "agents" ? "Найти агента" : "Найти команду"} placeholder={tab === "agents" ? "Имя или почта агента" : "Название команды"} value={search} onChange={setSearch} />
						</div>
						{tab === "agents" && <button type="button" onClick={onEditProfile} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs hover:bg-surface-elevated"><UserRound size={13} /> Имя и фото в чате</button>}
						{tab === "agents" && canInvite && <button type="button" aria-expanded={inviteOpen} onClick={() => setInviteOpen(!inviteOpen)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-2 text-xs font-semibold text-white"><Plus size={14} /> Добавить агента</button>}
						{tab === "teams" && onManageTeams && <button type="button" onClick={onManageTeams} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs hover:bg-surface-elevated"><UsersRound size={14} /> Управлять командами</button>}
					</div>
					{tab === "agents" && canInvite && inviteOpen && <InviteAgentForm onAdded={onRetry} />}
					{tab === "agents" && <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted">
						<label className="chat-team-filter"><input type="checkbox" checked={acceptingOnly} onChange={(event) => setAcceptingOnly(event.target.checked)} /> Только принимающие</label>
						<span className="shrink-0 tabular-nums" title="Показано агентов">{filteredAgents.length} / {agents.length}</span>
					</div>}
					{tab === "agents" ? filteredAgents.map((agent) => {
						const state = online.get(agent.id);
						const isOnline = state != null;
						const status = state?.accepting && isOnline ? "Принимает" : isOnline ? "В SupportOS" : agent.availability_status === "online" ? "В Chatwoot" : "Не в сети";
						return <div key={agent.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 border-b border-border/70 px-3 py-3 last:border-0 md:flex md:gap-3 md:px-4">
							<div className="chat-avatar chat-avatar-small overflow-hidden" data-tone={agent.id % 4}><ChatAvatar name={agent.name} src={agent.thumbnail} /></div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium" title={agent.name}>{agent.name}{agent.id === currentAgentId && <span className="ml-2 text-[10px] text-accent">Вы</span>}</div>
								<div className="truncate text-xs text-muted" title={agent.email}>{agent.email || "Почта не указана"}</div>
								{agent.available_name && agent.available_name !== agent.name && <div className="truncate text-xs text-muted">В чате · {agent.available_name}</div>}
							</div>
							<div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-2">
								<span className="hidden rounded-full bg-background px-2 py-1 text-[11px] text-muted lg:block">{agent.role === "administrator" ? "Администратор" : "Агент"}</span>
								<span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted"><i className={`size-1.5 rounded-full ${state?.accepting && isOnline ? "bg-emerald-400" : isOnline ? "bg-amber-300" : "bg-zinc-500"}`} />{status}</span>
								<AgentCapacityField agent={agent} editable={canManageChatCapacity} onSave={onSetCapacity} />
							</div>
						</div>;
					}) : filteredTeams.map((team) => <div key={team.id} className="flex flex-wrap items-center gap-3 border-b border-border/70 p-3 last:border-0 sm:p-4"><div className="chat-settings-icon"><UsersRound size={17} /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{team.name}</div><div className="text-xs text-muted">{team.description || (team.agents ? `Участников: ${team.agents.length}` : "")}</div></div>{typeof team.allow_auto_assign === "boolean" && <span className="rounded-full bg-background px-2.5 py-1 text-[11px] text-muted">{team.allow_auto_assign ? "Автоназначение" : "Ручное назначение"}</span>}</div>)}
					{loading && <div role="status" className="p-7 text-center text-sm text-muted"><LoaderCircle className="mr-2 inline animate-spin" size={15} />Загружаем команду…</div>}
					{error && <div role="alert" className="space-y-2 p-7 text-center text-sm chat-text-danger"><p>{error}</p><button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground">Повторить</button></div>}
					{!loading && !error && (tab === "agents" ? filteredAgents.length === 0 : filteredTeams.length === 0) && <div className="p-7 text-center text-sm text-muted">{query ? "По запросу ничего не найдено" : tab === "agents" ? (acceptingOnly ? "Сейчас никто не принимает чаты" : "Нет доступных агентов") : "Команд пока нет"}</div>}
				</div>
				{canInvite && <ChatwootCapacityPanel inboxes={inboxes} />}
			</div>
		</section>
	);
}

function InviteAgentForm({ onAdded }: { onAdded: () => void }) {
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const invite = useMutation({ mutationFn: () => chatwootService.inviteAgent(email.trim(), name.trim()), onSuccess: onAdded });
	const field = "mt-1 block h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";
	return <form className="grid gap-2 border-b border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); invite.mutate(); }}>
		<label className="text-xs text-muted">Рабочая почта в SupportOS<input type="email" required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); invite.reset(); }} className={field} /></label>
		<label className="text-xs text-muted">Имя в Chatwoot<input value={name} maxLength={100} onChange={(event) => { setName(event.target.value); invite.reset(); }} className={field} /></label>
		<button type="submit" disabled={invite.isPending || invite.isSuccess} className="h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-elevated disabled:opacity-50">{invite.isPending ? "Добавляем…" : "Добавить в Chatwoot"}</button>
		{invite.isError && <p role="alert" className="text-xs chat-text-danger sm:col-span-3">{invite.error.message}</p>}
		{invite.isSuccess && <output className="text-xs chat-text-success sm:col-span-3">{invite.data.alreadyLinked ? "Пользователь уже связан с агентом Chatwoot по рабочей почте." : "Агент добавлен в Chatwoot. Доступ к проектам можно выдать в настройках источников."}</output>}
	</form>;
}

function ChatAvatar({ src, name }: { src?: string; name?: string }) {
	const [failed, setFailed] = useState<string>();
	return src && /^https:\/\//i.test(src) && src !== failed
		? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} className="size-full rounded-full object-cover" /> : initials(name);
}

function AgentCapacityField({ agent, editable, onSave }: {
	agent: ChatwootAgent;
	editable: boolean;
	onSave: (agentId: number, maxActiveChats: number) => Promise<void>;
}) {
	const limit = agent.max_active_chats ?? 4;
	const [value, setValue] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{ text: string; error: boolean }>();
	if (!editable)
		return <span className="rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted">Лимит SupportOS · {limit}</span>;
	const number = value === null ? limit : Number(value);
	const valid = value !== "" && Number.isInteger(number) && number >= 1 && number <= 250;
	return (
		<form className="flex flex-wrap items-center gap-1.5" onSubmit={async (event) => {
			event.preventDefault();
			if (!valid || number === limit || saving) return;
			setSaving(true);
			try {
				await onSave(agent.id, number);
				setValue(null);
				setMessage({ text: "Лимит сохранён", error: false });
			} catch (error) {
				setMessage({ text: error instanceof Error ? error.message : "Не удалось сохранить лимит", error: true });
			} finally {
				setSaving(false);
			}
		}}>
			<label className="flex items-center gap-1.5 text-[11px] text-muted">
				<span>Лимит SupportOS</span>
				<input aria-label={`Максимум чатов для ${agent.name}`} value={value ?? limit} type="number" min={1} max={250} required disabled={saving}
					onChange={(event) => { setValue(event.target.value); setMessage(undefined); }}
					className="h-8 w-14 rounded-lg border border-border bg-background px-1 text-center text-xs text-foreground disabled:opacity-50" />
			</label>
			{(number !== limit || !valid) && <button type="submit" disabled={!valid || saving} className="min-h-8 rounded-md border border-border px-2 text-[11px] font-medium text-accent hover:bg-surface-elevated disabled:opacity-50">{saving ? "Сохраняем…" : "Сохранить"}</button>}
			{!valid && <span className="text-[11px] chat-text-warning">От 1 до 250</span>}
			{message && <span role={message.error ? "alert" : "status"} className={`text-[11px] ${message.error ? "chat-text-danger" : "chat-text-success"}`}>{message.text}</span>}
		</form>
	);
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
	return <div className="chat-stat-card flex min-w-0 flex-col gap-1.5 px-2.5 py-2 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
		<div aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent sm:size-9">{icon}</div>
		<div><div className="text-base font-semibold tabular-nums sm:text-lg">{value}</div><div className="text-[11px] leading-tight text-muted">{label}</div></div>
	</div>;
}

function ConversationRow({
	conversation,
	project,
	active,
	opened,
	checked,
	onCheck,
	checkBusy,
	onClick,
	onTake,
	taking = false,
	takeDisabled = false,
}: {
	conversation: ChatwootConversation;
	project?: ChatwootInbox;
	active: boolean;
	opened: boolean;
	checked?: boolean;
	onCheck?: (checked: boolean) => void;
	checkBusy: boolean;
	onClick: () => void;
	onTake?: () => void;
	taking?: boolean;
	takeDisabled?: boolean;
}) {
	const sender = conversation.meta?.sender;
	const last = conversation.last_non_activity_message;
	const name = sender?.name || sender?.email || `Диалог #${conversation.id}`;
	const loginValue = sender?.custom_attributes?.player_login ?? sender?.custom_attributes?.login ?? conversation.custom_attributes?.player_login ?? conversation.custom_attributes?.login ?? sender?.identifier;
	const login = (typeof loginValue === "string" || typeof loginValue === "number") && String(loginValue).trim() !== name ? String(loginValue).trim() : "";
	const source = conversation.meta?.inbox?.name ?? project?.name ?? (conversation.inbox_id ? `Источник #${conversation.inbox_id}` : "Входящие");
	const tags = tagsForProject(conversation.labels ?? [], projectTagScope(project, source));
	const timestamp = conversation.created_at ?? last?.created_at ?? conversation.updated_at;
	const waitingSince = conversationWaitingSince(conversation);
	return (
		<div data-active={active} data-opened={opened} data-checked={checked} className="chat-list-row">
			{onCheck && <input type="checkbox" checked={checked} disabled={checkBusy} aria-label={`Выбрать диалог #${conversation.id}`}
				className="chat-batch-check" onChange={(event) => onCheck(event.target.checked)} />}
			<button type="button" aria-pressed={active} onClick={onClick} className="chat-list-item">
				<span className="chat-avatar" data-tone={conversation.id % 4} aria-hidden="true">{initials(name)}</span>
				<span className="chat-list-main">
					<span className="chat-list-line">
						<span className="chat-list-project truncate" title={source}>{source}</span>
						{timestamp ? <time className="chat-list-time" title={`Поступил ${new Date(timestamp > 1e12 ? timestamp : timestamp * 1000).toLocaleString("ru-RU")}`}>{dateLabel(timestamp)}</time> : <span className="chat-list-number">#{conversation.id}</span>}
					</span>
					<span className="chat-list-line">
						<span className="chat-list-player truncate" title={name}>{name}</span>
						{waitingSince ? <WaitingTime timestamp={waitingSince} firstReply={firstReplyPending(conversation, waitingSince)} className="chat-list-time chat-text-warning" /> : <span className="chat-list-number">#{conversation.id}</span>}
					</span>
					{login && <span className="chat-list-meta truncate" title={`Логин игрока ${login}`}>Логин · {login}</span>}
					<span className="chat-list-preview truncate">{last?.content?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") || "Новое обращение"}</span>
					{tags.length > 0 && <span className="chat-list-tags">
						{tags.slice(0, 2).map((tag) => <span className="chat-context-tag truncate" title={tag} key={tag}>{tag}</span>)}
						{tags.length > 2 && <span className="shrink-0 text-muted" title={tags.slice(2).join(", ")}>+{tags.length - 2}</span>}
					</span>}
				</span>
			</button>
			{onTake && <button type="button" onClick={onTake} disabled={takeDisabled} title="Взять в работу"
				aria-label={`Взять в работу диалог #${conversation.id}`} className="chat-list-take">
				<ArrowDownToLine size={13} aria-hidden="true" /> {taking ? "Берём…" : "Взять"}
			</button>}
		</div>
	);

}

function ConversationPane({
	id,
	listControl,
	addControl,
	supervising = false,
	docked = false,
	visible = true,
	selected = false,
	tiled = false,
	expanded = false,
	onExpand,
	realtimeConnected,
	coachingRealtimeConnected,
	canTranslate = false,
	nativeAutoTranslate = false,
	agents,
	teams,
	operatorDraft = emptyOperatorDraft,
	onOperatorDraft,
	coachingDraft,
	onCoachingDraft,
	onTitle,
	onOpenRelated,
	inboxes,
	labels,
	binds,
	language,
	onLanguage,
	onClose,
	onTake,
	takeDisabled = false,
	onChanged,
	onChoose,
}: {
	id: number | null;
	listControl?: ReactNode;
	addControl?: ReactNode;
	supervising?: boolean;
	docked?: boolean;
	visible?: boolean;
	selected?: boolean;
	tiled?: boolean;
	expanded?: boolean;
	onExpand?: () => void;
	realtimeConnected: boolean;
	coachingRealtimeConnected: boolean;
	canTranslate?: boolean;
	nativeAutoTranslate?: boolean;
	agents: ChatwootAgent[];
	teams: ChatwootTeam[];
	operatorDraft?: OperatorDraft;
	onOperatorDraft?: UpdateOperatorDraft;
	coachingDraft?: CoachingDraft;
	onCoachingDraft?: (id: number, value: CoachingDraft) => void;
	onTitle?: (id: number, title: string) => void;
	onOpenRelated: (id: number) => void;
	inboxes: ChatwootInbox[];
	labels: string[];
	binds: Bind[];
	language: LanguageCode;
	onLanguage: (language: LanguageCode) => void;
	onClose: () => void;
	onTake?: (id: number) => void;
	takeDisabled?: boolean;
	onChanged: () => void;
	onChoose: () => void;
}) {
	const client = useQueryClient();
	const [coachingText, setCoachingText] = useState(coachingDraft?.text ?? "");
	const [attachmentError, setAttachmentError] = useState("");
	const fileInput = useRef<HTMLInputElement>(null);
	const [draftCoachTo, setDraftCoachTo] = useState<CoachingRecipient | null>(coachingDraft?.coachTo ?? null);
	useEffect(() => {
		if (id != null) onCoachingDraft?.(id, { text: coachingText, coachTo: draftCoachTo ?? undefined });
	}, [id, coachingText, draftCoachTo, onCoachingDraft]);
	const [bindSearch, setBindSearch] = useState("");
	const [showBinds, setShowBinds] = useState(false);
	const [slash, setSlash] = useState<{ start: number; end: number; search: string } | null>(null);
	const [bindIndex, setBindIndex] = useState(0);
	const bindOptionsId = useId();
	const bindPickerOpen = showBinds || slash !== null;
	const closeBinds = () => { setShowBinds(false); setSlash(null); };
	const bindMenu = useChatPopover<HTMLDivElement>(visible && bindPickerOpen, closeBinds);
	const [contextTab, setContextTab] = useState<"player" | "actions" | null>("player");
	const [tagPickerRequest, setTagPickerRequest] = useState(0);
	const [contextOverlay, setContextOverlay] = useState(true);
	const showCustomer = contextTab === "player";
	const [editorExpanded, setEditorExpanded] = useState(true);
	const editor = useRef<HTMLTextAreaElement>(null);
	const thread = useRef<HTMLElement>(null);
	const customerClose = useRef<HTMLButtonElement>(null);
	const playerToggle = useRef<HTMLButtonElement>(null);
	const actionsToggle = useRef<HTMLButtonElement>(null);
	const [contextOpener, setContextOpener] = useState<"player" | "actions" | null>(null);
	const [customerWidth, setCustomerWidth] = useState(234);
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
	useLayoutEffect(() => {
		if (contextTab && contextOpener) {
			customerClose.current?.focus({ preventScroll: true });
			return;
		}
		if (contextOpener) (contextOpener === "player" ? playerToggle : actionsToggle).current?.focus({ preventScroll: true });
	}, [contextTab, contextOpener]);
	const closeCustomer = () => {
		setContextOpener(contextOpener ?? contextTab);
		setContextTab(null);
	};
	const toggleContext = (tab: "player" | "actions") => {
		setContextOpener(tab);
		closeBinds();
		setTagPickerRequest(0);
		setContextTab(contextVisible && contextTab === tab ? null : tab);
	};
	const query = useQuery({
		queryKey: ["chatwoot", "conversation", id],
		queryFn: () => chatwootService.conversation(id as number),
		enabled: visible && id != null,
		refetchInterval: realtimeConnected ? 12000 : 5000,
	});
	const conversation = query.data as ChatwootConversation | undefined;
	const conversationTitle = conversation?.access?.read ? conversation.meta?.sender?.name || conversation.meta?.sender?.email : undefined;
	useEffect(() => {
		if (id != null && conversationTitle) onTitle?.(id, conversationTitle);
	}, [id, conversationTitle, onTitle]);
	const canWrite = !supervising && conversation?.access?.write === true;
	const canNote = !supervising && conversation?.access?.note === true;
	useLayoutEffect(() => {
		if (visible && selected && editorExpanded && (canWrite || canNote) && !thread.current?.contains(document.activeElement)) {
			editor.current?.focus({ preventScroll: true });
		}
	}, [visible, selected, editorExpanded, canWrite, canNote]);
	const canTake = !supervising && conversation?.access?.take === true;
	const mode: ComposerMode = canNote && (!canWrite || operatorDraft.mode === "note") ? "note" : "reply";
	const sendAsNote = mode === "note";
	const autoTranslateDisabled = conversation?.additional_attributes?.auto_translate_disabled === true;
	const replyLanguage = operatorDraft.replyLanguage ?? (autoTranslateDisabled ? "off" : "auto");
	const canUseNativeTranslation = nativeAutoTranslate && !autoTranslateDisabled;
	const draft = operatorDraft[mode];
	const { text, files: selectedFiles } = draft;
	const updateDraft = (patch: Partial<MessageDraft>) => {
		if (id != null) onOperatorDraft?.(id, (current) => ({ ...current, [mode]: { ...current[mode], ...patch } }));
	};
	const changeComposer = (next: ComposerMode) => {
		if (id != null) onOperatorDraft?.(id, (current) => current.mode === next ? current : { ...current, mode: next });
		closeBinds();
		setAttachmentError("");
		setEditorExpanded(true);
	};
	const latestMessagesQuery = useQuery({
		queryKey: ["chatwoot", "messages", id, "latest"],
		queryFn: () => chatwootService.conversationMessages(id as number),
		enabled: visible && id != null,
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
		enabled: visible && id != null && conversation?.access?.read === true,
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
	const changedRecipient = coachingText.trim() && draftCoachTo && coachRecipient && draftCoachTo.id !== coachRecipient.id ? draftCoachTo : null;
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
			setCoachingText("");
			if (id != null) onCoachingDraft?.(id, { text: "" });
			void client.invalidateQueries({ queryKey: coachingKey });
		},
		onError: () => {
			void client.invalidateQueries({ queryKey: ["chatwoot", "conversation", id] });
		},
	});
	const submitCoach = () => {
		const content = coachingText.trim();
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
		setCoachingText(value);
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
		if (!visible || !viewport || (latestMessageId == null && !latestCoachingId)) return;
		if (previousScrollHeight.current !== null) {
			viewport.scrollTop += viewport.scrollHeight - previousScrollHeight.current;
			previousScrollHeight.current = null;
			return;
		}
		if (!followMessages.current) return;
		viewport.scrollTop = viewport.scrollHeight;
	}, [latestMessageId, latestCoachingId, messages.length, privateOnly, visible]);
	const conversationVisible = conversation?.access?.read === true && !query.isError;
	useEffect(() => {
		if (!conversationVisible || !thread.current) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setContextOverlay(entry.contentRect.width < 640);
		});
		observer.observe(thread.current);
		return () => observer.disconnect();
	}, [conversationVisible]);
	useEffect(() => {
		if (!visible || !conversationVisible || !messageViewport.current) return;
		const viewport = messageViewport.current;
		const observer = new ResizeObserver(() => {
			if (followMessages.current && previousScrollHeight.current === null) viewport.scrollTop = viewport.scrollHeight;
		});
		observer.observe(viewport);
		return () => observer.disconnect();
	}, [conversationVisible, visible]);
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
		enabled: visible && showCustomer && conversation?.access?.read === true && contactId != null,
		staleTime: 60000,
	});
	const history = useQuery({
		queryKey: ["chatwoot", "contact-history", contactId, id],
		queryFn: () => chatwootService.contactHistory(contactId as number, id as number),
		enabled: visible && showCustomer && conversation?.access?.read === true && contactId != null,
		staleTime: 60000,
	});
	const send = useMutation({
		mutationFn: async (message: { id: number; mode: ComposerMode; draft: MessageDraft; replyLanguage: string; nativeTranslation: boolean }) => {
			const isNote = message.mode === "note";
			if (supervising || (isNote ? !canNote : !canWrite))
				throw new Error("Отправка в этом режиме недоступна");
			const original = message.draft.text.trim();
			const [content, attachments] = await Promise.all([
				message.replyLanguage !== "off" && !message.nativeTranslation && original && conversation
					? translateChatReply(original, message.replyLanguage, conversation, messages) : original,
				Promise.all(message.draft.files.map(async (file) => ({
					name: file.name, type: file.type || "application/octet-stream", contentBase64: await chatwootFileBase64(file),
				}))),
			]);
			if (currentConversationId.current === message.id) {
				setOptimisticMessage({ id: -Date.now(), content, private: isNote, message_type: "outgoing", created_at: Math.floor(Date.now() / 1000),
					content_attributes: message.nativeTranslation ? { translation_pending: true } : undefined,
					attachments: message.draft.files.map((file) => ({ file_name: file.name, file_type: file.type })) });
			}
			return chatwootService.sendMessage(message.id, content, isNote, attachments, message.nativeTranslation || undefined);
		},
		onSuccess: (_result, message) => {
			onOperatorDraft?.(message.id, (current) => current[message.mode] === message.draft ? { ...current, [message.mode]: emptyMessageDraft } : current);
			if (currentConversationId.current === message.id) {
				setOptimisticMessage(null);
				setAttachmentError("");
			}
			void client.invalidateQueries({ queryKey: ["chatwoot", "messages", message.id, "latest"] });
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversation", message.id],
			});
			void client.invalidateQueries({
				queryKey: ["chatwoot", "conversations"],
			});
		},
		onError: (_error, message) => {
			if (currentConversationId.current === message.id) setOptimisticMessage(null);
			if (message.nativeTranslation) void client.invalidateQueries({ queryKey: ["chatwoot", "health"] });
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
		updateDraft({ files: next });
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
	const bindQuery = (slash?.search ?? bindSearch).trim();
	const filteredBinds = bindPickerOpen ? searchBinds(allBinds.filter((bind) => getBindTranslation(bind, language)?.content), bindQuery, { language }).slice(0, 8) : [];
	const selectedBindIndex = Math.min(bindIndex, Math.max(0, filteredBinds.length - 1));
	const selectedBind = filteredBinds[selectedBindIndex];
	const currentContact = contact.data ?? sender;
	const source = inboxes.find((inbox) => inbox.id === conversation?.inbox_id);
	const project = conversation?.meta?.inbox?.name ?? source?.name;
	const visitor = conversation?.visitor;
	const rawLogin = currentContact?.custom_attributes?.player_login ?? currentContact?.custom_attributes?.login ?? visitor?.login ?? currentContact?.identifier;
	const playerLogin = typeof rawLogin === "string" || typeof rawLogin === "number" ? String(rawLogin) : undefined;
	const totalDeposit = totalDepositFrom(currentContact?.custom_attributes, sender?.custom_attributes, conversation?.custom_attributes, currentContact?.additional_attributes, conversation?.additional_attributes);
	const crmUrl = crmWorkspaceUrl(conversation?.crm);
	const insertBind = (bind: Bind) => {
		const translation = getBindTranslation(bind, language);
		if (!translation) return;
		const before = slash ? text.slice(0, slash.start) : text && !text.endsWith("\n") ? `${text}\n` : text;
		const after = slash ? text.slice(slash.end) : "";
		const caret = before.length + translation.content.length;
		updateDraft({ text: before + translation.content + after });
		closeBinds();
		setBindSearch("");
		requestAnimationFrame(() => {
			editor.current?.focus();
			editor.current?.setSelectionRange(caret, caret);
		});
	};
	const changeMessageText = (value: string, caret: number) => {
		updateDraft({ text: value });
		const match = canWrite && mode === "reply" && !showBinds ? /(?:^|\n)\/([^\n/]{0,48})$/.exec(value.slice(0, caret)) : null;
		setSlash(match ? { start: caret - match[1].length - 1, end: caret, search: match[1] } : null);
		setBindIndex(0);
	};
	const submitMessage = () => {
		if (id == null || slash || (!text.trim() && !selectedFiles.length) || send.isPending) return;
		const nativeTranslation = mode === "reply" && replyLanguage === "auto" && canUseNativeTranslation && /\p{L}/u.test(text);
		const outgoingLanguage = mode === "reply" && (nativeTranslation || canTranslate) ? replyLanguage : "off";
		send.mutate({ id, mode, draft, replyLanguage: outgoingLanguage, nativeTranslation });
	};
	const handleMessageKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.nativeEvent.isComposing || event.keyCode === 229) return;
		if (slash && event.key === "Escape") {
			event.preventDefault();
			closeBinds();
			return;
		}
		if (slash && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
			event.preventDefault();
			const count = filteredBinds.length;
			if (count) {
				const next = (selectedBindIndex + count + (event.key === "ArrowDown" ? 1 : -1)) % count;
				setBindIndex(next);
				document.getElementById(`${bindOptionsId}-${next}`)?.scrollIntoView({ block: "nearest" });
			}
			return;
		}
		if (event.key !== "Enter" || event.shiftKey) return;
		if (slash) {
			event.preventDefault();
			if (selectedBind) insertBind(selectedBind);
		} else if (text.trim() || selectedFiles.length) {
			event.preventDefault();
			submitMessage();
		}
	};
	if (!id)
		return (
			<div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center p-8 text-center">
				{listControl && <div className="absolute top-2 left-2">{listControl}</div>}
				<div className="chat-empty-icon">
					<MessageSquareText size={23} />
				</div>
				<h2 className="mt-4 text-sm font-semibold">Выберите диалог</h2>
				<button
					type="button"
					onClick={onChoose}
					className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-surface-elevated"
				>
					<Plus size={14} /> Показать список диалогов
				</button>
			</div>
		);
	if (!conversation?.access?.read || query.isError) return (
		<div className="relative grid flex-1 place-items-center p-6 text-center text-sm text-muted">
			{listControl && <div className="absolute top-2 left-2">{listControl}</div>}
			{addControl && <div className="absolute top-2 right-12">{addControl}</div>}
			{!docked && <button type="button" className="chat-window-control absolute top-2 right-2" aria-label="Закрыть диалог" onClick={onClose}><X size={15} /></button>}
			<div><p role={query.isError ? "alert" : "status"}>{query.error?.message ?? (query.isLoading ? "Загружаем диалог…" : "Диалог недоступен")}</p>
				{query.isError && <button type="button" onClick={() => void query.refetch()} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs">Повторить</button>}
			</div>
		</div>
	);
	const tagScope = projectTagScope(source, project);
	const tags = tagsForProject(conversation.labels ?? [], tagScope);
	const playerDepositTags = depositTags(tagsForProject([...new Set([...tags, ...(contact.data?.label_list ?? [])])], tagScope));
	const inactive = ["resolved", "snoozed"].includes(conversation.status);
	const statusText = conversationStatusLabels[conversation.status];
	const lastPublicMessage = messages.findLast((message) => !message.private && ["0", "1", "incoming", "outgoing"].includes(String(message.message_type)));
	const waitingSince = conversationWaitingSince(conversation, lastPublicMessage);
	const contextVisible = Boolean(contextTab && (showCustomer || canWrite) && (contextOpener || !contextOverlay && !tiled));
	const editError = status.error || assign.error || assignTeam.error || priority.error || take.error || tagMutation.error || block.error;
	return (
		<section
			ref={thread}
			className="chat-thread relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
			data-tiled={tiled}
		>
			<div inert={contextVisible && contextOverlay} className="chat-thread-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
				<header className={`chat-thread-header flex min-h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5 ${docked ? "chat-docked-thread-header" : ""}`}>
					<div className="flex min-w-0 items-center gap-2.5">
						{listControl}
						<div className="chat-avatar chat-avatar-small" data-tone={id % 4}>
							{initials(sender?.name)}
						</div>
						<div className="min-w-0">
							<h2 className="truncate text-sm font-semibold" title={sender?.name}>
								{sender?.name || sender?.email || `Диалог #${id}`}
							</h2>
							<p className="flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-muted">
								<span className="min-w-0 truncate">
									{project ? `${project} · #${id}` : `#${id}`}
									{statusText && <span className="chat-thread-status" data-status={conversation.status}>{statusText}</span>}
								</span>
								{waitingSince ? <WaitingTime timestamp={waitingSince} firstReply={firstReplyPending(conversation, waitingSince)} className="shrink-0 whitespace-nowrap chat-text-warning" /> : null}
							</p>
							{supervising && <p className="truncate text-[11px] text-muted" title={conversation.meta?.assignee?.name}>
								{conversation.meta?.assignee?.name ? `Агент · ${conversation.meta.assignee.name}` : coachRecipient ? "Назначенный агент" : "Агент не назначен"}
							</p>}
						</div>
					</div>
					<div className="chat-thread-actions flex shrink-0 flex-wrap items-center gap-1.5">
						{addControl}
						<button
							ref={playerToggle}
							type="button"
							onClick={() => toggleContext("player")}
							title="Карточка игрока"
							aria-label="Карточка игрока"
							aria-expanded={showCustomer && contextVisible}
							className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated"
						>
							<UserRound size={14} />
						</button>
						{canWrite && <button ref={actionsToggle} type="button" aria-label="Действия с диалогом" title="Действия с диалогом" aria-expanded={contextTab === "actions" && contextVisible}
							onClick={() => toggleContext("actions")} className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated">
							<Settings2 size={15} />
						</button>}
						{canWrite && <button
							type="button"
							title={inactive ? "Открыть снова" : "Завершить диалог"}
							aria-label={inactive ? "Открыть снова" : "Завершить диалог"}
							disabled={status.isPending}
							onClick={() => status.mutate({ status: inactive ? "open" : "resolved" })}
							className="chat-thread-primary inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-2.5 text-xs font-medium hover:border-accent disabled:opacity-60"
						>
							<CheckCheck size={14} aria-hidden="true" />
							<span>{inactive ? "Открыть снова" : "Завершить"}</span>
						</button>}
						{onExpand && <button type="button" className="chat-window-control"
							aria-label={expanded ? "Вернуть сетку чатов" : "Развернуть чат"} title={expanded ? "Вернуть сетку чатов" : "Развернуть чат"} onClick={onExpand}>
							{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
						</button>}
						{!docked && <button
							type="button"
							title="Закрыть окно чата"
							aria-label="Закрыть диалог"
							onClick={onClose}
							className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated"
						>
							<X size={15} />
						</button>}
					</div>
				</header>
				{(conversation.priority || tags.length > 0 || canWrite) && <section className="chat-thread-meta flex min-h-8 shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5" aria-label="Метки диалога">
					{conversation.priority && <span className="rounded-md border border-border px-2 py-1 text-[11px] text-muted">Приоритет · {conversationPriorityLabels[conversation.priority]}</span>}
					{tags.map((tag) => <span key={tag} className="chat-context-tag break-all">{tag}</span>)}
					{canWrite && <button type="button" onClick={() => {
						setContextOpener("actions");
						closeBinds();
						setTagPickerRequest((request) => request + 1);
						setContextTab("actions");
					}} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-elevated"><Tag size={12} /> Теги диалога</button>}
				</section>}
				{editError && contextTab !== "actions" && (
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
							{visibleTimeline.map((entry, index) => {
								const day = entry.time > 0 ? chatDay.format(entry.time) : "";
								const previous = visibleTimeline[index - 1];
								const previousDay = previous?.time > 0 ? chatDay.format(previous.time) : "";
								return <Fragment key={entry.key}>
									{day && day !== previousDay && <div className="chat-day-divider"><span>{day}</span></div>}
									{"note" in entry ? <CoachingBubble note={entry.note} /> : <MessageBubble message={entry.message} />}
								</Fragment>;
							})}
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
					<CoachingComposer recipient={coachRecipient} previousRecipient={changedRecipient} text={coachingText}
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
				) : (canWrite || canNote) ? <footer data-note={sendAsNote} data-collapsed={!editorExpanded} className="chat-thread-composer relative shrink-0 border-t border-border px-2.5 py-2">
					<div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5">
							<fieldset className="chat-operator-composer flex w-fit max-w-full min-w-0 flex-wrap items-center gap-0.5 rounded-lg border border-border p-0.5">
								<legend className="sr-only">Кому отправить сообщение</legend>
								{canWrite && <button type="button" disabled={send.isPending} aria-pressed={!sendAsNote} onClick={() => changeComposer("reply")}
									className="rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground">Ответ игроку</button>}
								{canNote && <button type="button" disabled={send.isPending} aria-label="Заметка команде" aria-pressed={sendAsNote} data-private={sendAsNote} onClick={() => changeComposer("note")}
									className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground">
									<LockKeyhole size={11} /> <span>Заметка<span className="chat-note-caption"> команде</span></span>
								</button>}
							</fieldset>
						<button type="button" aria-label={editorExpanded ? "Свернуть редактор" : "Развернуть редактор"} aria-expanded={editorExpanded} title={editorExpanded ? "Свернуть редактор" : "Развернуть редактор"} onClick={() => { closeBinds(); setEditorExpanded(!editorExpanded); }} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-elevated">
							<ChevronDown size={16} className={editorExpanded ? "" : "rotate-180"} />
						</button>
					</div>
					{editorExpanded && <>
					<input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} />
					{selectedFiles.length > 0 && (
						<div className="mb-2 flex flex-wrap gap-2">
							{selectedFiles.map((file, index) => (
								<div key={`${file.name}-${file.lastModified}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs">
									<FileText size={13} className="shrink-0 text-accent" />
									<span className="max-w-56 truncate">{file.name}</span>
									<span className="shrink-0 text-muted">{(file.size / 1024).toFixed(0)} КБ</span>
									<button type="button" aria-label={`Удалить файл ${file.name}`} onClick={() => { updateDraft({ files: selectedFiles.filter((_, fileIndex) => fileIndex !== index) }); setAttachmentError(""); }} className="text-muted hover:text-foreground"><X size={13} /></button>
								</div>
							))}
						</div>
					)}
					<textarea
						ref={editor}
						aria-label={sendAsNote ? "Заметка команде" : "Ответ игроку"}
						aria-controls={slash ? bindOptionsId : undefined}
						aria-activedescendant={slash && selectedBind ? `${bindOptionsId}-${selectedBindIndex}` : undefined}
						value={text}
						onChange={(event) => changeMessageText(event.target.value, event.target.selectionStart)}
						onKeyDown={handleMessageKey}
						onPointerDown={() => { if (slash) setSlash(null); }}
						placeholder={
							sendAsNote
								? "Заметка видна только команде…"
								: "Напишите ответ игроку или введите /"
						}
						rows={1}
						className="supportos-scroll block max-h-36 min-h-10 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/60"
					/>
					<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
						<div className="flex flex-wrap items-center gap-1.5">
							<button type="button" title="Прикрепить файл" aria-label="Прикрепить файл" onClick={() => fileInput.current?.click()} disabled={send.isPending || selectedFiles.length >= 5} className="grid size-8 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"><Paperclip size={14} /></button>
							{!sendAsNote && (canTranslate || canUseNativeTranslation) && <label className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-muted">
								<Languages size={14} className="shrink-0" aria-hidden="true" />
								<select aria-label="Язык ответа" value={replyLanguage} disabled={send.isPending}
									onChange={(event) => {
										const selected = event.target.value;
										if (id != null) onOperatorDraft?.(id, (current) => ({ ...current, replyLanguage: selected }));
										if (send.isError) send.reset();
									}}
									className="min-w-0 max-w-40 bg-surface text-foreground">
									<option value="auto">Авто · язык игрока</option>
									<option value="off">Без перевода</option>
									{canTranslate && <optgroup label="Выбрать язык">
											{replyLanguages.map((code) => <option key={code} value={code}>{replyLanguageName(code)}</option>)}
									</optgroup>}
								</select>
							</label>}
							{canWrite && <div ref={bindMenu}>
								<button
									type="button"
									onClick={() => { setSlash(null); setBindSearch(""); setShowBinds(!showBinds); }}
									aria-label="Быстрый бинд"
									title="Быстрый бинд"
									aria-expanded={bindPickerOpen}
									className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted hover:text-foreground"
								>
									<MessageSquareText size={12} /> <span className="chat-binds-caption">Быстрый бинд</span>
								</button>
								{bindPickerOpen && (
									<div className="chat-popover absolute bottom-full left-2.5 z-30 mb-1 w-[360px] rounded-xl border border-border bg-surface p-2 shadow-xl">
										{showBinds ? <input
											value={bindSearch}
											onChange={(event) => setBindSearch(event.target.value)}
											placeholder="Найти бинд…"
											className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-accent"
										/> : <p className="px-2 py-1 text-xs font-medium">Быстрые бинды</p>}
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
										<div id={bindOptionsId} role={slash ? "listbox" : undefined} aria-label={slash ? "Быстрые бинды" : undefined} className="max-h-52 overflow-y-auto">
											{filteredBinds.length ? (
												filteredBinds.map((bind, index) => (
													<button
														key={bind.id}
														id={`${bindOptionsId}-${index}`}
														type="button"
														role={slash ? "option" : undefined}
														aria-selected={slash ? selectedBindIndex === index : undefined}
														onClick={() => insertBind(bind)}
														className="block w-full rounded-lg px-2.5 py-2 text-left aria-selected:bg-surface-elevated hover:bg-surface-elevated"
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
						<div className="ml-auto flex items-center gap-2">
							<span className="chat-send-hint hidden text-[10px] text-muted sm:block">
								Enter · Shift+Enter — перенос
							</span>
							<button
								type="button"
								aria-label={sendAsNote ? "Отправить заметку команде" : "Отправить игроку"}
								title={sendAsNote ? "Отправить заметку команде" : "Отправить игроку"}
								disabled={Boolean(slash) || (!text.trim() && !selectedFiles.length) || send.isPending}
								onClick={submitMessage}
								className="inline-flex h-8 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50"
							>
								<Send size={13} />
								<span className="chat-send-caption">{send.isPending ? (send.variables.replyLanguage !== "off" && send.variables.draft.text.trim() ? "Переводим и отправляем…" : "Отправляем…") : sendAsNote ? "Отправить команде" : "Отправить игроку"}</span>
							</button>
						</div>
					</div>
					</>}
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
					{canTake && <button type="button" disabled={takeDisabled || take.isPending} onClick={() => { if (onTake) onTake(id); else take.mutate(); }} className="rounded-md bg-accent px-3 py-2 font-medium text-white disabled:opacity-50">Взять в работу</button>}
				</footer>}
			</div>
			{visible && contextVisible && (
				<>
				<div className="chat-pane-divider chat-thread-customer-resize"><ResizeHandle label="Изменить ширину карточки клиента" value={customerWidth} min={200} max={420} fromEnd onResize={setCustomerWidth} /></div>
				<aside aria-label={showCustomer ? "Карточка игрока" : "Действия с диалогом"} onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) closeCustomer(); }} style={{ "--chat-context-width": `${customerWidth}px` } as CSSProperties} className="chat-thread-customer supportos-scroll absolute inset-y-0 right-0 z-30 max-w-full shrink-0 overflow-y-auto border-l border-border bg-surface p-3 shadow-xl">
					<div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 space-y-1.5 border-b border-border bg-surface px-3 py-2">
					<div className="flex items-center justify-between gap-2">
						<h3 className="text-sm font-semibold">{showCustomer ? "Карточка игрока" : "Действия с диалогом"}</h3>
						<button
							ref={customerClose}
							type="button"
							aria-label={showCustomer ? "Закрыть карточку игрока" : "Закрыть действия с диалогом"}
							onClick={closeCustomer}
							className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<X size={13} />
						</button>
					</div>
					{canWrite && <fieldset className="chat-menu-tabs grid min-w-0 grid-cols-2">
						<legend className="sr-only">Контекст диалога</legend>
						<button type="button" aria-pressed={showCustomer} onClick={() => setContextTab("player")}>Игрок</button>
						<button type="button" aria-pressed={!showCustomer} onClick={() => setContextTab("actions")}>Диалог</button>
					</fieldset>}
					</div>
					{!showCustomer && canWrite ? <>
						{editError && <p role="alert" className="mb-3 rounded-lg bg-red-500/5 px-2 py-1.5 text-xs chat-text-danger">{editError.message}</p>}
						<ConversationActions key={tagPickerRequest} openTagPicker={tagPickerRequest > 0} conversation={conversation} agents={agents} teams={teams} labels={tagsForProject(labels, tagScope)} visibleTags={tags}
							pending={{ agent: assign.isPending, team: assignTeam.isPending, priority: priority.isPending, status: status.isPending, tags: tagMutation.isPending }}
							onAgent={assign.mutate} onTeam={assignTeam.mutate} onPriority={priority.mutate} onStatus={status.mutate} onTags={tagMutation.mutate} />
					</> : <>
					<div className="mb-3 flex flex-col items-center rounded-xl border border-border bg-surface p-3 text-center">
						<div className="grid size-12 place-items-center rounded-full border border-border bg-surface-elevated text-sm font-semibold">
							{initials(currentContact?.name ?? undefined)}
						</div>
						<div className="mt-2 w-full truncate text-sm font-semibold">
							{currentContact?.name || "Без имени"}
						</div>
						<div className="w-full truncate text-[11px] text-muted">
							{currentContact?.email || "Email не указан"}
						</div>
					</div>
					<div className="space-y-3 text-xs">
						{canWrite && id != null && contact.data && <ChatContactEditor key={contact.data.id} contact={contact.data} conversationId={id} />}
						<Info label="Логин игрока" value={playerLogin} />
						<Info label="Общая сумма депозитов" value={totalDeposit} />
						<Info label="Теги депозитов" value={playerDepositTags.join(" · ")} />
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
					</>}
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
	const translation = message.content_attributes;
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
				data-side={message.private ? "note" : outgoing ? "outgoing" : "incoming"}
				className={`max-w-[min(88%,42rem)] min-w-0 rounded-2xl px-3 py-2.5 shadow-sm sm:px-4 ${message.private ? "border border-amber-500/20 bg-amber-500/5" : outgoing ? "border border-accent/15 bg-accent/15" : "border border-border/80 bg-surface"}`}
			>
				{message.private && (
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide chat-text-warning">
						Внутренняя заметка
					</div>
				)}
				{(!outgoing || message.sender?.name || message.sender?.available_name) && (
					<div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-muted">
						{outgoing && <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-surface"><ChatAvatar src={message.sender?.avatar_url || message.sender?.thumbnail} name={message.sender?.name} /></span>}
						{message.sender?.available_name || message.sender?.name || "Игрок"}
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
				{outgoing && !message.private && translation?.translation_pending && (
					<p className="mt-1 text-xs text-muted">Переводим на язык игрока…</p>
				)}
				{outgoing && !message.private && translation?.translation_failed && (
					<p className="mt-1 text-xs chat-text-warning">Перевод не удался. Игроку отправлен исходный текст.</p>
				)}
				<div className="mt-1 text-right text-[10px] text-muted">
					<ReplyTime timestamp={message.created_at} />
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
