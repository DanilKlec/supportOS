import {
	Archive,
	Building2,
	Clock3,
	Search,
	Tag,
	UserRound,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ChatwootAgent, ChatwootInbox } from "@/services/chatwoot.service";
import {
	projectTagScope,
	searchProjectTags,
	tagsForProject,
} from "./chat-tags";
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
	email: "",
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
type ListView = Omit<ConversationFilters, "search" | "email"> &
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
		filters.email.trim(),
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
	inboxes,
	agents,
	labels,
	canFilterByAgent,
	historyStatus,
	onHistoryStatus,
}: Props) {
	const filterPanelId = useId();
	const [expanded, setExpanded] = useState(false);
	const [tagSearch, setTagSearch] = useState<string | null>(null);
	const [agentSearch, setAgentSearch] = useState<string | null>(null);
	const tagSearchId = `${filterPanelId}-tag`;
	const agentSearchId = `${filterPanelId}-agent`;
	const agentSearchOpen = agentSearch !== null;
	const tagSearchOpen = tagSearch !== null;
	const closeFilters = () => {
		setExpanded(false);
		setTagSearch(null);
		setAgentSearch(null);
	};
	useEffect(() => {
		if (expanded && tagSearchOpen)
			document.getElementById(tagSearchId)?.focus();
	}, [expanded, tagSearchId, tagSearchOpen]);
	useEffect(() => {
		if (expanded && agentSearchOpen)
			document.getElementById(agentSearchId)?.focus();
	}, [expanded, agentSearchId, agentSearchOpen]);
	const source = inboxes.find((inbox) => String(inbox.id) === project);
	const projectName = source?.name;
	const matchingLabels = searchProjectTags(
		labels,
		projectTagScope(source),
		tagSearch ?? "",
		filters.label,
	);
	const selectedAgent = agents.find(
		(agent) => String(agent.id) === filters.agentId,
	);
	const agentQuery = (agentSearch ?? "").trim().toLocaleLowerCase("ru");
	const matchingAgents = agents
		.filter((agent) =>
			[agent.name, agent.available_name, agent.email].some((value) =>
				value?.toLocaleLowerCase("ru").includes(agentQuery),
			),
		)
		.sort((a, b) => a.name.localeCompare(b.name, "ru"));
	const agentOptions =
		selectedAgent && !matchingAgents.includes(selectedAgent)
			? [selectedAgent, ...matchingAgents]
			: matchingAgents;
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
			value: selectedAgent?.name ?? `#${filters.agentId}`,
			remove: () => update({ agentId: "" }),
		});
	if (scope === "history" && filters.email.trim())
		chips.push({
			key: "email",
			label: "Почта игрока",
			value: filters.email.trim(),
			remove: () => update({ email: "" }),
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
		<div
			className={
				scope === "history"
					? "chat-list-toolbar chat-archive-toolbar"
					: "chat-list-toolbar"
			}
		>
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
					placeholder={
						scope === "history" ? "Имя, email, текст, №" : "Игрок, текст или №"
					}
					value={filters.search}
					onChange={(search) => update({ search })}
				/>
				<ChatFilterToggle
					open={expanded}
					panel={filterPanelId}
					count={chips.length}
					onToggle={() => (expanded ? closeFilters() : setExpanded(true))}
				/>
			</div>
			{userId && (
				<ChatSavedViews
					key={scope}
					storageKey={`supportos:chats:views:${userId}:${scope}`}
					canSave={
						chips.some((chip) => chip.key !== "email") ||
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
						setAgentSearch(null);
						setTagSearch(null);
						update({ ...saved, search: "", email: "" });
						if (scope === "history") onHistoryStatus(status);
					}}
				/>
			)}
			<ChatFilterSummary
				chips={chips}
				onReset={() => {
					setAgentSearch(null);
					setTagSearch(null);
					update({ ...emptyConversationFilters, search: filters.search });
				}}
			/>
			<ChatFilterPanel
				id={filterPanelId}
				open={expanded}
				onClose={closeFilters}
			>
				<ChatFilterSelect
					icon={Building2}
					label="Проект"
					value={project}
					empty={inboxes.length ? "Все проекты" : "Нет доступных проектов"}
					options={inboxes.map((inbox) => ({
						value: String(inbox.id),
						label: inbox.name,
					}))}
					onChange={(inboxId) => {
						const tagScope = projectTagScope(
							inboxes.find((inbox) => String(inbox.id) === inboxId),
						);
						update({
							inboxId,
							label: tagsForProject([filters.label], tagScope)[0] ?? "",
						});
					}}
				/>
				<div className="min-w-0 space-y-1.5">
					<ChatFilterSelect
						icon={Tag}
						label="Тег"
						value={filters.label}
						empty={
							matchingLabels.length || !tagSearch
								? "Все теги"
								: "Теги не найдены"
						}
						searchControl={
							labels.length > 0 && (
								<button
									type="button"
									className="chat-filter-icon"
									title="Поиск по тегам"
									aria-label="Поиск по тегам"
									aria-expanded={tagSearchOpen}
									aria-controls={tagSearchOpen ? tagSearchId : undefined}
									onClick={() => {
										setAgentSearch(null);
										setTagSearch(tagSearchOpen ? null : "");
									}}
								>
									<Search size={13} aria-hidden="true" />
								</button>
							)
						}
						options={matchingLabels.map((label) => ({ value: label, label }))}
						onChange={(label) => {
							update({ label });
							setTagSearch(null);
						}}
					/>
					{tagSearch !== null && (
						<ChatSearch
							id={tagSearchId}
							label="Найти тег для фильтра"
							placeholder="Найти тег…"
							value={tagSearch}
							onChange={setTagSearch}
						/>
					)}
				</div>
				{scope === "history" && (
					<>
						{canFilterByAgent && (
							<div className="chat-archive-agent">
								<ChatFilterSelect
									icon={UserRound}
									label="Агент"
									value={filters.agentId}
									empty={
										agentQuery && !matchingAgents.length
											? "Агенты не найдены"
											: "Все агенты"
									}
									searchControl={
										agents.length > 0 && (
											<button
												type="button"
												className="chat-filter-icon"
												title="Поиск по агентам"
												aria-label="Поиск по агентам"
												aria-expanded={agentSearchOpen}
												aria-controls={
													agentSearchOpen ? agentSearchId : undefined
												}
												onClick={() => {
													setTagSearch(null);
													setAgentSearch(agentSearchOpen ? null : "");
												}}
											>
												<Search size={13} aria-hidden="true" />
											</button>
										)
									}
									options={agentOptions.map((agent) => ({
										value: String(agent.id),
										label: agent.email
											? `${agent.name} · ${agent.email}`
											: agent.name,
									}))}
									onChange={(agentId) => {
										update({ agentId });
										setAgentSearch(null);
									}}
								/>
								{agentSearch !== null && (
									<ChatSearch
										id={agentSearchId}
										label="Найти агента в списке"
										placeholder="Имя или почта агента…"
										value={agentSearch}
										onChange={setAgentSearch}
									/>
								)}
							</div>
						)}
						<label className="chat-filter-field chat-archive-email">
							<span>Почта игрока</span>
							<input
								type="text"
								inputMode="email"
								autoComplete="off"
								spellCheck={false}
								maxLength={254}
								placeholder="Email или его часть"
								value={filters.email}
								onChange={(event) => update({ email: event.target.value })}
							/>
						</label>
						<fieldset className="chat-archive-dates">
							<legend>Дата создания диалога</legend>
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
						</fieldset>
					</>
				)}
			</ChatFilterPanel>
		</div>
	);
}
