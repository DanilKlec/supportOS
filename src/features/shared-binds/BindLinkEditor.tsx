import { useState } from "react";
import type { Bind } from "@/entities/bind";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useBindLinksStore } from "@/store/bind-links.store";
import type { BindLinks } from "./bind-links";
export function BindLinkEditor({
	base,
	locals,
	links,
	userId,
	onClose,
}: {
	base: Bind;
	locals: Bind[];
	links: BindLinks;
	userId: string;
	onClose: () => void;
}) {
	const [query, setQuery] = useState(""),
		[selected, setSelected] = useState(links[base.id] ?? ""),
		[error, setError] = useState("");
	const chosen = locals.find((b) => b.id === selected);
	const title = (b: Bind) => b.translations[0]?.title || b.slug;
	const save = (value: string | null) => {
		try {
			useBindLinksStore.getState().remember(userId, links);
			useBindLinksStore.getState().link(userId, base.id, value);
			onClose();
		} catch (e) {
			setError((e as Error).message);
		}
	};
	return (
		<BaseModal title="Связь версий бинда" onClose={onClose}>
			<p className="mb-4 text-sm text-muted">
				Свяжите общий ответ с вашим биндом. Тексты останутся без изменений.
				Связь сохраняется для вашего аккаунта в этом браузере.
			</p>
			<label className="block text-xs text-muted">
				Найти личный бинд
				<input
					autoFocus
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
					placeholder="Название или slug"
				/>
			</label>
			<div
				className="my-4 max-h-56 space-y-2 overflow-auto"
				role="group"
				aria-label="Личный бинд"
			>
				{locals
					.filter(
						(b) =>
							!b.archived &&
							(title(b) + " " + b.slug)
								.toLowerCase()
								.includes(query.toLowerCase()),
					)
					.map((b) => {
						const occupied = Object.entries(links).some(
							([id, v]) => id !== base.id && v === b.id,
						);
						return (
							<button
								key={b.id}
								type="button"
								disabled={occupied}
								aria-pressed={selected === b.id}
								onClick={() => setSelected(b.id)}
								className="block w-full rounded-xl border border-border px-3 py-2 text-left text-sm aria-pressed:bg-surface-elevated disabled:opacity-40"
							>
								{title(b)}
								<span className="block text-xs text-muted">
									{occupied ? "Уже связан с другим биндом" : b.slug}
								</span>
							</button>
						);
					})}
			</div>
			{chosen && (
				<div className="mb-4 grid gap-3 sm:grid-cols-2">
					{[
						{ label: "Общая", bind: base },
						{ label: "Моя", bind: chosen },
					].map((v) => (
						<div
							key={v.label}
							className="min-w-0 rounded-xl border border-border p-3"
						>
							<h3 className="mb-2 text-xs font-semibold">
								{v.label} · {title(v.bind)}
							</h3>
							<p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted">
								{v.bind.translations[0]?.content}
							</p>
						</div>
					))}
				</div>
			)}
			{error && (
				<p role="alert" className="mb-3 text-sm text-red-400">
					{error}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					disabled={!chosen}
					onClick={() => save(selected)}
					className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-40"
				>
					Связать версии
				</button>
				<button
					type="button"
					onClick={() => save(null)}
					className="rounded-xl border border-border px-4 py-2 text-sm"
				>
					Оставить раздельно
				</button>
			</div>
		</BaseModal>
	);
}
