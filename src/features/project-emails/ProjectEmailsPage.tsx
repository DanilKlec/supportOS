import { emailAddresses, normalizeProjectEmail, projectEmailText, mergeEmailImport } from "../../../shared/project-emails.js";
import {
	CheckCircle2,
	Copy,
	FileSpreadsheet,
	Loader2,
	Mail,
	Pencil,
	Plus,
	Search,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useSharedPublication } from "@/components/SharedPublication";
import type { ProjectEmailRecord, ProjectEmailAddress } from "@/entities/project-email";
import {
	type ProjectEmailImportMode,
	type ProjectEmailImportPreview,
	projectEmailImportService,
} from "@/services/project-email-import.service";
import { useToast } from "@/shared/hooks/useToast";
import { useViewState } from "@/shared/hooks/useViewState";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useBonusStore } from "@/store/bonus.store";
import { useProjectEmailStore } from "@/store/project-email.store";

interface EmailDraft { projectName: string; emails: ProjectEmailAddress[]; }

type WorkPanel = "closed" | "editor" | "import";

const EMPTY_DRAFT: EmailDraft = {projectName: '', emails: []};

function createId(prefix: string) {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;

	return `${prefix}-${random}`;
}

function slugify(value: string) {
	const slug = value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || `project-${Date.now()}`;
}

function normalizeEmail(value: string) {
	return value.trim().toLowerCase();
}

