import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type ChatwootContact,
	chatwootService,
} from "@/services/chatwoot.service";
import { ChatSearch } from "./ChatFilters";

export function ChatContactTools({ contact }: { contact: ChatwootContact }) {
	const client = useQueryClient();
	const [tab, setTab] = useState<"notes" | "merge">();
	const [text, setText] = useState("");
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");
	const [duplicate, setDuplicate] = useState<ChatwootContact>();
	const [merged, setMerged] = useState(false);
	useEffect(() => {
		const timeout = window.setTimeout(() => setQuery(search.trim()), 250);
		return () => window.clearTimeout(timeout);
	}, [search]);
	const notesKey = ["chatwoot", "directory-contact-notes", contact.id];
	const notes = useQuery({
		queryKey: notesKey,
		queryFn: ({ signal }) =>
			chatwootService.directoryContactNotes(contact.id, signal),
		enabled: tab === "notes",
	});
	const results = useQuery({
		queryKey: ["chatwoot", "contact-directory", query, 1],
		queryFn: ({ signal }) => chatwootService.contactDirectory(query, 1, signal),
		enabled: tab === "merge" && query.length > 1,
	});
	const save = useMutation({
		mutationFn: (content: string) =>
			chatwootService.addContactNote(contact.id, content),
		onSuccess: () => {
			setText("");
			void client.invalidateQueries({ queryKey: notesKey });
		},
	});
	const merge = useMutation({
		mutationFn: (id: number) => chatwootService.mergeContacts(contact.id, id),
		onSuccess: () => {
			setDuplicate(undefined);
			setSearch("");
			setTab(undefined);
			setMerged(true);
			for (const resource of [
				"contact-directory",
				"directory-contact-history",
				"directory-contact-notes",
				"contact",
				"contact-history",
				"conversations",
				"conversation",
				"active-overview",
			])
				void client.invalidateQueries({ queryKey: ["chatwoot", resource] });
		},
	});
	const choices =
		results.data?.payload.filter(({ id }) => id !== contact.id) ?? [];
	return (
		<div className="space-y-2 border-t border-border pt-3">
			<div className="flex flex-wrap gap-1.5">
				<button
					type="button"
					className="chat-contact-button"
					aria-expanded={tab === "notes"}
					onClick={() => setTab(tab === "notes" ? undefined : "notes")}
				>
					<StickyNote size={13} /> Заметки
				</button>
				<button
					type="button"
					className="chat-contact-button"
					aria-expanded={tab === "merge"}
					onClick={() => {
						setMerged(false);
						setTab(tab === "merge" ? undefined : "merge");
					}}
				>
					<GitMerge size={13} /> Объединить дубли
				</button>
			</div>
			{merged && (
				<output className="text-xs text-accent">Контакты объединены</output>
			)}
			{tab === "notes" && (
				<section aria-label="Заметки к контакту" className="space-y-2">
					{notes.isPending ? (
						<p className="text-xs text-muted">Загружаем заметки…</p>
					) : notes.error ? (
						<p role="alert" className="text-xs chat-text-danger">
							{notes.error.message}
						</p>
					) : !notes.data.notes.length ? (
						<p className="text-xs text-muted">Заметок пока нет.</p>
					) : (
						<ul className="supportos-scroll max-h-48 space-y-1.5 overflow-auto">
							{notes.data.notes.map((note) => (
								<li
									key={note.id}
									className="rounded-lg border border-border p-2 text-xs"
								>
									<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
										{note.content}
									</p>
									<span className="text-muted">
										{[
											note.author,
											note.created_at
												? new Date(note.created_at * 1000).toLocaleString("ru")
												: "",
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</li>
							))}
						</ul>
					)}
					<form
						className="space-y-1.5"
						onSubmit={(event) => {
							event.preventDefault();
							if (text.trim() && !save.isPending) save.mutate(text.trim());
						}}
					>
						<textarea
							className="w-full rounded-lg border border-border bg-background p-2 text-xs"
							aria-label="Новая заметка к контакту"
							value={text}
							maxLength={2000}
							onChange={(event) => setText(event.target.value)}
						/>
						{save.error && (
							<p role="alert" className="text-xs chat-text-danger">
								{save.error.message}
							</p>
						)}
						<button
							type="submit"
							className="chat-contact-button"
							disabled={!text.trim() || save.isPending}
						>
							Добавить заметку
						</button>
					</form>
				</section>
			)}
			{tab === "merge" && (
				<section aria-label="Объединение контактов" className="space-y-2">
					{duplicate ? (
						<>
							<p className="text-xs [overflow-wrap:anywhere]">
								Сохранится контакт #{contact.id} {contact.name || contact.email}
								. История будет перенесена из #{duplicate.id}{" "}
								{duplicate.email || duplicate.name}. Дубль будет удалён.
							</p>
							<div className="flex flex-wrap gap-1.5">
								<button
									type="button"
									className="chat-contact-button chat-text-danger"
									disabled={merge.isPending}
									onClick={() => merge.mutate(duplicate.id)}
								>
									Подтвердить объединение
								</button>
								<button
									type="button"
									className="chat-contact-button"
									disabled={merge.isPending}
									onClick={() => setDuplicate(undefined)}
								>
									Отмена
								</button>
							</div>
						</>
					) : (
						<>
							<ChatSearch
								label="Найти дубль"
								placeholder="Имя или почта дубля"
								maxLength={160}
								value={search}
								onChange={setSearch}
							/>
							{results.error && (
								<p role="alert" className="text-xs chat-text-danger">
									{results.error.message}
								</p>
							)}
							{results.isSuccess && query.length > 1 && !choices.length && (
								<p className="text-xs text-muted">
									Подходящие контакты не найдены.
								</p>
							)}
							<ul className="supportos-scroll max-h-44 space-y-1 overflow-auto">
								{query === search.trim() &&
									choices.map((row) => (
										<li key={row.id}>
											<button
												type="button"
												className="chat-contact-history"
												onClick={() => setDuplicate(row)}
											>
												<span className="min-w-0 truncate">
													#{row.id} ·{" "}
													{row.email || row.name || row.phone_number}
												</span>
											</button>
										</li>
									))}
							</ul>
						</>
					)}
					{merge.error && (
						<p role="alert" className="text-xs chat-text-danger">
							{merge.error.message}
						</p>
					)}
				</section>
			)}
		</div>
	);
}
