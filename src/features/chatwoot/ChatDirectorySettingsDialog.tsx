import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2, X } from "lucide-react";
import { useState } from "react";
import { InboxModal } from "./InboxModal";
import { chatwootService, type ChatDirectoryItem, type ChatDirectoryKind, type ChatwootAgent } from "@/services/chatwoot.service";

const control = "rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus-visible:border-accent";
const button = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-elevated disabled:opacity-50";
const defaultDraft = { name: "", description: "", color: "#6366f1", showOnSidebar: true };

export function ChatDirectorySettingsDialog({ agents, onClose }: { agents: ChatwootAgent[]; onClose: () => void }) {
	const [kind, setKind] = useState<ChatDirectoryKind>("chat-team");
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<ChatDirectoryItem | null>(null);
	const [draft, setDraft] = useState(defaultDraft);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [editingMembers, setEditingMembers] = useState(false);
	const client = useQueryClient();
	const list = useQuery({ queryKey: ["chatwoot", kind], queryFn: () => chatwootService.directoryItems(kind) });
	const refresh = async () => {
		await Promise.all([
			client.invalidateQueries({ queryKey: ["chatwoot", kind] }),
			client.invalidateQueries({ queryKey: ["chatwoot", "directory"] }),
			client.invalidateQueries({ queryKey: ["chatwoot", "labels"] }),
		]);
	};
	const choose = (item: ChatDirectoryItem | null) => {
		setSelected(item);
		setDraft(item ? { name: item.name ?? item.title ?? "", description: item.description ?? "", color: item.color ?? defaultDraft.color, showOnSidebar: item.show_on_sidebar ?? true } : defaultDraft);
		setConfirmDelete(false);
		setEditingMembers(false);
	};
	const save = useMutation({
		mutationFn: () => chatwootService.saveDirectoryItem(kind, { ...draft, id: selected?.id }),
		onSuccess: async () => { await refresh(); choose(null); },
	});
	const remove = useMutation({
		mutationFn: (id: number) => chatwootService.deleteDirectoryItem(kind, id),
		onSuccess: async () => { await refresh(); choose(null); },
	});
	const busy = save.isPending || remove.isPending;
	const error = list.error || save.error || remove.error;
	const items = list.data?.payload.filter((item) => (item.title ?? item.name ?? "").toLowerCase().includes(search.trim().toLowerCase())) ?? [];
	return (
		<InboxModal labelledBy="chat-directory-title" className="flex max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" onClose={onClose}>
				<header className="flex items-center justify-between gap-3 border-b border-border p-4">
					<h2 id="chat-directory-title" className="flex items-center gap-2 text-sm font-semibold"><Settings2 size={15} /> Команды и теги</h2>
					<button type="button" className={button} aria-label="Закрыть" onClick={onClose}><X size={14}/></button>
				</header>
				<div className="border-b border-border p-3">
					<div role="group" aria-label="Справочники" className="chat-menu-tabs inline-flex">
					{([["chat-team", "Команды"], ["chat-label", "Теги"]] as const).map(([id, label]) => (
						<button type="button" key={id} aria-pressed={kind === id} disabled={busy} onClick={() => { choose(null); setKind(id); setSearch(""); save.reset(); remove.reset(); }}>{label}</button>
					))}
					</div>
				</div>
				<div className="supportos-scroll grid min-h-0 overflow-auto sm:grid-cols-[190px_minmax(0,1fr)]">
					<aside className="supportos-scroll max-h-[32dvh] space-y-1 overflow-y-auto border-b border-border p-3 sm:max-h-none sm:border-b-0 sm:border-r">
						<button type="button" className={`${button} w-full`} disabled={busy} onClick={() => choose(null)}><Plus size={13} /> {kind === "chat-team" ? "Новая команда" : "Новый тег"}</button>
						<input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={kind === "chat-team" ? "Поиск команд" : "Поиск тегов"} placeholder="Поиск" className={`${control} w-full`} />
						{list.isPending && <p className="p-2 text-xs text-muted">Загрузка…</p>}
						{list.isSuccess && !items.length && <p className="p-2 text-xs text-muted">{search.trim() ? "Совпадений нет" : kind === "chat-team" ? "Команд пока нет" : "Тегов пока нет"}</p>}
						{items.map((item) => <button type="button" disabled={busy} key={item.id} aria-pressed={selected?.id === item.id} onClick={() => choose(item)} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-xs hover:bg-surface-elevated ${selected?.id === item.id ? "bg-accent/10 text-accent" : ""}`}>{item.title ?? item.name ?? `#${item.id}`}</button>)}
					</aside>
					<div className="min-w-0 p-3 sm:p-4">
						{error && <p role="alert" className="mb-3 rounded-lg bg-red-500/10 p-2 text-xs chat-text-danger">{error.message}</p>}
						{editingMembers && selected ? <TeamMembers key={selected.id} id={selected.id} agents={agents} onClose={() => setEditingMembers(false)} /> : (
							<form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
								<h3 className="text-sm font-semibold">{selected ? (kind === "chat-team" ? "Настройки команды" : "Настройки тега") : (kind === "chat-team" ? "Новая команда" : "Новый тег")}</h3>
								<label className="flex flex-col gap-1.5 text-xs font-medium">Название<input required maxLength={60} className={control} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
								<label className="flex flex-col gap-1.5 text-xs font-medium">Описание<textarea maxLength={400} className={control} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
								{kind === "chat-label" && <div className="flex flex-wrap items-center gap-3 text-xs">
									<label className="flex items-center gap-2">Цвет<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label>
									<label className="flex items-center gap-2"><input type="checkbox" checked={draft.showOnSidebar} onChange={(event) => setDraft({ ...draft, showOnSidebar: event.target.checked })} /> Показывать в списке тегов Chatwoot</label>
								</div>}
								<div className="flex flex-wrap gap-2">
									<button type="submit" className={button} disabled={busy}>{selected ? "Сохранить" : "Создать"}</button>
									{selected && kind === "chat-team" && <button type="button" className={button} onClick={() => setEditingMembers(true)}>Участники</button>}
									{selected && <button type="button" className={`${button} chat-text-danger`} onClick={() => setConfirmDelete(true)}>Удалить</button>}
								</div>
								{selected && confirmDelete && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 p-2 text-xs"><span className="mr-auto">Удалить «{selected.title ?? selected.name}» в Chatwoot?</span><button type="button" className={button} onClick={() => setConfirmDelete(false)}>Отмена</button><button type="button" disabled={busy} className={`${button} chat-text-danger`} onClick={() => remove.mutate(selected.id)}>Да, удалить</button></div>}
							</form>
						)}
					</div>
				</div>
		</InboxModal>
	);
}

function TeamMembers({ id, agents, onClose }: { id: number; agents: ChatwootAgent[]; onClose: () => void }) {
	const query = useQuery({ queryKey: ["chatwoot", "team-members", id], queryFn: () => chatwootService.teamMembers(id) });
	const [draft, setDraft] = useState<number[] | null>(null);
	const [search, setSearch] = useState("");
	const selected = draft ?? query.data?.memberIds ?? [];
	const matches = agents.filter((agent) => `${agent.name} ${agent.email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
	const save = useMutation({
		mutationFn: () => chatwootService.saveTeamMembers(id, selected),
		onSuccess: async () => { await query.refetch(); onClose(); },
	});
	return <div className="space-y-3 text-xs">
		<h3 className="font-semibold">Участники команды</h3>
		{(query.error || save.error) && <p role="alert" className="chat-text-danger">{(query.error || save.error)?.message}</p>}
		{query.isPending && <p className="text-muted">Загрузка участников…</p>}
		{query.data && <label className="block space-y-1"><span>Найти участника</span><input className={`${control} w-full`} placeholder="Имя или почта" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
		<div className="max-h-60 space-y-1 overflow-auto">
			{query.data && !matches.length && <p className="text-muted">Агенты не найдены</p>}
			{query.data && matches.map((agent) => (
				<label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-elevated" key={agent.id}>
					<input type="checkbox" checked={selected.includes(agent.id)} onChange={(event) => setDraft(event.target.checked ? [...selected, agent.id] : selected.filter((id) => id !== agent.id))} />{agent.name}
				</label>
			))}
		</div>
		<div className="flex gap-2"><button type="button" className={button} onClick={onClose}>Назад</button><button type="button" disabled={!query.data || save.isPending} className={button} onClick={() => save.mutate()}>Сохранить участников</button></div>
	</div>;
}
