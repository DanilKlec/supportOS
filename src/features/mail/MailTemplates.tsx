import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	ChevronRight,
	FileText,
	Pencil,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
	type MailTemplate,
	type MailTemplateInput,
	type MailTemplateScope,
	mailService,
} from "@/services/mail.service";

const emptyTemplate: MailTemplateInput = { title: "", subject: "", body: "" };

export function MailTemplates({
	box,
	userId,
	onInsert,
}: {
	box: string;
	userId?: string;
	onInsert: (template: MailTemplate) => string | undefined;
}) {
	const [scope, setScope] = useState<MailTemplateScope>("shared");
	return (
		<section className="mail-templates" aria-label="Шаблоны писем">
			<nav className="mail-template-scopes" aria-label="Разделы шаблонов">
				<button
					type="button"
					className="mail-category"
					aria-pressed={scope === "shared"}
					onClick={() => setScope("shared")}
				>
					Общие
				</button>
				<button
					type="button"
					className="mail-category"
					aria-pressed={scope === "personal"}
					onClick={() => setScope("personal")}
				>
					Личные
				</button>
			</nav>
			<TemplateCollection
				key={scope}
				box={box}
				scope={scope}
				scopeId={scope === "personal" ? userId : box}
				onInsert={onInsert}
			/>
		</section>
	);
}

