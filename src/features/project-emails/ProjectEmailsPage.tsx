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

import type { ProjectEmailRecord } from "@/entities/project-email";
import {
	type ProjectEmailImportMode,
	type ProjectEmailImportPreview,
	projectEmailImportService,
} from "@/services/project-email-import.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useProjectEmailStore } from "@/store/project-email.store";

interface EmailDraft {
	projectName: string;
	supportEmail: string;
	kycEmail: string;
	vipEmail: string;
}

type WorkPanel = "closed" | "editor" | "import";

const EMPTY_DRAFT: EmailDraft = {
	projectName: "",
	supportEmail: "",
	kycEmail: "",
	vipEmail: "",
};

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

function buildProjectEmailBlock(record: ProjectEmailRecord) {
	return [
		record.projectName,
		record.supportEmail ? `Support: ${record.supportEmail}` : "",
		record.kycEmail ? `KYC: ${record.kycEmail}` : "",
		record.vipEmail ? `VIP: ${record.vipEmail}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

function toRecord(draft: EmailDraft, existing?: ProjectEmailRecord) {
	const projectName = draft.projectName.trim();

	return {
		id: existing?.id ?? createId("project-email"),
		projectName,
		slug: existing?.slug ?? slugify(projectName),
		supportEmail: normalizeEmail(draft.supportEmail),
		kycEmail: normalizeEmail(draft.kycEmail),
		vipEmail: normalizeEmail(draft.vipEmail),
		sourceHash: existing?.sourceHash,
		updatedAt: new Date().toISOString(),
	};
}

export function ProjectEmailsPage() {
	const { showToast } = useToast();
	const records = useProjectEmailStore((state) => state.records);
	const upsertRecords = useProjectEmailStore((state) => state.upsertRecords);
	const replaceRecords = useProjectEmailStore((state) => state.replaceRecords);
	const removeRecord = useProjectEmailStore((state) => state.removeRecord);
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState<EmailDraft>(EMPTY_DRAFT);
	const [editingId, setEditingId] = useState<string>();
	const [selectedId, setSelectedId] = useState<string>();
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

		if (!value) return records;

		return records.filter((record) =>
			[
				record.projectName,
				record.supportEmail,
				record.kycEmail,
				record.vipEmail,
			]
				.join(" ")
				.toLowerCase()
				.includes(value),
		);
	}, [records, query]);

	const selectedRecord =
		filteredRecords.find((record) => record.id === selectedId) ??
		records.find((record) => record.id === selectedId) ??
		filteredRecords[0] ??
		records[0];
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
		resetForm();
		setWorkPanel("editor");
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setFormError("");

		const existing = editingId
			? records.find((record) => record.id === editingId)
			: undefined;
		const projectName = draft.projectName.trim();

		if (!projectName) {
			setFormError("Project name is required");
			return;
		}

		for (const email of [draft.supportEmail, draft.kycEmail, draft.vipEmail]) {
			if (!isEmail(email)) {
				setFormError("Email format is invalid");
				return;
			}
		}

		if (
			!draft.supportEmail.trim() &&
			!draft.kycEmail.trim() &&
			!draft.vipEmail.trim()
		) {
			setFormError("Add at least one email");
			return;
		}

		const nextRecord = toRecord(draft, existing);

		upsertRecords([nextRecord]);
		setSelectedId(nextRecord.id);
		showToast(editingId ? "Project emails saved" : "Project emails added");
		closePanel();
	};

	const editRecord = (record: ProjectEmailRecord) => {
		setSelectedId(record.id);
		setEditingId(record.id);
		setDraft({
			projectName: record.projectName,
			supportEmail: record.supportEmail,
			kycEmail: record.kycEmail,
			vipEmail: record.vipEmail,
		});
		setFormError("");
		setWorkPanel("editor");
	};

	const copyText = async (text: string, successMessage: string) => {
		if (!text.trim()) return;

		const copied = await copyToClipboard(text);
		showToast(copied ? successMessage : "Copy failed");
	};

	const loadPreview = async () => {
		setImporting(true);

		try {
			const nextPreview = await projectEmailImportService.preview(sheetUrl);

			setPreview(nextPreview);
			showToast("Preview loaded");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Import failed");
		} finally {
			setImporting(false);
		}
	};

	const commitPreview = () => {
		if (!preview || preview.records.length === 0) return;

		setCommitting(true);

		try {
			if (mode === "replace") {
				replaceRecords(preview.records);
			} else {
				upsertRecords(preview.records);
			}

			setSelectedId(preview.records[0]?.id);
			showToast(`Imported and saved ${preview.records.length} projects`);
			setPreview(undefined);
			setSheetUrl("");
			setWorkPanel("closed");
		} finally {
			setCommitting(false);
		}
	};

	const confirmDelete = () => {
		if (!deleteTarget) return;

		removeRecord(deleteTarget.id);
		if (selectedId === deleteTarget.id) {
			setSelectedId(undefined);
		}
		setDeleteId(undefined);
		showToast("Project emails deleted");
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<div className="mx-auto grid h-full w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-4 p-4 sm:p-6">
				<header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
							<Mail size={14} />
							Quick directory
						</div>
						<h1 className="mt-1 text-xl font-semibold sm:text-2xl">
							Project Emails
						</h1>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={openCreate}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90"
						>
							<Plus size={16} />
							Add project
						</button>
						<button
							type="button"
							onClick={() =>
								setWorkPanel((current) =>
									current === "import" ? "closed" : "import",
								)
							}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
						>
							<Upload size={16} />
							Import
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
									className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
									placeholder="Search project or email..."
								/>
							</div>
							<div className="mt-2 text-xs text-muted">
								{filteredRecords.length} of {records.length} projects
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
														{record.supportEmail ||
															record.kycEmail ||
															record.vipEmail ||
															"No email"}
													</span>
												</span>
												<span className="shrink-0 rounded-md bg-background px-2 py-1 text-xs text-muted">
													{
														[
															record.supportEmail,
															record.kycEmail,
															record.vipEmail,
														].filter(Boolean).length
													}
												</span>
											</button>
										);
									})}
								</div>
							) : (
								<EmptyState
									title={records.length ? "Nothing found" : "No projects yet"}
									description={
										records.length
											? "Try another project name or email."
											: "Add a project or import a Google Sheet."
									}
								/>
							)}
						</div>
					</aside>

					<main className="supportos-scroll min-h-0 overflow-auto rounded-xl border border-border bg-surface">
						{workPanel === "editor" && (
							<ProjectEmailEditor
								draft={draft}
								editing={Boolean(editingId)}
								error={formError}
								onCancel={closePanel}
								onChange={setDraft}
								onSubmit={submit}
							/>
						)}

						{workPanel === "import" && (
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
											Selected project
										</div>
										<h2 className="mt-1 truncate text-xl font-semibold">
											{selectedRecord.projectName}
										</h2>
										<div className="mt-1 text-xs text-muted">
											Updated{" "}
											{new Date(selectedRecord.updatedAt).toLocaleDateString()}
										</div>
									</div>

									<div className="flex flex-wrap items-center gap-2">
										<button
											type="button"
											onClick={() =>
												void copyText(
													buildProjectEmailBlock(selectedRecord),
													"Project emails copied",
												)
											}
											className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90"
										>
											<Copy size={16} />
											Copy all
										</button>
										<button
											type="button"
											onClick={() => editRecord(selectedRecord)}
											className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground"
											aria-label="Edit project emails"
										>
											<Pencil size={16} />
										</button>
										<button
											type="button"
											onClick={() => setDeleteId(selectedRecord.id)}
											className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-elevated hover:text-red-400"
											aria-label="Delete project emails"
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>

								<div className="p-4">
									<div className="grid gap-2">
										<EmailRow
											label="Support"
											email={selectedRecord.supportEmail}
											onCopy={(email) => void copyText(email, "Support copied")}
										/>
										<EmailRow
											label="KYC"
											email={selectedRecord.kycEmail}
											onCopy={(email) => void copyText(email, "KYC copied")}
										/>
										<EmailRow
											label="VIP"
											email={selectedRecord.vipEmail}
											onCopy={(email) => void copyText(email, "VIP copied")}
										/>
									</div>

									<div className="mt-4 rounded-lg bg-background p-3 text-xs text-muted">
										<pre className="whitespace-pre-wrap font-sans leading-5">
											{buildProjectEmailBlock(selectedRecord)}
										</pre>
									</div>
								</div>
							</section>
						) : (
							<EmptyState
								title="Project email directory is empty"
								description="Add a project manually or import a Google Sheet to start copying ready contact blocks."
							/>
						)}
					</main>
				</div>
			</div>

			<DeleteConfirmDialog
				open={Boolean(deleteTarget)}
				title="Delete project emails?"
				description={
					deleteTarget
						? `${deleteTarget.projectName} will be removed from this directory.`
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
						{editing ? "Edit project" : "Add project"}
					</div>
					<p className="mt-1 text-xs text-muted">
						Fill only the emails that are used by this project.
					</p>
				</div>
				<button
					type="button"
					onClick={onCancel}
					className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground"
					aria-label="Close editor"
				>
					<X size={16} />
				</button>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<label className="block space-y-1.5 md:col-span-2">
					<span className="text-sm font-medium">Project</span>
					<input
						value={draft.projectName}
						onChange={(event) =>
							onChange({ ...draft, projectName: event.target.value })
						}
						className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
						placeholder="Project name"
					/>
				</label>

				<EmailInput
					label="Support"
					value={draft.supportEmail}
					onChange={(supportEmail) => onChange({ ...draft, supportEmail })}
				/>
				<EmailInput
					label="KYC"
					value={draft.kycEmail}
					onChange={(kycEmail) => onChange({ ...draft, kycEmail })}
				/>
				<EmailInput
					label="VIP"
					value={draft.vipEmail}
					onChange={(vipEmail) => onChange({ ...draft, vipEmail })}
				/>
			</div>

			{error && (
				<div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
					{error}
				</div>
			)}

			<div className="mt-4 flex flex-wrap justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
					className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
				>
					Cancel
				</button>
				<button
					type="submit"
					className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90"
				>
					<Plus size={16} />
					{editing ? "Save" : "Add"}
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
						Google Sheets import
					</div>
					<p className="mt-1 text-xs text-muted">
						Expected columns: Project, Support, KYC, VIP.
					</p>
				</div>
				<button
					type="button"
					onClick={onCancel}
					className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground"
					aria-label="Close import"
				>
					<X size={16} />
				</button>
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
				<input
					value={sheetUrl}
					onChange={(event) => onSheetUrlChange(event.target.value)}
					className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
					placeholder="Paste public Google Sheets URL"
				/>

				<select
					value={mode}
					onChange={(event) =>
						onModeChange(event.target.value as ProjectEmailImportMode)
					}
					className="h-11 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
				>
					<option value="upsert">Upsert</option>
					<option value="replace">Replace all emails</option>
				</select>

				<button
					type="button"
					onClick={onLoadPreview}
					disabled={importing || !sheetUrl.trim()}
					className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{importing ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<FileSpreadsheet size={16} />
					)}
					Preview
				</button>
			</div>

			{preview && (
				<div className="mt-4 rounded-lg bg-background p-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="inline-flex items-center gap-2 text-sm">
							<CheckCircle2 size={16} className="text-accent" />
							<span className="font-semibold">{preview.records.length}</span>
							projects found
						</div>

						<button
							type="button"
							onClick={onCommit}
							disabled={
								committing ||
								preview.records.length === 0 ||
								preview.errors.length > 0
							}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{committing && <Loader2 size={15} className="animate-spin" />}
							Commit import
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
		<label className="block space-y-1.5">
			<span className="text-sm font-medium">{label}</span>
			<input
				type="email"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
				placeholder={`${label.toLowerCase()}@project.com`}
			/>
		</label>
	);
}

function EmailRow({
	label,
	email,
	onCopy,
}: {
	label: string;
	email: string;
	onCopy: (email: string) => void;
}) {
	return (
		<div className="flex min-h-14 items-center justify-between gap-3 rounded-lg bg-background px-3 py-2">
			<div className="min-w-0">
				<div className="text-xs font-semibold uppercase text-muted">
					{label}
				</div>
				<div className="mt-0.5 truncate text-sm">
					{email || "Not specified"}
				</div>
			</div>

			<button
				type="button"
				onClick={() => onCopy(email)}
				disabled={!email}
				className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
				aria-label={`Copy ${label}`}
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
				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="inline-flex h-10 items-center rounded-lg bg-red-500 px-3 text-sm font-semibold text-white transition hover:bg-red-600"
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	);
}
