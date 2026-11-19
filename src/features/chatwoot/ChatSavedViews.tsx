import { Bookmark, Check, Plus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useChatPopover } from "./useChatPopover";

type SavedView<Value> = { id: string; name: string; filters: Value };
const viewLimit = 16;

export function ChatSavedViews<Value>({
	storageKey,
	value,
	decode,
	canSave,
	onApply,
}: {
	storageKey: string;
	value: Value;
	decode: (value: unknown) => Value | null;
	canSave: boolean;
	onApply: (value: Value) => void;
}) {
	const read = (): SavedView<Value>[] => {
		try {
			const entries: unknown = JSON.parse(
				localStorage.getItem(storageKey) ?? "[]",
			);
			if (!Array.isArray(entries)) return [];
			return entries.slice(0, viewLimit).flatMap((entry) => {
				if (
					typeof entry?.id !== "string" ||
					typeof entry.name !== "string" ||
					!entry.name.trim() ||
					entry.name.length > 48
				)
					return [];
				const filters = decode(entry.filters);
				return filters ? [{ id: entry.id, name: entry.name, filters }] : [];
			});
		} catch {
			return [];
		}
	};
	const [items, setItems] = useState(read);
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const id = useId();
	const close = () => {
		setOpen(false);
		setEditing(false);
		setError("");
	};
	const container = useChatPopover<HTMLDivElement>(open, close);
	useEffect(() => {
		if (editing) document.getElementById(`${id}-name`)?.focus();
	}, [editing, id]);
	const store = (next: SavedView<Value>[]) => {
		try {
			localStorage.setItem(storageKey, JSON.stringify(next));
			setItems(next);
			setError("");
			return true;
		} catch {
			setError("Браузер не смог сохранить список");
			return false;
		}
	};
	const save = () => {
		const title = name.trim();
		const current = read();
		if (!title) return;
		if (current.length >= viewLimit) {
			setError("Удалите один из сохранённых списков, чтобы добавить новый");
			return;
		}
		if (
			current.some((view) => view.name.toLowerCase() === title.toLowerCase())
		) {
			setError("Список с таким названием уже есть");
			return;
		}
		if (
			store([
				...current,
				{ id: crypto.randomUUID(), name: title, filters: value },
			])
		) {
			setEditing(false);
			setName("");
		}
	};
	return (
		<div ref={container} className="chat-saved-views">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				className="chat-saved-trigger"
				onClick={() => {
					if (open) close();
					else {
						setItems(read());
						setOpen(true);
					}
				}}
			>
				<Bookmark size={13} aria-hidden="true" /> Сохранённые списки
				{items.length > 0 && (
					<span className="chat-scope-count">{items.length}</span>
				)}
			</button>
			{open && (
				<section
					id={id}
					aria-label="Сохранённые списки"
					className="chat-saved-menu"
				>
					{items.length > 0 ? (
						<ul className="chat-saved-items supportos-scroll">
							{items.map((view) => (
								<li key={view.id}>
									<button
										type="button"
										title={view.name}
										className="chat-saved-apply"
										onClick={() => {
											onApply(view.filters);
											close();
											container.current?.querySelector("button")?.focus();
										}}
									>
										{view.name}
									</button>
									<button
										type="button"
										className="chat-filter-icon"
										aria-label={`Удалить список «${view.name}»`}
										onClick={() =>
											store(read().filter((item) => item.id !== view.id))
										}
									>
										<X size={13} />
									</button>
								</li>
							))}
						</ul>
					) : (
						<p className="px-2 py-1 text-xs text-muted">
							Пока нет сохранённых списков
						</p>
					)}
					{editing ? (
						<form
							className="chat-saved-form"
							onSubmit={(event) => {
								event.preventDefault();
								save();
							}}
						>
							<input
								id={`${id}-name`}
								type="text"
								aria-label="Название списка"
								placeholder="Название списка"
								required
								maxLength={48}
								value={name}
								onChange={(event) => {
									setName(event.target.value);
									setError("");
								}}
							/>
							<button
								type="submit"
								aria-label="Сохранить список"
								className="chat-filter-icon"
								disabled={!name.trim()}
							>
								<Check size={16} />
							</button>
						</form>
					) : (
						<button
							type="button"
							className="chat-saved-create"
							disabled={!canSave}
							onClick={() => {
								setName("");
								setEditing(true);
							}}
						>
							<Plus size={14} aria-hidden="true" /> Сохранить текущие фильтры
						</button>
					)}
					{error && (
						<p role="alert" className="px-2 py-1 text-xs chat-text-danger">
							{error}
						</p>
					)}
				</section>
			)}
		</div>
	);
}

export function readViewFields<const Key extends string>(
	input: unknown,
	keys: readonly Key[],
): Record<Key, string> | null {
	if (!input || typeof input !== "object") return null;
	const record = input as Record<string, unknown>;
	if (
		keys.some(
			(key) => typeof record[key] !== "string" || record[key].length > 120,
		)
	)
		return null;
	return Object.fromEntries(keys.map((key) => [key, record[key]])) as Record<
		Key,
		string
	>;
}
