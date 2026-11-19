import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";
import type { ChatwootAgent, ChatwootInbox } from "@/services/chatwoot.service";

export const emptyConversationFilters = {
	search: "",
	inboxId: "",
	agentId: "",
	label: "",
	from: "",
	to: "",
};
export type ConversationFilters = typeof emptyConversationFilters;

type Props = {
	scope: "mine" | "queue" | "history";
	filters: ConversationFilters;
	update: (patch: Partial<ConversationFilters>) => void;
	project: string;
	requireProject: boolean;
	inboxes: ChatwootInbox[];
	agents: ChatwootAgent[];
	labels: string[];
	canFilterByAgent: boolean;
	historyStatus: "resolved" | "snoozed";
	onHistoryStatus: (status: "resolved" | "snoozed") => void;
};

const field =
	"h-8 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-xs text-foreground";

export function countConversationFilters(filters: ConversationFilters) {
	return [
		filters.inboxId,
		filters.agentId,
		filters.label,
		filters.from || filters.to,
	].filter(Boolean).length;
}

export function ConversationListToolbar({
	scope,
	filters,
	update,
	project,
	requireProject,
	inboxes,
	agents,
	labels,
	canFilterByAgent,
	historyStatus,
	onHistoryStatus,
}: Props) {
	const filterPanelId = useId();
	const [expanded, setExpanded] = useState(false);
	const count = countConversationFilters(filters);
	const projectName = requireProject
		? inboxes.find((inbox) => String(inbox.id) === project)?.name
		: undefined;
	return (
		<div className="space-y-2.5 border-b border-border p-3">
			{scope === "history" && (
				<fieldset className="chat-menu-tabs grid min-w-0 grid-cols-2">
					<legend className="sr-only">Статус в архиве</legend>
					<button
						type="button"
						aria-pressed={historyStatus === "resolved"}
						onClick={() => onHistoryStatus("resolved")}
					>
						Завершённые
					</button>
					<button
						type="button"
						aria-pressed={historyStatus === "snoozed"}
						onClick={() => onHistoryStatus("snoozed")}
					>
						Отложенные
					</button>
				</fieldset>
			)}
			<div className="flex flex-wrap gap-1.5">
				<div className="relative min-w-[8rem] flex-1">
					<Search
						size={14}
						aria-hidden="true"
						className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
					/>
					<input
						type="text"
						aria-label="Поиск диалогов"
						placeholder="Игрок, сообщение или №"
						value={filters.search}
						onChange={(event) => update({ search: event.target.value })}
						className="h-9 w-full min-w-0 rounded-lg border border-border bg-background pl-8 pr-7 text-xs placeholder:text-muted"
					/>
					{filters.search && (
						<button
							type="button"
							aria-label="Очистить поиск"
							onClick={() => update({ search: "" })}
							className="absolute right-0.5 top-0.5 grid size-8 place-items-center rounded-md text-muted hover:text-foreground"
						>
							<X size={13} />
						</button>
					)}
				</div>
				<button
					type="button"
					aria-expanded={expanded}
					aria-controls={filterPanelId}
					className="chat-menu-filter"
					onClick={() => setExpanded(!expanded)}
				>
					<SlidersHorizontal size={14} aria-hidden="true" /> Фильтры
					{count > 0 && (
						<span
							title={`Применено фильтров: ${count}`}
							className="rounded-md bg-accent/15 px-1.5 tabular-nums text-accent"
						>
							{count}
						</span>
					)}
				</button>
			</div>
			{requireProject && (
				<p
					className="truncate px-0.5 text-[11px] text-muted"
					title={projectName}
				>
					{projectName
						? `Очередь проекта · ${projectName}`
						: "Нет доступных проектов"}
				</p>
			)}
			<div id={filterPanelId} hidden={!expanded}>
				<div className="chat-list-filter-fields grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-2">
					<label className="min-w-0 space-y-1 text-[11px] text-muted">
						<span>Проект</span>
						<select
							className={field}
							value={project}
							onChange={(event) => update({ inboxId: event.target.value })}
						>
							{(!requireProject || !inboxes.length) && (
								<option value="">
									{requireProject ? "Нет проектов" : "Все проекты"}
								</option>
							)}
							{inboxes.map((inbox) => (
								<option key={inbox.id} value={inbox.id}>
									{inbox.name}
								</option>
							))}
						</select>
					</label>
					<label className="min-w-0 space-y-1 text-[11px] text-muted">
						<span>Тег</span>
						<select
							className={field}
							value={filters.label}
							onChange={(event) => update({ label: event.target.value })}
						>
							<option value="">Все теги</option>
							{labels.map((tag) => (
								<option key={tag} value={tag}>
									{tag}
								</option>
							))}
						</select>
					</label>
					{scope === "history" && (
						<>
							{canFilterByAgent && (
								<label className="col-span-2 min-w-0 space-y-1 text-[11px] text-muted">
									<span>Агент</span>
									<select
										className={field}
										value={filters.agentId}
										onChange={(event) =>
											update({ agentId: event.target.value })
										}
									>
										<option value="">Все агенты</option>
										{agents.map((agent) => (
											<option key={agent.id} value={agent.id}>
												{agent.name}
											</option>
										))}
									</select>
								</label>
							)}
							<label className="min-w-0 space-y-1 text-[11px] text-muted">
								<span>С даты</span>
								<input
									className={field}
									type="date"
									value={filters.from}
									max={filters.to || undefined}
									onChange={(event) => update({ from: event.target.value })}
								/>
							</label>
							<label className="min-w-0 space-y-1 text-[11px] text-muted">
								<span>По дату</span>
								<input
									className={field}
									type="date"
									value={filters.to}
									min={filters.from || undefined}
									onChange={(event) => update({ to: event.target.value })}
								/>
							</label>
						</>
					)}
					{count > 0 && (
						<button
							type="button"
							onClick={() =>
								update({ ...emptyConversationFilters, search: filters.search })
							}
							className="col-span-2 flex min-h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<RotateCcw size={12} /> Сбросить фильтры
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