function TemplateCollection({
	box,
	scope,
	scopeId,
	onInsert,
}: {
	box: string;
	scope: MailTemplateScope;
	scopeId?: string;
	onInsert: (template: MailTemplate) => string | undefined;
}) {
	const client = useQueryClient();
	const [search, setSearch] = useState("");
	const query = useDeferredValue(search.trim());
	const [selected, setSelected] = useState("");
	const [editor, setEditor] = useState<MailTemplateInput>();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [insertionError, setInsertionError] = useState("");
	const listKey = ["mail", "templates", scope, scopeId];
	const detailKey = ["mail", "template", scope, scopeId];
	const list = useInfiniteQuery({
		queryKey: [...listKey, query],
		queryFn: ({ pageParam, signal }) =>
			mailService.templates(box, scope, query, pageParam, signal),
		initialPageParam: 0,
		getNextPageParam: ({ next }) => next ?? undefined,
		staleTime: 20_000,
	});
	const detail = useQuery({
		queryKey: [...detailKey, selected],
		queryFn: ({ signal }) => mailService.template(box, scope, selected, signal),
		enabled: Boolean(selected),
		staleTime: 20_000,
	});
	const save = useMutation({
		mutationFn: (draft: MailTemplateInput) =>
			mailService.saveTemplate(box, scope, draft),
		onSuccess: (saved) => {
			client.setQueryData([...detailKey, saved.id], saved);
			setSearch("");
			setSelected(saved.id);
			setEditor(undefined);
			void client.invalidateQueries({ queryKey: listKey });
		},
	});
	const remove = useMutation({
		mutationFn: (template: MailTemplate) =>
			mailService.deleteTemplate(box, scope, template),
		onSuccess: (_, removed) => {
			setSelected("");
			setConfirmDelete(false);
			client.removeQueries({ queryKey: [...detailKey, removed.id] });
			void client.invalidateQueries({ queryKey: listKey });
		},
	});
	const select = (id: string) => {
		setSelected(id);
		setConfirmDelete(false);
		setInsertionError("");
		remove.reset();
	};
	const openEditor = (template?: MailTemplate) => {
		save.reset();
		setEditor(template ?? emptyTemplate);
	};
	const error = remove.error?.message || insertionError;

	return (
		<>
			{editor ? (
				<form
					className="mail-template-form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!save.isPending) save.mutate(editor);
					}}
				>
					<h3>{editor.id ? "Редактировать шаблон" : "Новый шаблон"}</h3>
					<label className="mail-field">
						Название
						<input
							required
							maxLength={120}
							value={editor.title}
							onChange={(event) =>
								setEditor({ ...editor, title: event.target.value })
							}
						/>
					</label>
					<label className="mail-field">
						Тема письма (необязательно)
						<input
							maxLength={500}
							value={editor.subject}
							onChange={(event) =>
								setEditor({ ...editor, subject: event.target.value })
							}
						/>
					</label>
					<label className="mail-field">
						Текст шаблона
						<textarea
							required
							maxLength={200000}
							value={editor.body}
							onChange={(event) =>
								setEditor({ ...editor, body: event.target.value })
							}
						/>
					</label>
					{save.error && (
						<p className="mail-error" role="alert">
							{save.error.message}
						</p>
					)}
					<div className="mail-template-actions">
						<button
							type="button"
							className="mail-button"
							disabled={save.isPending}
							onClick={() => {
								setEditor(undefined);
								if (selected) void detail.refetch();
							}}
						>
							Отмена
						</button>
						<button
							type="submit"
							className="mail-button"
							data-primary="true"
							disabled={
								save.isPending || !editor.title.trim() || !editor.body.trim()
							}
						>
							{save.isPending ? "Сохраняем…" : "Сохранить шаблон"}
						</button>
					</div>
				</form>
			) : (
				<>
					<div className="mail-template-toolbar">
						<label className="mail-search">
							<Search size={16} aria-hidden="true" />
							<input
								type="search"
								maxLength={120}
								aria-label="Найти шаблон"
								placeholder="Найти шаблон"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
							/>
						</label>
						<button
							type="button"
							className="mail-button"
							onClick={() => openEditor()}
						>
							<Plus size={15} aria-hidden="true" /> Новый шаблон
						</button>
					</div>
					<div className="mail-template-grid">
						<section
							className="mail-template-list supportos-scroll"
							aria-label="Список шаблонов"
						>
							{list.isPending ? (
								<p className="mail-muted">Загружаем шаблоны…</p>
							) : list.isError ? (
								<p className="mail-error" role="alert">
									{list.error.message}
								</p>
							) : !list.data.pages[0]?.templates.length ? (
								<p className="mail-muted">
									{query
										? "Шаблоны не найдены"
										: scope === "personal"
											? "У вас пока нет личных шаблонов"
											: "У этого ящика пока нет шаблонов"}
								</p>
							) : (
								<ul>
									{list.data.pages
										.flatMap(({ templates }) => templates)
										.map(({ id, title, subject }) => (
											<li key={id}>
												<button
													type="button"
													className="mail-template-row"
													aria-pressed={selected === id}
													disabled={remove.isPending}
													onClick={() => select(id)}
												>
													<FileText size={16} aria-hidden="true" />
													<span>
														<strong>{title}</strong>
														{subject && <small>{subject}</small>}
													</span>
													<ChevronRight size={14} aria-hidden="true" />
												</button>
											</li>
										))}
								</ul>
							)}
							{list.hasNextPage && (
								<button
									type="button"
									className="mail-button"
									disabled={list.isFetchingNextPage}
									onClick={() => void list.fetchNextPage()}
								>
									Показать ещё
								</button>
							)}
						</section>
						{selected ? (
							<div className="mail-template-preview">
								{detail.isPending ? (
									<p className="mail-muted">Загружаем шаблон…</p>
								) : detail.isError ? (
									<p className="mail-error" role="alert">
										{detail.error.message}
									</p>
								) : (
									<>
										<h3>{detail.data.title}</h3>
										{detail.data.subject && (
											<p className="mail-muted">
												Тема письма <strong>{detail.data.subject}</strong>
											</p>
										)}
										<p className="mail-template-text supportos-scroll">
											{detail.data.body}
										</p>
										{error && (
											<p className="mail-error" role="alert">
												{error}
											</p>
										)}
										{confirmDelete ? (
											<div className="mail-notice">
												<p>
													{scope === "personal"
														? "Удалить личный шаблон?"
														: "Удалить шаблон для всех сотрудников этого ящика?"}
												</p>
												<div className="mail-template-actions">
													<button
														type="button"
														className="mail-button"
														disabled={remove.isPending}
														onClick={() => {
															setConfirmDelete(false);
															remove.reset();
															void detail.refetch();
														}}
													>
														Отмена
													</button>
													<button
														type="button"
														className="mail-button mail-delete"
														disabled={remove.isPending}
														onClick={() => remove.mutate(detail.data)}
													>
														Удалить
													</button>
												</div>
											</div>
										) : (
											<div className="mail-template-actions">
												<button
													type="button"
													className="mail-icon"
													aria-label="Редактировать шаблон"
													title="Редактировать"
													onClick={() => openEditor(detail.data)}
												>
													<Pencil size={15} />
												</button>
												<button
													type="button"
													className="mail-icon mail-delete"
													aria-label="Удалить шаблон"
													title="Удалить"
													onClick={() => setConfirmDelete(true)}
												>
													<Trash2 size={16} />
												</button>
												<button
													type="button"
													className="mail-button"
													data-primary="true"
													onClick={() =>
														setInsertionError(onInsert(detail.data) ?? "")
													}
												>
													Вставить в письмо
												</button>
											</div>
										)}
									</>
								)}
							</div>
						) : (
							<p className="mail-muted mail-template-unselected">
								Выберите шаблон для предпросмотра.
							</p>
						)}
					</div>
				</>
			)}
		</>
	);
}
