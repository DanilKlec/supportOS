import { ChevronDown, Pin, Tag, UserRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type {
	ChatwootAgent,
	ChatwootConversation,
	ChatwootPriority,
	ChatwootStatus,
	ChatwootTeam,
} from "@/services/chatwoot.service";
import { useChatPopover } from "./useChatPopover";
import { normalizeSearchValue, scoreTextSearch } from "@/shared/lib/bind-search";
import { useAuthStore } from "@/store/auth.store";

export const conversationStatusLabels: Record<string, string> = {
	open: "В работе",
	pending: "Ожидает",
	snoozed: "Отложен",
	resolved: "Завершён",
};

export const conversationPriorityLabels: Record<ChatwootPriority, string> = {
	low: "Низкий",
	medium: "Средний",
	high: "Высокий",
	urgent: "Срочный",
};

type Props = {
	conversation: ChatwootConversation;
	agents: ChatwootAgent[];
	teams: ChatwootTeam[];
	labels: string[];
	openTagPicker?: boolean;
	pending: {
		agent: boolean;
		team: boolean;
		priority: boolean;
		status: boolean;
		tags: boolean;
	};
	onAgent: (id: number | null) => void;
	onTeam: (id: number | null) => void;
	onPriority: (priority: ChatwootPriority | null) => void;
	onStatus: (value: { status: ChatwootStatus; snoozedUntil?: number }) => void;
	onTags: (tags: string[]) => void;
};

const field =
	"h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs disabled:opacity-60";

export function ConversationActions({
	conversation,
	agents,
	teams,
	labels,
	openTagPicker = false,
	pending,
	onAgent,
	onTeam,
	onPriority,
	onStatus,
	onTags,
}: Props) {
	const assignee = conversation.meta?.assignee;
	const tags = conversation.labels ?? [];
	const availableTags = labels.filter((label) => !tags.includes(label));
	const userId = useAuthStore((state) => state.session?.user.id);
	const pinKey = `supportos:chatwoot:pinned-tags:${userId}`;
	const [pinnedTags, setPinnedTags] = useState<string[]>(() => readPinnedTags(pinKey));
	function togglePin(tag: string) {
		const saved = readPinnedTags(pinKey);
		const next = saved.includes(tag) ? saved.filter((item) => item !== tag) : [...saved, tag];
		setPinnedTags(next);
		try { localStorage.setItem(pinKey, JSON.stringify(next)); } catch { /* preference works for this pane */ }
	}
	const [picker, setPicker] = useState<"agent" | "tag" | null>(openTagPicker ? "tag" : null);
	const [search, setSearch] = useState("");
	const searchInput = useRef<HTMLInputElement>(null);
	const agentButton = useRef<HTMLButtonElement>(null);
	const tagButton = useRef<HTMLButtonElement>(null);
	const membersId = useId();
	const tagsId = useId();
	const agentsPicker = useChatPopover<HTMLDivElement>(picker === "agent", () =>
		setPicker(null),
	);
	const tagsPicker = useChatPopover<HTMLDivElement>(picker === "tag", () =>
		setPicker(null),
	);
	const query = search.trim().toLowerCase();
	const matchingAgents = agents.filter((agent) =>
		`${agent.name} ${agent.email ?? ""}`.toLowerCase().includes(query),
	);
	const matchingTags = availableTags.map((tag) => ({ tag, score: scoreTextSearch(query, [tag]), pinned: pinnedTags.includes(tag) }))
		.filter(({ score }) => !normalizeSearchValue(query) || score > 0)
		.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score);
	const togglePicker = (next: "agent" | "tag") => {
		if (next === "tag") setPinnedTags(readPinnedTags(pinKey));
		setSearch("");
		setPicker(picker === next ? null : next);
	};
	useEffect(() => {
		if (picker) searchInput.current?.focus();
	}, [picker]);
	const chooseAgent = (id: number | null) => {
		onAgent(id);
		setPicker(null);
		agentButton.current?.focus();
	};
	const chooseTag = (tag: string) => {
		onTags([...tags, tag]);
		setPicker(null);
		tagButton.current?.focus();
	};
	return (
		<fieldset
			className="min-w-0 space-y-4"
			onKeyDown={(event) => {
				if (event.key !== "Escape" || !picker) return;
				event.preventDefault();
				setPicker(null);
				(picker === "agent" ? agentButton : tagButton).current?.focus();
			}}
		>
			<legend className="sr-only">Управление диалогом</legend>
			<section className="space-y-2.5">
				<h4 className="text-xs font-semibold">Назначение</h4>
				<div ref={agentsPicker} className="space-y-1.5">
					<button
						ref={agentButton}
						type="button"
						aria-label="Назначить агента"
						aria-expanded={picker === "agent"}
						aria-controls={picker === "agent" ? membersId : undefined}
						aria-disabled={pending.agent}
						onClick={() => {
							if (!pending.agent) togglePicker("agent");
						}}
						className={`${field} flex items-center gap-2 text-left hover:bg-surface-elevated`}
					>
						<UserRound size={14} className="shrink-0 text-muted" />
						<span className="min-w-0 flex-1 truncate">
							{assignee?.name || assignee?.email || "Без ответственного"}
						</span>
						<ChevronDown size={13} className="shrink-0 text-muted" />
					</button>
					{picker === "agent" && (
						<div id={membersId} className="chat-context-picker">
							<input
								ref={searchInput}
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								aria-label="Найти агента для назначения"
								placeholder="Имя или почта агента"
								className={field}
							/>
							<div className="supportos-scroll max-h-40 overflow-y-auto py-1">
								{assignee?.id != null && (
									<button
										type="button"
										className="chat-context-option text-muted"
										onClick={() => chooseAgent(null)}
									>
										Снять назначение
									</button>
								)}
								{matchingAgents.length === 0 && (
									<p className="px-2 py-2 text-xs text-muted">
										Агенты не найдены
									</p>
								)}
								{matchingAgents.map((agent) => (
									<button
										key={agent.id}
										type="button"
										disabled={agent.id === assignee?.id}
										onClick={() => chooseAgent(agent.id)}
										className="chat-context-option"
									>
										<span className="min-w-0 flex-1 truncate">
											{agent.name}
										</span>
										{agent.id === assignee?.id && (
											<span className="text-[10px] text-accent">Назначен</span>
										)}
									</button>
								))}
							</div>
						</div>
					)}
				</div>
				{teams.length > 0 && (
					<label className="block space-y-1 text-[11px] font-medium text-muted">
						<span>Команда диалога</span>
						<select
							value={conversation.meta?.team?.id ?? ""}
							disabled={pending.team}
							onChange={(event) => onTeam(Number(event.target.value) || null)}
							className={field}
						>
							<option value="">Без команды</option>
							{teams.map((team) => (
								<option key={team.id} value={team.id}>
									{team.name}
								</option>
							))}
						</select>
					</label>
				)}
			</section>
			<section className="space-y-2.5 border-t border-border pt-3">
				<h4 className="text-xs font-semibold">Статус и приоритет</h4>
				<label className="block space-y-1 text-[11px] font-medium text-muted">
					<span>Изменить статус</span>
					<select
						value={conversation.status}
						disabled={pending.status}
						onChange={(event) => {
							const value = event.target.value;
							if (
								value === "pending" ||
								value === "open" ||
								value === "resolved"
							)
								onStatus({ status: value });
							else if (value.startsWith("snooze:")) {
								const minutes = Number(value.split(":")[1]);
								onStatus({
									status: "snoozed",
									snoozedUntil: minutes
										? Math.floor(Date.now() / 1000) + minutes * 60
										: undefined,
								});
							}
						}}
						className={field}
					>
						<option value="open">В работе</option>
						<option value="pending">Ожидает</option>
						<option value="resolved">Завершён</option>
						{conversation.status === "snoozed" && (
							<option value="snoozed" disabled>
								Отложен
							</option>
						)}
						<optgroup label="Отложить">
							<option value="snooze:30">На 30 минут</option>
							<option value="snooze:120">На 2 часа</option>
							<option value="snooze:1440">На сутки</option>
							<option value="snooze:0">До ответа игрока</option>
						</optgroup>
					</select>
				</label>
				<label className="block space-y-1 text-[11px] font-medium text-muted">
					<span>Приоритет</span>
					<select
						value={conversation.priority ?? ""}
						disabled={pending.priority}
						onChange={(event) =>
							onPriority(
								(event.target.value || null) as ChatwootPriority | null,
							)
						}
						className={field}
					>
						<option value="">Без приоритета</option>
						{Object.entries(conversationPriorityLabels).map(
							([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							),
						)}
					</select>
				</label>
			</section>
			<section
				ref={tagsPicker}
				className="space-y-2 border-t border-border pt-3"
			>
				<h4 className="text-xs font-semibold">Теги</h4>
				{tags.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{tags.map((tag) => (
							<button
								key={tag}
								type="button"
								disabled={pending.tags}
								aria-label={`Убрать тег ${tag}`}
								onClick={() => onTags(tags.filter((item) => item !== tag))}
								className="chat-context-tag hover:bg-accent/20 disabled:opacity-60"
							>
								<span className="min-w-0 break-all">{tag}</span>
								<X size={11} className="shrink-0" />
							</button>
						))}
					</div>
				)}
				<button
					ref={tagButton}
					type="button"
					aria-expanded={picker === "tag"}
					aria-controls={picker === "tag" ? tagsId : undefined}
					aria-disabled={pending.tags}
					onClick={() => {
						if (!pending.tags) togglePicker("tag");
					}}
					className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
				>
					<Tag size={13} /> Добавить тег
				</button>
				{picker === "tag" && (
					<div id={tagsId} className="chat-context-picker">
						<input
							ref={searchInput}
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							aria-label="Найти тег"
							placeholder="Название тега"
							className={field}
						/>
						<div className="supportos-scroll max-h-36 overflow-y-auto py-1">
							{matchingTags.length === 0 ? (
								<p className="px-2 py-2 text-xs text-muted">
									{query
										? "Теги не найдены"
										: tags.length
											? "Все доступные теги уже добавлены"
											: "Нет доступных тегов"}
								</p>
							) : (
								matchingTags.map(({ tag, pinned }) => (
									<div key={tag} className="flex items-center gap-1">
										<button type="button" onClick={() => chooseTag(tag)} disabled={pending.tags} className="chat-context-option min-w-0 flex-1 break-all text-left">{tag}</button>
										<button type="button" aria-label={`Закрепление тега ${tag}`} aria-pressed={pinned} title={pinned ? "Открепить тег" : "Закрепить тег"} onClick={() => togglePin(tag)} className={`grid size-8 shrink-0 place-items-center rounded-md hover:bg-surface-elevated ${pinned ? "text-accent" : "text-muted"}`}><Pin size={14} fill={pinned ? "currentColor" : "none"} /></button>
									</div>
								))
							)}
						</div>
					</div>
				)}
			</section>
		</fieldset>
	);
}

function readPinnedTags(key: string): string[] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
		return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
	} catch { return []; }
}
