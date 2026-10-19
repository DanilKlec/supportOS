import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, FileText, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { getBindTitle, searchBinds } from "@/shared/lib/bind-search";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";

export const Route = createFileRoute("/archive")({
	component: ArchivePage,
});

export function ArchivePage() {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const [query, setQuery] = useState("");
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [languages, setLanguages] = useState<Record<string, string>>({});
	const actor = useAuthStore((state) => state.session?.user.id);
	const binds = useKnowledgeStore((state) => state.binds);
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const language = useKnowledgeStore((state) => state.language);
	const archivedBinds = useMemo(
		() =>
			binds
				.filter(
					(bind) => bind.archived && bind.ownerId === actor && Boolean(actor),
				)
				.sort(
					(first, second) =>
						new Date(second.updatedAt).getTime() -
						new Date(first.updatedAt).getTime(),
				),
		[binds, actor],
	);
	const visibleBinds = query.trim()
		? searchBinds(archivedBinds, query, {
				categories,
				folders,
				language,
			})
		: archivedBinds;

	const restoreBind = async (id: string) => {
		if (pendingRestoreId) return;
		setPendingRestoreId(id);
		setError("");
		try {
			await knowledgeService.setPersonalBindArchived(id, false);
			showToast("Бинд восстановлен");
			await navigate({ to: "/" });
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "Не удалось восстановить бинд",
			);
		} finally {
			setPendingRestoreId(null);
		}
	};

	const deleteForever = (id: string) => {
		const deleted = knowledgeService.deleteManyBinds([id]);

		showToast(`Удалено биндов: ${deleted.length}`);
		setPendingDeleteId(null);
	};
	const pendingDeleteBind = pendingDeleteId
		? binds.find((bind) => bind.id === pendingDeleteId)
		: undefined;

	useEffect(() => {
		if (!pendingDeleteId) return undefined;

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setPendingDeleteId(null);
			}
		};
		const previousOverflow = document.body.style.overflow;

		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", closeOnEscape);

		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [pendingDeleteId]);

	return (
		<div className="h-full overflow-auto bg-background">
			<div className="mx-auto w-full max-w-5xl p-6">
				<header className="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted">
							<Archive size={14} />
							Архив
						</div>
						<h1 className="text-2xl font-semibold">Личный архив</h1>
						<p className="mt-2 max-w-2xl text-sm text-muted">
							Здесь ваши архивные бинды. Восстановите нужный — он вернётся в
							свою папку.
						</p>
					</div>

					<div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
						<span className="text-2xl font-semibold">
							{archivedBinds.length}
						</span>
						<span className="ml-2 text-muted">в архиве</span>
					</div>
				</header>

				<div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
					<Search size={16} className="text-muted" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Поиск в архиве"
						className="ui-input flex-1 bg-transparent outline-none"
					/>
				</div>

				{error && (
					<p
						role="alert"
						className="mb-4 rounded-lg border border-red-500/30 p-3 text-sm text-red-400"
					>
						{error}
					</p>
				)}
				{visibleBinds.length === 0 ? (
					<div className="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted">
						{query.trim()
							? "По вашему запросу ничего не найдено"
							: "В личном архиве пока ничего нет"}
					</div>
				) : (
					<div className="space-y-3">
						{visibleBinds.map((bind) => {
							const translation =
								bind.translations.find(
									(item) => item.language === (languages[bind.id] ?? language),
								) ?? bind.translations[0];
							return (
								<div
									key={bind.id}
									className="rounded-lg border border-border bg-surface p-4"
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<FileText size={16} className="shrink-0 text-muted" />
												<h2 className="truncate text-base font-semibold">
													{getBindTitle(bind, language)}
												</h2>
											</div>
											<div className="mt-1 truncate text-xs text-muted">
												{[
													categories.find((item) => item.id === bind.categoryId)
														?.name,
													folders.find((item) => item.id === bind.folderId)
														?.name,
												]
													.filter(Boolean)
													.join(" / ") || "Личные материалы"}
												{bind.tags.length > 0
													? ` - ${bind.tags.join(", ")}`
													: ""}
											</div>
											<details className="mt-3 text-sm">
												<summary className="w-fit cursor-pointer text-muted hover:text-foreground">
													Посмотреть текст
												</summary>
												<div
													className="mt-3 flex flex-wrap gap-1"
													aria-label={`Языки: ${getBindTitle(bind, language)}`}
												>
													{bind.translations.map((item) => (
														<button
															key={item.language}
															type="button"
															aria-pressed={
																translation?.language === item.language
															}
															className="rounded-md border border-border px-2 py-1 text-xs text-muted aria-pressed:bg-surface-elevated aria-pressed:text-foreground"
															onClick={() =>
																setLanguages((state) => ({
																	...state,
																	[bind.id]: item.language,
																}))
															}
														>
															{item.language === "el"
																? "GR"
																: item.language.toUpperCase()}
														</button>
													))}
												</div>
												<div className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 leading-relaxed">
													{translation?.content || "Нет содержимого"}
												</div>
											</details>
										</div>

										<div className="ui-actions items-center flex shrink-0 gap-2">
											<button
												type="button"
												onClick={() => restoreBind(bind.id)}
												disabled={pendingRestoreId !== null}
												className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border hover:bg-surface-elevated"
											>
												<RotateCcw size={15} />
												{pendingRestoreId === bind.id
													? "Восстанавливаем…"
													: "Восстановить"}
											</button>
											<button
												type="button"
												onClick={() => setPendingDeleteId(bind.id)}
												disabled={pendingRestoreId !== null}
												className="ui-button ui-button--danger border border-red-500/30 text-red-300 hover:bg-red-500/10"
												title="Удалить навсегда"
											>
												<Trash2 size={15} />
											</button>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{pendingDeleteId && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
					<div
						role="alertdialog"
						aria-modal="true"
						aria-label="Удалить архивный материал"
						className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl"
					>
						<div className="text-base font-semibold">Удалить навсегда?</div>
						<p className="mt-2 text-sm leading-6 text-muted">
							Этот архивный материал будет удалён без возможности
							восстановления.
						</p>
						{pendingDeleteBind && (
							<div className="mt-3 rounded-xl bg-background px-3 py-2 text-sm">
								{getBindTitle(pendingDeleteBind, language)}
							</div>
						)}
						<div className="ui-actions items-center mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setPendingDeleteId(null)}
								className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								Отмена
							</button>
							<button
								type="button"
								onClick={() => deleteForever(pendingDeleteId)}
								className="min-h-10 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400"
							>
								Удалить
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