function isEmail(value: string) {
	if (!value.trim()) return true;

	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const buildProjectEmailBlock = projectEmailText;

function toRecord(draft: EmailDraft, existing?: ProjectEmailRecord) {
	const projectName = draft.projectName.trim();

	return {
		id: existing?.id ?? createId("project-email"),
		projectName,
		slug: existing?.slug ?? slugify(projectName),
        emails: draft.emails.map(row=>({...row,type:row.type.trim(),email:normalizeEmail(row.email),note:row.note?.trim()})),
        supportEmail:'',kycEmail:'',vipEmail:'',
		sourceHash: existing?.sourceHash,
		updatedAt: new Date().toISOString(),
	};
}

export function ProjectEmailsPage({
	management = false,
}: {
	management?: boolean;
} = {}) {
	const { showToast } = useToast();
	const records = useProjectEmailStore((state) => state.records);
	const upsertRecords = useProjectEmailStore((state) => state.upsertRecords);
	const replaceRecords = useProjectEmailStore((state) => state.replaceRecords);
	const removeRecord = useProjectEmailStore((state) => state.removeRecord);
	const publication = useSharedPublication(
		"emails",
		records,
		replaceRecords,
		management,
	);
	const canEdit = publication.canEdit;
	const workspaceProject = useBonusStore(
		(s) => s.projects.find((p) => p.id === s.activeProjectId)?.name ?? "",
	);
	const [projectFilter, setProjectFilter] = useViewState(
		`emails:${management}`,
		"project-filter",
		management ? "all" : "context",
	);
	const projectName =
		projectFilter === "context"
			? workspaceProject
			: projectFilter === "all"
				? ""
				: projectFilter;
	const [query, setQuery] = useViewState(`emails:${management}`, "query", "");
	const [draft, setDraft] = useState<EmailDraft>(EMPTY_DRAFT);
	const [editingId, setEditingId] = useState<string>();
	const [selectedId, setSelectedId] = useViewState<string | undefined>(
		`emails:${management}`,
		"selected",
		undefined,
	);
	const [deleteId, setDeleteId] = useState<string>();
	const [workPanel, setWorkPanel] = useState<WorkPanel>("closed");
	const [formError, setFormError] = useState("");
	const [sheetUrl, setSheetUrl] = useState("");
	const [mode, setMode] = useState<ProjectEmailImportMode>("upsert");
	const [preview, setPreview] = useState<ProjectEmailImportPreview>();
	const [importing, setImporting] = useState(false);
	const [committing, setCommitting] = useState(false);

	const filteredRecords = useMemo(() => {
		const value = query.trim().toLowerCase();

		return records
			.filter(
				(record) =>
					!projectName ||
					record.projectName.toLowerCase() === projectName.toLowerCase(),
			)
			.filter((record) =>
				[record.projectName,...emailAddresses(record).flatMap(row=>[row.type,row.email,row.note||""])]
					.join(" ")
					.toLowerCase()
					.includes(value),
			);
	}, [records, query, projectName]);

	const selectedRecord =
		filteredRecords.find((record) => record.id === selectedId) ??
		filteredRecords[0];
	const deleteTarget = records.find((record) => record.id === deleteId);

	const resetForm = () => {
		setDraft(EMPTY_DRAFT);
		setEditingId(undefined);
		setFormError("");
	};

	const closePanel = () => {
		resetForm();
		setWorkPanel("closed");
	};

	const openCreate = () => {
		if (!canEdit) return;
		resetForm();
		setWorkPanel("editor");
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!canEdit) return;
		setFormError("");

		const existing = editingId
			? records.find((record) => record.id === editingId)
			: undefined;
		const projectName = draft.projectName.trim();

		if (!projectName) {
			setFormError("Укажите название проекта");
			return;
		}

		for (const row of draft.emails) {
			if (!row.type.trim() || !row.email.trim() || !isEmail(row.email)) {
				setFormError("Проверьте формат почты");
				return;
			}
		}

		if (draft.emails.length===0) {
			setFormError("Укажите хотя бы одну почту");
			return;
		}

		const nextRecord = normalizeProjectEmail(toRecord(draft, existing));

		upsertRecords([nextRecord]);
		setSelectedId(nextRecord.id);
		showToast(
			editingId
				? "Изменения применены. Сохраните справочник для публикации."
				: "Проект добавлен в черновик справочника",
		);
		closePanel();
	};

	const editRecord = (record: ProjectEmailRecord) => {
		if (!canEdit) return;
		setSelectedId(record.id);
		setEditingId(record.id);
		setDraft({
			projectName: record.projectName,
			emails: emailAddresses(record).map(row=>({...row})),
		});
		setFormError("");
		setWorkPanel("editor");
	};

	const copyText = async (text: string, successMessage: string) => {
		if (!text.trim()) return;

		const copied = await copyToClipboard(text);
		showToast(copied ? successMessage : "Не удалось скопировать");
	};

	const loadPreview = async () => {
		if (!canEdit) return;
		setImporting(true);

		try {
			const nextPreview = await projectEmailImportService.preview(sheetUrl);

			setPreview(nextPreview);
			showToast("Предпросмотр готов");
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Не удалось загрузить данные",
			);
		} finally {
			setImporting(false);
		}
	};

	const commitPreview = () => {
		if (!canEdit) return;
		if (!preview || preview.records.length === 0) return;

		setCommitting(true);

		try {
			if (mode === "replace") {
				replaceRecords(preview.records);
			} else {
				upsertRecords(preview.records.map(row=>mergeEmailImport(records.find(old=>old.slug===row.slug),row)));
			}

			setSelectedId(preview.records[0]?.id);
			showToast(`Добавлено в черновик проектов: ${preview.records.length}. Сохраните для публикации.`);
			setPreview(undefined);
			setSheetUrl("");
			setWorkPanel("closed");
		} finally {
			setCommitting(false);
		}
	};

	const confirmDelete = () => {
		if (!canEdit) return;
		if (!deleteTarget) return;

		removeRecord(deleteTarget.id);
		if (selectedId === deleteTarget.id) {
			setSelectedId(undefined);
		}
		setDeleteId(undefined);
		showToast("Проект удалён из черновика справочника");
	};

	if (!publication.ready) return publication.banner;
	return (
		<div className="supportos-page-scroll min-h-0 flex-1 overflow-y-auto bg-background">
			{publication.banner}
			<label className="flex flex-wrap items-center gap-2 px-3 pt-3 text-sm">
				Проект
				<select
					className="ui-input border border-border bg-background"
					value={projectFilter}
					onChange={(e) => {
						setProjectFilter(e.target.value);
						setSelectedId(undefined);
					}}
				>
					<option value="context">
						Рабочий проект
						{workspaceProject ? `: ${workspaceProject}` : ": все проекты"}
					</option>
					<option value="all">Все проекты</option>
					{records.map((record) => (
						<option key={record.id} value={record.projectName}>
							{record.projectName}
						</option>
					))}
				</select>
				{query && (
					<button type="button" onClick={() => setQuery("")}>
						Сбросить поиск
					</button>
				)}
			</label>
			<div className="grid min-h-full w-full grid-rows-[auto_1fr] gap-4 py-4 sm:py-6">
				<header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
							<Mail size={14} />
							Справочник
						</div>
						<h1 className="mt-1 text-xl font-semibold sm:text-2xl">
							Почты проектов
						</h1>
					</div>

					<div className="ui-actions items-center flex flex-wrap  gap-2">
						<button
							type="button"
							style={!management ? { display: "none" } : undefined}
							disabled={!canEdit}
							onClick={openCreate}
							className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground transition hover:bg-accent/90"
						>
							<Plus size={16} />
							Добавить проект
						</button>
						<button
							type="button"
							style={!management ? { display: "none" } : undefined}
							disabled={!canEdit}
							onClick={() =>
								setWorkPanel((current) =>
									current === "import" ? "closed" : "import",
								)
							}
							className="ui-button ui-button--secondary inline-flex items-center justify-center gap-2 border border-border bg-surface font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
						>
							<Upload size={16} />
							Импорт
						</button>
					</div>
				</header>

				<div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)]">
					<aside className="flex min-h-[18rem] flex-col overflow-hidden rounded-xl border border-border bg-surface lg:min-h-0">
						<div className="border-b border-border p-3">
							<div className="relative">
								<Search
									size={16}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
								/>
								<input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									className="ui-input w-full border border-border bg-background pl-10 pr-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
									placeholder="Поиск проекта или почты…"
								/>
							</div>
							<div className="mt-2 text-xs text-muted">
								{filteredRecords.length} из {records.length} проектов
							</div>
						</div>

						<div className="supportos-scroll min-h-0 flex-1 overflow-auto">
							{filteredRecords.length > 0 ? (
								<div className="divide-y divide-border">
									{filteredRecords.map((record) => {
										const active = record.id === selectedRecord?.id;

										return (
											<button
												key={record.id}
												type="button"
												onClick={() => setSelectedId(record.id)}
												className={`flex w-full min-w-0 items-center justify-between gap-3 px-3 py-3 text-left transition ${
													active
														? "bg-accent/10 text-foreground"
														: "text-foreground hover:bg-surface-elevated"
												}`}
											>
												<span className="min-w-0">
													<span className="block truncate text-sm font-semibold">
														{record.projectName}
													</span>
													<span className="mt-0.5 block truncate text-xs text-muted">
														{emailAddresses(record)[0]?.email ||
															"Почта не указана"}
													</span>
												</span>
												<span className="shrink-0 rounded-md bg-background px-2 py-1 text-xs text-muted">
													{
														emailAddresses(record).length
													}
												</span>
											</button>
										);
									})}
								</div>
							) : (
								<EmptyState
									title={
										records.length ? "Ничего не найдено" : "Проектов пока нет"
									}
									description={
										records.length
											? "Попробуйте другое название или почту."
											: "Данные публикуются через общую базу команды."
									}
								/>
							)}
						</div>
					</aside>

					<main className="min-w-0 rounded-xl border border-border bg-surface">
						{canEdit && workPanel === "editor" && (
							<ProjectEmailEditor
								draft={draft}
								editing={Boolean(editingId)}
								error={formError}
								onCancel={closePanel}
								onChange={setDraft}
								onSubmit={submit}
							/>
						)}

						{canEdit && workPanel === "import" && (
							<ProjectEmailImportPanel
								committing={committing}
								importing={importing}
								mode={mode}
								preview={preview}
								sheetUrl={sheetUrl}
								onCancel={() => setWorkPanel("closed")}
								onCommit={commitPreview}
								onLoadPreview={loadPreview}
								onModeChange={setMode}
								onSheetUrlChange={setSheetUrl}
							/>
						)}

						{selectedRecord ? (
							<section>
								<div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
									<div className="min-w-0">
										<div className="text-xs font-semibold uppercase text-muted">
											Выбранный проект
										</div>
										<h2 className="mt-1 truncate text-xl font-semibold">
											{selectedRecord.projectName}
										</h2>
										<div className="mt-1 text-xs text-muted">
											Обновлено{" "}
											{new Date(selectedRecord.updatedAt).toLocaleDateString()}
										</div>
									</div>

									<div className="ui-actions items-center flex flex-wrap  gap-2">
										<button
											type="button"
											onClick={() =>
												void copyText(
													buildProjectEmailBlock(selectedRecord),
													"Почты проекта скопированы",
												)
											}
											className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground transition hover:bg-accent/90"
										>
											<Copy size={16} />
											Копировать всё
										</button>
										<button
											type="button"
											style={!management ? { display: "none" } : undefined}
											disabled={!canEdit}
											onClick={() => editRecord(selectedRecord)}
											className="ui-button ui-button--secondary ui-button--icon inline-flex items-center justify-center border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground"
											aria-label="Редактировать почты проекта"
										>
											<Pencil size={16} />
										</button>
										<button
											type="button"
											style={!management ? { display: "none" } : undefined}
											disabled={!canEdit}
											onClick={() => setDeleteId(selectedRecord.id)}
											className="ui-button ui-button--danger-quiet ui-button--icon inline-flex items-center justify-center border border-border text-muted transition hover:bg-surface-elevated hover:text-red-400"
											aria-label="Удалить почты проекта"
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>

								<div className="p-4">
									<div className="grid gap-2">
										{emailAddresses(selectedRecord).map(row=><EmailRow key={row.id} label={row.type} email={row.email} note={row.note} onCopy={email=>void copyText(email,'Почта скопирована')}/>)}
 {canEdit&&<button type="button" className="ui-button" onClick={()=>{editRecord(selectedRecord);setDraft({projectName:selectedRecord.projectName,emails:[...emailAddresses(selectedRecord),{id:createId('email'),type:'',email:''}]});}}>+ Добавить почту</button>}
									</div>

									<div className="mt-4 rounded-lg bg-background p-3 text-xs text-muted">
										<pre className="whitespace-pre-wrap break-all font-sans leading-5">
											{buildProjectEmailBlock(selectedRecord)}
										</pre>
									</div>
								</div>
							</section>
						) : (
							<EmptyState
								title="Справочник почт пуст"
								description="После публикации в общей базе здесь появятся почты проектов."
							/>
						)}
					</main>
				</div>
			</div>

			<DeleteConfirmDialog
				open={Boolean(deleteTarget)}
				title="Удалить почты проекта?"
				description={
					deleteTarget
						? `${deleteTarget.projectName} будет удалён из черновика справочника.`
						: ""
				}
				onCancel={() => setDeleteId(undefined)}
				onConfirm={confirmDelete}
			/>
		</div>
	);
}

