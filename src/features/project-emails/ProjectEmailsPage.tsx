import {
	Copy,
	FileSpreadsheet,
	Loader2,
	Mail,
	Pencil,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

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

	const resetForm = () => {
		setDraft(EMPTY_DRAFT);
		setEditingId(undefined);
		setFormError("");
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

		upsertRecords([toRecord(draft, existing)]);
		showToast(editingId ? "Project emails saved" : "Project emails added");
		resetForm();
	};

	const editRecord = (record: ProjectEmailRecord) => {
		setEditingId(record.id);
		setDraft({
			projectName: record.projectName,
			supportEmail: record.supportEmail,
			kycEmail: record.kycEmail,
			vipEmail: record.vipEmail,
		});
		setFormError("");
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

			showToast(`Imported ${preview.records.length} projects`);
			setPreview(undefined);
		} finally {
			setCommitting(false);
		}
	};

	return (
		<div className="flex h-full flex-col overflow-auto bg-background">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
				<div>
					<h1 className="text-2xl font-bold">Project Emails</h1>
					<p className="mt-1 text-sm text-muted">
						Support, KYC, and VIP email directory for every project.
					</p>
				</div>

				<div className="grid gap-4 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
					<form
						onSubmit={submit}
						className="rounded-lg border border-border bg-surface p-4"
					>
						<div className="mb-4 flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 text-sm font-semibold">
								<Mail size={16} />
								{editingId ? "Edit Project" : "Add Project"}
							</div>

							{editingId && (
								<button
									type="button"
									onClick={resetForm}
									className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-foreground"
									title="Cancel edit"
								>
									<X size={16} />
								</button>
							)}
						</div>

						<div className="space-y-3">
							<label className="block space-y-1.5">
								<span className="text-sm font-medium">Project</span>
								<input
									value={draft.projectName}
									onChange={(event) =>
										setDraft((current) => ({
											...current,
											projectName: event.target.value,
										}))
									}
									className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Project name"
								/>
							</label>

							<EmailInput
								label="Support"
								value={draft.supportEmail}
								onChange={(supportEmail) =>
									setDraft((current) => ({ ...current, supportEmail }))
								}
							/>

							<EmailInput
								label="KYC"
								value={draft.kycEmail}
								onChange={(kycEmail) =>
									setDraft((current) => ({ ...current, kycEmail }))
								}
							/>

							<EmailInput
								label="VIP"
								value={draft.vipEmail}
								onChange={(vipEmail) =>
									setDraft((current) => ({ ...current, vipEmail }))
								}
							/>

							{formError && (
								<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
									{formError}
								</div>
							)}

							<button
								type="submit"
								className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
							>
								<Plus size={16} />
								{editingId ? "Save" : "Add"}
							</button>
						</div>
					</form>

					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
							<FileSpreadsheet size={16} />
							Google Sheets Import
						</div>

						<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
							<input
								value={sheetUrl}
								onChange={(event) => setSheetUrl(event.target.value)}
								className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								placeholder="Paste public Google Sheets URL"
							/>

							<select
								value={mode}
								onChange={(event) =>
									setMode(event.target.value as ProjectEmailImportMode)
								}
								className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							>
								<option value="upsert">Upsert</option>
								<option value="replace">Replace all emails</option>
							</select>

							<button
								type="button"
								onClick={loadPreview}
								disabled={importing || !sheetUrl.trim()}
								className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{importing ? (
									<Loader2 size={16} className="animate-spin" />
								) : (
									<FileSpreadsheet size={16} />
								)}
								Preview
							</button>
						</div>

						<div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
							Expected columns: Project, Support, KYC, VIP.
						</div>

						{preview && (
							<div className="mt-4 rounded-md border border-border bg-background p-3">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="text-sm">
										<span className="font-semibold">
											{preview.records.length}
										</span>{" "}
										projects found
									</div>

									<button
										type="button"
										onClick={commitPreview}
										disabled={
											committing ||
											preview.records.length === 0 ||
											preview.errors.length > 0
										}
										className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{committing && (
											<Loader2 size={15} className="animate-spin" />
										)}
										Commit Import
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
									<div className="mt-3 max-h-24 overflow-auto text-xs text-amber-200">
										{preview.warnings.slice(0, 10).map((warning) => (
											<div key={warning}>{warning}</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				<div className="relative">
					<Search
						size={16}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
					/>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="h-10 w-full rounded-md border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
						placeholder="Search project or email..."
					/>
				</div>

				<div className="grid gap-3">
					{filteredRecords.length > 0 ? (
						filteredRecords.map((record) => (
							<section
								key={record.id}
								className="rounded-lg border border-border bg-surface"
							>
								<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
									<div>
										<h2 className="font-semibold">{record.projectName}</h2>
										<div className="mt-1 text-xs text-muted">
											Updated {new Date(record.updatedAt).toLocaleDateString()}
										</div>
									</div>

									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() =>
												void copyText(
													buildProjectEmailBlock(record),
													"Project emails copied",
												)
											}
											className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
										>
											<Copy size={15} />
											Copy All
										</button>

										<button
											type="button"
											onClick={() => editRecord(record)}
											className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-foreground"
											title="Edit"
										>
											<Pencil size={16} />
										</button>

										<button
											type="button"
											onClick={() => removeRecord(record.id)}
											className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-red-400"
											title="Delete"
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>

								<div className="grid gap-3 p-4 md:grid-cols-3">
									<EmailCard
										label="Support"
										email={record.supportEmail}
										onCopy={(email) => void copyText(email, "Support copied")}
									/>
									<EmailCard
										label="KYC"
										email={record.kycEmail}
										onCopy={(email) => void copyText(email, "KYC copied")}
									/>
									<EmailCard
										label="VIP"
										email={record.vipEmail}
										onCopy={(email) => void copyText(email, "VIP copied")}
									/>
								</div>
							</section>
						))
					) : (
						<div className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-sm text-muted">
							No project emails yet
						</div>
					)}
				</div>
			</div>
		</div>
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
				className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
				placeholder={`${label.toLowerCase()}@project.com`}
			/>
		</label>
	);
}

function EmailCard({
	label,
	email,
	onCopy,
}: {
	label: string;
	email: string;
	onCopy: (email: string) => void;
}) {
	return (
		<div className="rounded-md border border-border bg-background p-3">
			<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
				{label}
			</div>

			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0 truncate text-sm">
					{email || "Not specified"}
				</div>

				<button
					type="button"
					onClick={() => onCopy(email)}
					disabled={!email}
					className="rounded-md border border-border p-1.5 text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					title={`Copy ${label}`}
				>
					<Copy size={14} />
				</button>
			</div>
		</div>
	);
}
