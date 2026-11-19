import {
	Archive,
	Building2,
	Clock3,
	Globe2,
	Tag,
	UserRound,
} from "lucide-react";
import { useId, useState } from "react";
import type { ChatwootAgent, ChatwootInbox } from "@/services/chatwoot.service";
import {
	ChatFilterPanel,
	ChatFilterSelect,
	ChatFilterSummary,
	ChatFilterToggle,
	ChatSearch,
	type FilterChip,
} from "./ChatFilters";
import { ChatSavedViews, readViewFields } from "./ChatSavedViews";

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
	userId?: string;
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

const viewFields = [
	"inboxId",
	"agentId",
	"label",
	"from",
	"to",
	"historyStatus",
] as const;
type ListView = Omit<ConversationFilters, "search"> &
	Pick<Props, "historyStatus">;

function decodeListView(input: unknown): ListView | null {
	const fields = readViewFields(input, viewFields);
	if (
		!fields ||
		![fields.inboxId, fields.agentId].every(
			(value) => !value || /^\d+$/.test(value),
		) ||
		![fields.from, fields.to].every(
			(value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
		) ||
		(fields.historyStatus !== "resolved" && fields.historyStatus !== "snoozed")
	)
		return null;
	return { ...fields, historyStatus: fields.historyStatus };
}

export function countConversationFilters(filters: ConversationFilters) {
	return [
		filters.inboxId,
		filters.agentId,
		filters.label,
		filters.from || filters.to,
	].filter(Boolean).length;
}

const shortDate = (date: string) => date.split("-").reverse().join(".");

export function ConversationListToolbar({
	userId,
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
	const projectName = inboxes.find(
		(inbox) => String(inbox.id) === project,
	)?.name;
	const chips: FilterChip[] = [];
	if (filters.inboxId)
		chips.push({
			key: "project",
			label: "Проект",
			value: projectName ?? `#${filters.inboxId}`,
			remove: () => update({ inboxId: "" }),
		});
	if (filters.label)
		chips.push({
			key: "tag",
			label: "Тег",
			value: filters.label,
			remove: () => update({ label: "" }),
		});
	if (canFilterByAgent && filters.agentId)
		chips.push({
			key: "agent",
			label: "Агент",
			value:
				agents.find((agent) => String(agent.id) === filters.agentId)?.name ??
				`#${filters.agentId}`,
			remove: () => update({ agentId: "" }),
		});
	if (filters.from || filters.to) {
		const range = [
			filters.from && `с ${shortDate(filters.from)}`,
			filters.to && `по ${shortDate(filters.to)}`,
		]
			.filter(Boolean)
			.join(" ");
		chips.push({
			key: "range",
			label: "Период",
			value: range,
			remove: () => update({ from: "", to: "" }),
		});
	}
	return (
		<div className="chat-list-toolbar">
			{scope === "history" && (
				<fieldset className="chat-menu-tabs grid min-w-0 grid-cols-2">
					<legend className="sr-only">Статус в архиве</legend>
					<button
						type="button"
						aria-pressed={historyStatus === "resolved"}
						onClick={() => onHistoryStatus("resolved")}
					>
						<Archive size={13} /> Завершённые
					</button>
					<button
						type="button"
						aria-pressed={historyStatus === "snoozed"}
						onClick={() => onHistoryStatus("snoozed")}
					>
						<Clock3 size={13} /> Отложенные
					</button>
				</fieldset>
			)}
			<div className="chat-list-searchbar">
				<ChatSearch
					label="Поиск диалогов"
					placeholder="Игрок, текст или №"
					value={filters.search}
					onChange={(search) => update({ search })}
				/>
				<ChatFilterToggle
					open={expanded}
					panel={filterPanelId}
					count={chips.length}
					onToggle={() => setExpanded(!expanded)}
				/>
			</div>
			{userId && (
				<ChatSavedViews
					key={scope}
					storageKey={`supportos:chats:views:${userId}:${scope}`}
					canSave={
						chips.length > 0 ||
						(scope === "history" && historyStatus === "snoozed")
					}
					value={{
						inboxId: filters.inboxId,
						agentId: filters.agentId,
						label: filters.label,
						from: filters.from,
						to: filters.to,
						historyStatus,
					}}
					decode={decodeListView}
					onApply={({ historyStatus: status, ...saved }) => {
						update({ ...saved, search: "" });
						if (scope === "history") onHistoryStatus(status);
					}}
				/>
			)}
			{requireProject && !filters.inboxId && (
				<p className="chat-filter-source" title={projectName}>
					<Globe2 size={13} aria-hidden="true" />
					<span className="truncate">
						{projectName
							? `Очередь проекта · ${projectName}`
							: "Нет доступных проектов"}
					</span>
				</p>
			)}
			<ChatFilterSummary
				chips={chips}
				onReset={() =>
					update({ ...emptyConversationFilters, search: filters.search })
				}
			/>
			<ChatFilterPanel
				id={filterPanelId}
				open={expanded}
				onClose={() => setExpanded(false)}
			>
				<ChatFilterSelect
					icon={Building2}
					label="Проект"
					value={project}
					empty={
						requireProject
							? inboxes.length
								? undefined
								: "Нет проектов"
							: "Все проекты"
					}
					options={inboxes.map((inbox) => ({
						value: String(inbox.id),
						label: inbox.name,
					}))}
					onChange={(inboxId) => update({ inboxId })}
				/>
				<ChatFilterSelect
					icon={Tag}
					label="Тег"
					value={filters.label}
					empty="Все теги"
					options={labels.map((label) => ({ value: label, label }))}
					onChange={(label) => update({ label })}
				/>
				{scope === "history" && (
					<>
						{canFilterByAgent && (
							<div className="col-span-2">
								<ChatFilterSelect
									icon={UserRound}
									label="Агент"
									value={filters.agentId}
									empty="Все агенты"
									options={agents.map((agent) => ({
										value: String(agent.id),
										label: agent.name,
									}))}
									onChange={(agentId) => update({ agentId })}
								/>
							</div>
						)}
						<label className="chat-filter-field">
							<span>С даты</span>
							<input
								type="date"
								value={filters.from}
								max={filters.to || undefined}
								onChange={(event) => update({ from: event.target.value })}
							/>
						</label>
						<label className="chat-filter-field">
							<span>По дату</span>
							<input
								type="date"
								value={filters.to}
								min={filters.from || undefined}
								onChange={(event) => update({ to: event.target.value })}
							/>
						</label>
					</>
				)}
			</ChatFilterPanel>
		</div>
	);
}