function ProjectEmailEditor({
	draft,
	editing,
	error,
	onCancel,
	onChange,
	onSubmit,
}: {
	draft: EmailDraft;
	editing: boolean;
	error: string;
	onCancel: () => void;
	onChange: (draft: EmailDraft) => void;
	onSubmit: (event: FormEvent) => void;
}) {
	return (
		<form onSubmit={onSubmit} className="border-b border-border p-4">
			<div className="mb-4 flex items-center justify-between gap-3">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold">
						<Mail size={16} />
						{editing ? "Редактировать проект" : "Добавить проект"}
					</div>
					<p className="mt-1 text-xs text-muted">
						Добавьте используемые адреса. Тип можно указать вручную.
					</p>
				</div>
				<button
					type="button"
					onClick={onCancel}
					className="ui-button ui-button--secondary ui-button--icon inline-flex items-center justify-center border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground"
					aria-label="Закрыть редактор"
				>
					<X size={16} />
				</button>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<label className="ui-field md:col-span-2">
					<span className="text-sm font-medium">Проект</span>
					<input
						value={draft.projectName}
						onChange={(event) =>
							onChange({ ...draft, projectName: event.target.value })
						}
						className="ui-input w-full border border-border bg-background outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
						placeholder="Название проекта"
					/>
				</label>

{draft.emails.map((row,index)=><fieldset key={row.id} className="md:col-span-2 rounded-lg border border-border p-3 space-y-3"><legend>Почта {index+1}</legend><div className="grid gap-3 md:grid-cols-2"><label className="ui-field">Тип<input className="ui-input" required maxLength={100} list="email-types" value={row.type} onChange={e=>onChange({...draft,emails:draft.emails.map(v=>v.id===row.id?{...v,type:e.target.value}:v)})}/></label><EmailInput label="Почта" value={row.email} onChange={email=>onChange({...draft,emails:draft.emails.map(v=>v.id===row.id?{...v,email}:v)})}/><label className="ui-field md:col-span-2">Комментарий<input className="ui-input" maxLength={2000} value={row.note||''} onChange={e=>onChange({...draft,emails:draft.emails.map(v=>v.id===row.id?{...v,note:e.target.value}:v)})}/></label></div><button type="button" className="ui-button ui-button--danger-quiet" onClick={()=>onChange({...draft,emails:draft.emails.filter(v=>v.id!==row.id)})}>Удалить почту из черновика</button></fieldset>)}
 <datalist id="email-types">{['Support','KYC','VIP','Finance','Payments','Verification','Complaints','Responsible Gaming','Affiliate','Security','Other'].map(t=><option key={t} value={t}/>)}</datalist>
 <button type="button" className="ui-button" disabled={draft.emails.length>=100} onClick={()=>onChange({...draft,emails:[...draft.emails,{id:createId('email'),type:'',email:''}]})}>+ Добавить почту</button>
			</div>

			{error && (
				<div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
					{error}
				</div>
			)}

			<div className="ui-actions items-center mt-4 flex flex-wrap justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
					className="ui-button ui-button--secondary inline-flex items-center justify-center border border-border font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
				>
					Отмена
				</button>
				<button
					type="submit"
					className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground transition hover:bg-accent/90"
				>
					<Plus size={16} />
					{editing ? "Сохранить" : "Добавить"}
				</button>
			</div>
		</form>
	);
}

