import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, UserRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { type ChatwootAgentProfile, chatwootService } from "@/services/chatwoot.service";
import { InboxModal } from "./InboxModal";

const profileKey = ["chatwoot", "agent-profile"] as const;

export function AgentProfileDialog({ onClose, profileUrl }: { onClose: () => void; profileUrl?: string }) {
	const titleId = useId();
	const profile = useQuery({ queryKey: profileKey, queryFn: ({ signal }) => chatwootService.agentProfile(signal), retry: false });
	const editing = useRef(false);
	const close = () => { if (!editing.current) onClose(); };

	return <InboxModal labelledBy={titleId} className="w-full max-w-md overflow-auto rounded-2xl border border-border bg-surface shadow-xl" onClose={close}>
		<header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
			<div>
				<h2 id={titleId} className="text-base font-semibold">Имя и фото в чате</h2>
				<p className="mt-1 text-xs text-muted">Эти данные видит клиент в ваших ответах.</p>
			</div>
			<button type="button" aria-label="Закрыть профиль" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-elevated" onClick={close}><X size={16} /></button>
		</header>
		{profile.isPending && <output className="block p-5 text-sm text-muted">Загружаем профиль…</output>}
		{profile.isError && <div className="space-y-3 p-5 text-sm">
			<p role="alert" className="chat-text-danger">{profile.error.message}</p>
			<button type="button" onClick={() => void profile.refetch()} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-elevated">Повторить</button>
			{profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer" className="ml-3 text-xs text-accent hover:underline">Открыть профиль в Chatwoot</a>}
		</div>}
		{profile.data && <AgentAppearanceForm profile={profile.data} onSaving={(value) => { editing.current = value; }} />}
	</InboxModal>;
}

function AgentAppearanceForm({ profile, onSaving }: { profile: ChatwootAgentProfile; onSaving: (value: boolean) => void }) {
	const client = useQueryClient();
	const [displayName, setDisplayName] = useState<string | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState("");
	const [fileError, setFileError] = useState("");
	const [avatarFailed, setAvatarFailed] = useState("");
	const fileInput = useRef<HTMLInputElement>(null);
	const name = displayName ?? profile.displayName;
	const avatar = preview || profile.avatarUrl;
	useEffect(() => {
		if (!file) { setPreview(""); return; }
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);
	const save = useMutation({
		mutationFn: () => chatwootService.updateAgentProfile(name.trim(), file),
		onMutate: () => onSaving(true),
		onSuccess: (updated) => {
			client.setQueryData(profileKey, updated);
			setDisplayName(null);
			setFile(null);
			void client.invalidateQueries({ queryKey: ["chatwoot", "directory"] });
			void client.invalidateQueries({ queryKey: ["chatwoot", "messages"] });
		},
		onSettled: () => onSaving(false),
	});
	const dirty = name.trim() !== profile.displayName || file !== null;

	return <form className="space-y-4 p-5" onSubmit={(event) => {
		event.preventDefault();
		if (dirty && !fileError && !save.isPending) save.mutate();
	}}>
		<div className="flex items-center gap-3">
			<div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-background text-muted">
				{avatar && avatar !== avatarFailed ? <img src={avatar} referrerPolicy="no-referrer" onError={() => setAvatarFailed(avatar)} alt="Фото оператора" className="size-full object-cover" /> : <UserRound size={26} aria-hidden="true" />}
			</div>
			<div className="min-w-0">
				<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={save.isPending} onChange={(event) => {
					const next = event.target.files?.[0];
					event.target.value = "";
					if (!next) return;
					save.reset();
					if (next.size > 2 * 1024 * 1024) { setFileError("Фото должно быть не больше 2 МБ."); setFile(null); return; }
					setFileError("");
					setFile(next);
				}} />
				<button type="button" disabled={save.isPending} onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-elevated"><Camera size={14} /> Выбрать фото</button>
				{(file || fileError) && <button type="button" disabled={save.isPending} onClick={() => { setFile(null); setFileError(""); }} className="ml-2 text-xs text-muted hover:text-foreground">Отменить выбор</button>}
				<p className="mt-1 truncate text-[11px] text-muted" title={file?.name}>{file?.name ?? "JPG, PNG, GIF или WebP до 2 МБ"}</p>
			</div>
		</div>
		<label className="block text-sm font-medium">
			Имя для клиентов
			<input value={name} maxLength={100} placeholder={profile.name || "Введите имя"} disabled={save.isPending} onChange={(event) => { setDisplayName(event.target.value); save.reset(); }} className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent" />
			<span className="mt-1 block text-xs font-normal text-muted">Если оставить поле пустым, Chatwoot покажет имя из профиля.</span>
		</label>
		{(fileError || save.isError) && <p role="alert" className="text-xs chat-text-danger">{fileError || save.error?.message}</p>}
		<div className="flex flex-wrap items-center justify-between gap-2">
			{save.isSuccess && <output className="text-xs chat-text-success">Профиль обновлён в Chatwoot</output>}
			<button type="submit" disabled={!dirty || Boolean(fileError) || save.isPending} className="ml-auto rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{save.isPending ? "Сохраняем…" : "Сохранить"}</button>
		</div>
	</form>;
}
