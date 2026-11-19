import { useQuery } from "@tanstack/react-query";
import {
	ChevronRight,
	ContactRound,
	LoaderCircle,
	MessageSquare,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type ChatwootContact,
	type ChatwootInbox,
	chatwootService,
} from "@/services/chatwoot.service";
import { ChatContactEditor } from "./ChatContactEditor";
import { ChatSearch } from "./ChatFilters";
import { conversationStatusLabels } from "./ConversationActions";

const contactDate = new Intl.DateTimeFormat("ru", {
	dateStyle: "medium",
	timeStyle: "short",
});

function formatDate(value?: string | number) {
	if (!value) return "";
	const numeric = Number(value);
	const date = Number.isFinite(numeric)
		? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
		: new Date(value);
	return Number.isFinite(date.getTime()) ? contactDate.format(date) : "";
}

export function ChatContactsWorkspace({
	inboxes,
	onConversation,
}: {
	inboxes: ChatwootInbox[];
	onConversation: (id: number, name?: string) => void;
}) {
	const [input, setInput] = useState("");
	const [request, setRequest] = useState({ query: "", page: 1 });
	const [selected, setSelected] = useState<ChatwootContact | null>(null);
	const { query, page } = request;
	const trigger = useRef<HTMLButtonElement>(null);
	const details = useRef<HTMLElement>(null);
	const selectedId = selected?.id;
	useEffect(() => {
		const timer = window.setTimeout(() => {
			setRequest((current) =>
				current.query === input.trim()
					? current
					: { query: input.trim(), page: 1 },
			);
		}, 250);
		return () => window.clearTimeout(timer);
	}, [input]);
	useEffect(() => {
		if (selectedId == null) return;
		details.current?.focus({ preventScroll: true });
		if (window.matchMedia("(max-width: 1023px)").matches)
			details.current?.scrollIntoView({ block: "start" });
	}, [selectedId]);
	const contacts = useQuery({
		queryKey: ["chatwoot", "contact-directory", query, page],
		queryFn: ({ signal }) =>
			chatwootService.contactDirectory(query, page, signal),
		staleTime: 15000,
	});
	const history = useQuery({
		queryKey: ["chatwoot", "directory-contact-history", selectedId],
		queryFn: ({ signal }) =>
			chatwootService.directoryContactHistory(selectedId as number, signal),
		enabled: selectedId != null,
		staleTime: 15000,
	});
	const closeDetails = () => {
		setSelected(null);
		trigger.current?.focus();
	};
	const changeSearch = (value: string) => {
		setInput(value);
		setSelected(null);
	};
	const changePage = (target: number) => {
		setSelected(null);
		setRequest({ query, page: target });
	};
	const projects = new Map(inboxes.map(({ id, name }) => [id, name]));
	const rows = contacts.data?.payload ?? [];
	const list = history.data?.payload ?? [];
	return (
		<section
			aria-label="Контакты"
			className="chat-secondary-workspace supportos-scroll min-h-0 min-w-0 flex-1 overflow-auto p-2.5 sm:p-6"
		>
			<div className="mx-auto max-w-6xl space-y-4">
				<header className="flex items-center gap-2.5">
					<ContactRound size={20} className="text-accent" aria-hidden="true" />
					<h2 className="text-lg font-semibold">Контакты</h2>
				</header>
				<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(250px,340px)]">
					<div className="chat-contact-panel">
						<div className="border-b border-border p-2.5 sm:p-3">
							<ChatSearch
								label="Поиск контактов"
								placeholder="Имя, почта, телефон или ID игрока"
								value={input}
								maxLength={160}
								onChange={changeSearch}
							/>
						</div>
						{contacts.isPending ? (
							<output className="flex justify-center gap-2 p-6 text-xs text-muted">
								<LoaderCircle
									size={15}
									className="animate-spin"
									aria-hidden="true"
								/>{" "}
								Загружаем контакты
							</output>
						) : contacts.isError && !contacts.data ? (
							<div className="space-y-2 p-4 text-sm">
								<p role="alert" className="chat-text-danger">
									{contacts.error.message}
								</p>
								<button
									type="button"
									className="chat-contact-button"
									onClick={() => void contacts.refetch()}
								>
									Повторить
								</button>
							</div>
						) : rows.length === 0 ? (
							<p className="p-5 text-center text-sm text-muted">
								{query
									? "По этому запросу контакты не найдены"
									: "На этой странице нет контактов"}
							</p>
						) : (
							<ul>
								{rows.map((row) => (
									<li key={row.id}>
										<button
											type="button"
											aria-pressed={row.id === selectedId}
											className="chat-contact-row"
											onClick={(event) => {
												trigger.current = event.currentTarget;
												setSelected(row);
											}}
										>
											<span
												className="chat-avatar"
												data-tone={row.id % 4}
												aria-hidden="true"
											>
												{(row.name || row.email || "?")
													.slice(0, 1)
													.toUpperCase()}
											</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm font-semibold">
													{row.name || "Без имени"}
												</span>
												<span className="block truncate text-xs text-muted">
													{row.email ||
														row.phone_number ||
														row.identifier ||
														`Контакт #${row.id}`}
												</span>
											</span>
											{row.blocked && (
												<span className="hidden text-xs chat-text-danger sm:block">
													Заблокирован
												</span>
											)}
											<ChevronRight
												size={15}
												className="shrink-0 text-muted"
												aria-hidden="true"
											/>
										</button>
									</li>
								))}
							</ul>
						)}
						{(page > 1 || contacts.data?.hasMore) && (
							<nav
								aria-label="Страницы каталога"
								className="flex flex-wrap items-center gap-1.5 border-t border-border p-2.5 text-xs"
							>
								<span className="mr-auto text-muted">Страница {page}</span>
								<button
									type="button"
									className="chat-contact-button"
									disabled={page === 1 || contacts.isFetching}
									onClick={() => changePage(page - 1)}
								>
									Назад
								</button>
								<button
									type="button"
									className="chat-contact-button"
									disabled={!contacts.data?.hasMore || contacts.isFetching}
									onClick={() => changePage(page + 1)}
								>
									Дальше
								</button>
							</nav>
						)}
					</div>
					{selected && (
						<section
							aria-label="Сведения о контакте"
							ref={details}
							tabIndex={-1}
							className="chat-contact-panel space-y-3 p-3 sm:p-4"
						>
							<header className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<h3 className="break-words text-base font-semibold">
										{selected.name || "Без имени"}
									</h3>
									<p className="text-xs text-muted">
										Контакт #{selected.id}
										{selected.blocked ? " · Заблокирован" : ""}
									</p>
								</div>
								<button
									type="button"
									aria-label="Закрыть контакт"
									className="chat-filter-icon shrink-0"
									onClick={closeDetails}
								>
									<X size={15} />
								</button>
							</header>
							<dl className="grid gap-2 text-xs [overflow-wrap:anywhere]">
								<div>
									<dt className="text-muted">Электронная почта</dt>
									<dd>{selected.email || "—"}</dd>
								</div>
								<div>
									<dt className="text-muted">Телефон</dt>
									<dd>{selected.phone_number || "—"}</dd>
								</div>
								{selected.identifier && (
									<div>
										<dt className="text-muted">Идентификатор игрока</dt>
										<dd>{selected.identifier}</dd>
									</div>
								)}
								{formatDate(selected.last_activity_at) && (
									<div>
										<dt className="text-muted">Последняя активность</dt>
										<dd>{formatDate(selected.last_activity_at)}</dd>
									</div>
								)}
							</dl>
							{selected.label_list?.length ? (
								<ul aria-label="Теги контакта" className="flex flex-wrap gap-1">
									{selected.label_list.map((label) => (
										<li
											key={label}
											className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs text-muted"
										>
											{label}
										</li>
									))}
								</ul>
							) : null}
							<ChatContactEditor
								key={selected.id}
								contact={selected}
								onSaved={(value) =>
									setSelected((current) =>
										current?.id === value.id
											? { ...current, ...value }
											: current,
									)
								}
							/>
							<div className="space-y-2 border-t border-border pt-3">
								<h4 className="text-sm font-semibold">Недавние диалоги</h4>
								{history.isPending ? (
									<output className="text-xs text-muted">
										Загружаем диалоги
									</output>
								) : history.isError ? (
									<div className="space-y-1.5 text-xs">
										<p role="alert" className="chat-text-danger">
											{history.error.message}
										</p>
										<button
											type="button"
											className="chat-contact-button"
											onClick={() => void history.refetch()}
										>
											Повторить
										</button>
									</div>
								) : list.length === 0 ? (
									<p className="text-xs text-muted">Диалогов пока нет</p>
								) : (
									<ul className="space-y-1">
										{list.map((chat) => (
											<li key={chat.id}>
												<button
													type="button"
													className="chat-contact-history"
													onClick={() =>
														onConversation(chat.id, selected.name ?? undefined)
													}
												>
													<MessageSquare
														size={14}
														className="shrink-0 text-accent"
														aria-hidden="true"
													/>
													<span className="min-w-0">
														<span className="block truncate text-xs font-medium">
															#{chat.id} ·{" "}
															{chat.inbox_id == null
																? "Диалог"
																: (projects.get(chat.inbox_id) ??
																	`Источник #${chat.inbox_id}`)}
														</span>
														<span className="block text-[11px] text-muted">
															{[
																conversationStatusLabels[chat.status],
																formatDate(chat.created_at),
															]
																.filter(Boolean)
																.join(" · ")}
														</span>
													</span>
												</button>
											</li>
										))}
									</ul>
								)}
							</div>
						</section>
					)}
				</div>
			</div>
		</section>
	);
}
