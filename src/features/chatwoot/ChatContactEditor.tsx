import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
	type ChatwootContact,
	type ChatwootContactFields,
	chatwootService,
} from "@/services/chatwoot.service";

const fields = [
	{ key: "name", label: "Имя", type: "text", maxLength: 160 },
	{ key: "email", label: "Электронная почта", type: "email", maxLength: 254 },
	{ key: "phone_number", label: "Телефон", type: "tel", maxLength: 40 },
] as const;

export function ChatContactEditor({
	contact,
	conversationId,
	onSaved,
}: {
	contact: ChatwootContact;
	conversationId?: number;
	onSaved?: (contact: ChatwootContact) => void;
}) {
	const client = useQueryClient();
	const [initial, setInitial] = useState<ChatwootContact | null>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const form = useRef<HTMLFormElement>(null);
	const returnFocus = useRef(false);
	useEffect(() => {
		if (initial) form.current?.querySelector("input")?.focus();
		else if (returnFocus.current) trigger.current?.focus();
	}, [initial]);
	const close = () => {
		returnFocus.current = true;
		setInitial(null);
	};
	const save = useMutation({
		mutationFn: (patch: ChatwootContactFields) =>
			chatwootService.updateContact(contact.id, patch, conversationId),
		onSuccess: (updated) => {
			client.setQueriesData<ChatwootContact>(
				{ queryKey: ["chatwoot", "contact", contact.id] },
				(previous) => previous && { ...previous, ...updated },
			);
			for (const key of [
				"contact-directory",
				"conversations",
				"conversation",
				"active-overview",
			])
				void client.invalidateQueries({ queryKey: ["chatwoot", key] });
			onSaved?.(updated);
			close();
		},
	});
	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!initial || save.isPending) return;
		const values = new FormData(event.currentTarget);
		const patch: ChatwootContactFields = {};
		for (const { key } of fields) {
			const value = String(values.get(key) ?? "").trim() || null;
			if (value !== (initial[key]?.trim() || null)) patch[key] = value;
		}
		if (Object.keys(patch).length) save.mutate(patch);
		else close();
	};
	if (!initial)
		return (
			<div className="flex flex-wrap items-center gap-2">
				<button
					ref={trigger}
					type="button"
					className="chat-contact-button"
					onClick={() => {
						save.reset();
						setInitial(contact);
					}}
				>
					<Pencil size={13} aria-hidden="true" /> Редактировать контакт
				</button>
				{save.isSuccess && (
					<output className="text-xs text-accent">Сохранено</output>
				)}
			</div>
		);
	return (
		<form
			ref={form}
			aria-label="Редактирование контакта"
			className="chat-contact-form"
			onSubmit={submit}
			onKeyDown={(event) => {
				if (event.key === "Escape" && !save.isPending) {
					event.preventDefault();
					close();
				}
			}}
		>
			<fieldset className="grid gap-2.5" disabled={save.isPending}>
				<legend className="sr-only">Поля контакта</legend>
				{fields.map(({ key, label, type, maxLength }) => (
					<label key={key} className="grid gap-1">
						<span>{label}</span>
						<input
							name={key}
							type={type}
							maxLength={maxLength}
							defaultValue={initial[key] ?? ""}
							placeholder={type === "tel" ? "+40123456789" : undefined}
						/>
					</label>
				))}
				{save.error && (
					<p role="alert" className="chat-text-danger">
						{save.error.message}
					</p>
				)}
				<div className="flex flex-wrap gap-1.5">
					<button
						type="submit"
						className="chat-contact-button"
						data-primary="true"
					>
						{save.isPending ? "Сохранение…" : "Сохранить"}
					</button>
					<button type="button" className="chat-contact-button" onClick={close}>
						Отмена
					</button>
				</div>
			</fieldset>
		</form>
	);
}