function ProjectEmailImportPanel({
	committing,
	importing,
	mode,
	preview,
	sheetUrl,
	onCancel,
	onCommit,
	onLoadPreview,
	onModeChange,
	onSheetUrlChange,
}: {
	committing: boolean;
	importing: boolean;
	mode: ProjectEmailImportMode;
	preview?: ProjectEmailImportPreview;
	sheetUrl: string;
	onCancel: () => void;
	onCommit: () => void;
	onLoadPreview: () => void;
	onModeChange: (mode: ProjectEmailImportMode) => void;
	onSheetUrlChange: (value: string) => void;
}) {
	return (
		<section className="border-b border-border p-4">
			<div className="mb-4 flex items-center justify-between gap-3">
				<div>
					<div className="flex items-center gap-2 text-sm font-semibold">
						<FileSpreadsheet size={16} />
						Импорт из Google-таблицы
					</div>
					<p className="mt-1 text-xs text-muted">
						Столбец проекта и столбцы с типами почт.
					</p>
				</div>
				<button
					type="button"
					onClick={onCancel}
					className="ui-button ui-button--secondary ui-button--icon inline-flex items-center justify-center border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground"
					aria-label="Закрыть импорт"
				>
					<X size={16} />
				</button>
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
				<input
					value={sheetUrl}
					onChange={(event) => onSheetUrlChange(event.target.value)}
					className="ui-input border border-border bg-background outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
					placeholder="Ссылка на доступную Google-таблицу"
				/>

				<select
					value={mode}
					onChange={(event) =>
						onModeChange(event.target.value as ProjectEmailImportMode)
					}
					className="ui-input border border-border bg-background outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
				>
					<option value="upsert">Добавить и обновить</option>
					<option value="replace">Заменить справочник</option>
				</select>

				<button
					type="button"
					onClick={onLoadPreview}
					disabled={importing || !sheetUrl.trim()}
					className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{importing ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<FileSpreadsheet size={16} />
					)}
					Предпросмотр
				</button>
			</div>

			{preview && (
				<div className="mt-4 rounded-lg bg-background p-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="inline-flex items-center gap-2 text-sm">
							<CheckCircle2 size={16} className="text-accent" />
							<span className="font-semibold">{preview.records.length}</span>
							проектов найдено
						</div>

						<button
							type="button"
							onClick={onCommit}
							disabled={
								committing ||
								preview.records.length === 0 ||
								preview.errors.length > 0
							}
							className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{committing && <Loader2 size={15} className="animate-spin" />}
							Применить импорт
						</button>
					</div>

					{preview.errors.length > 0 && (
						<div className="mt-3 space-y-1 text-sm text-red-300">
							{preview.errors.map((error) => (
								<div key={error}>{error}</div>
							))}
						</div>
					)}

					{preview.warnings.length > 0 && (
						<div className="supportos-scroll mt-3 max-h-24 overflow-auto text-xs text-amber-200">
							{preview.warnings.slice(0, 10).map((warning) => (
								<div key={warning}>{warning}</div>
							))}
						</div>
					)}
				</div>
			)}
		</section>
	);
}

function EmailInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="ui-field ">
			<span className="text-sm font-medium">{label}</span>
			<input
				type="email"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="ui-input w-full border border-border bg-background outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
				placeholder={`${label.toLowerCase()}@project.com`}
			/>
		</label>
	);
}

function EmailRow({
	label,
	email,
 note,
	onCopy,
}: {
	label: string;
	email: string;
 note?: string;
	onCopy: (email: string) => void;
}) {
	return (
		<div className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-background px-3 py-2">
			<div className="min-w-0">
				<div className="text-xs font-semibold uppercase text-muted">
					{label}
				</div>
				<div className="mt-0.5 break-all text-sm">{email || "Не указано"}</div>{note&&<p className="text-xs text-muted break-words">{note}</p>}
			</div>

			<button
				type="button"
				onClick={() => onCopy(email)}
				disabled={!email}
				className="ui-button ui-button--secondary ui-button--icon inline-flex items-center justify-center border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				aria-label={`Скопировать ${label}`}
			>
				<Copy size={15} />
			</button>
		</div>
	);
}

function EmptyState({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="flex h-full min-h-48 flex-col items-center justify-center px-4 py-12 text-center">
			<div className="text-sm font-semibold">{title}</div>
			<div className="mt-1 max-w-sm text-sm text-muted">{description}</div>
		</div>
	);
}

function DeleteConfirmDialog({
	open,
	title,
	description,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	title: string;
	description: string;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	useEffect(() => {
		if (!open) return;

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") onCancel();
		};

		document.addEventListener("keydown", closeOnEscape);

		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [onCancel, open]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-email-delete-title"
			onMouseDown={(event) => {
				if (event.currentTarget === event.target) onCancel();
			}}
		>
			<div className="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-2xl">
				<h2 id="project-email-delete-title" className="text-base font-semibold">
					{title}
				</h2>
				<p className="mt-2 text-sm text-muted">{description}</p>
				<div className="ui-actions items-center mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="ui-button ui-button--secondary inline-flex items-center border border-border font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
					>
						Отмена
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="ui-button ui-button--danger inline-flex items-center bg-red-500 font-semibold text-white transition hover:bg-red-600"
					>
						Удалить
					</button>
				</div>
			</div>
		</div>
	);
}
