import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
	googleSheetsService,
	type SheetImportMode,
	type SheetPreview,
} from "@/services/google-sheets.service";
import { useToast } from "@/shared/hooks/useToast";
import { useAuthStore } from "@/store/auth.store";
import { useKnowledgeStore } from "@/store/knowledge.store";

interface GoogleSheetsImportPanelProps {
	showHeading?: boolean;
}

export function GoogleSheetsImportPanel({
	showHeading = true,
}: GoogleSheetsImportPanelProps) {
	const { showToast } = useToast();
	const session = useAuthStore((state) => state.session);
	const configured = useAuthStore((state) => state.configured);
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const [url, setUrl] = useState("");
	const [preview, setPreview] = useState<SheetPreview>();
	const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
	const [folderId, setFolderId] = useState("");
	const [mode, setMode] = useState<SheetImportMode>("upsert");
	const [loadingPreview, setLoadingPreview] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const isAdmin = !configured || session?.user.role === "admin";
	const availableFolders = useMemo(
		() => folders.filter((folder) => folder.categoryId === categoryId),
		[categoryId, folders],
	);

	useEffect(() => {
		if (!categoryId && categories[0]) {
			setCategoryId(categories[0].id);
		}
	}, [categories, categoryId]);

	const loadPreview = async (event: FormEvent) => {
		event.preventDefault();
		setError("");
		setLoadingPreview(true);

		try {
			const nextPreview = await googleSheetsService.preview(url);

			setPreview(nextPreview);
			showToast("Google Sheet loaded");
		} catch (previewError) {
			setError(
				previewError instanceof Error
					? previewError.message
					: "Unable to load Google Sheet",
			);
		} finally {
			setLoadingPreview(false);
		}
	};

	const commitImport = () => {
		if (!preview) return;

		setError("");
		setSaving(true);

		try {
			const imported = googleSheetsService.commit({
				preview,
				categoryId,
				folderId: folderId || undefined,
				mode,
			});

			showToast(`Imported ${imported} binds`);
		} catch (commitError) {
			setError(
				commitError instanceof Error ? commitError.message : "Import failed",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex w-full flex-col gap-5">
			{showHeading && (
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold">Google Sheets Import</h1>
						<p className="mt-1 text-sm text-muted">
							Import rows as RU, EN, DE, PT and EL bind translations.
						</p>
					</div>

					<div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
						{configured
							? isAdmin
								? "Admin import enabled"
								: "Admin role required"
							: "Local import mode"}
					</div>
				</div>
			)}

			{error && (
				<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
					{error}
				</div>
			)}

			<form
				onSubmit={loadPreview}
				className="rounded-lg border border-border bg-surface p-4"
			>
				<div className="grid gap-3 lg:grid-cols-[1fr_auto]">
					<input
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						disabled={loadingPreview || saving || !isAdmin}
						className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
						placeholder="Paste public Google Sheets URL"
					/>

					<button
						type="submit"
						disabled={loadingPreview || saving || !url.trim() || !isAdmin}
						className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{loadingPreview ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<FileSpreadsheet size={16} />
						)}
						Preview
					</button>
				</div>
			</form>

			<div className="grid gap-4 rounded-lg border border-border bg-surface p-4 lg:grid-cols-3">
				<label className="block space-y-2">
					<span className="text-sm font-medium">Category</span>
					<select
						value={categoryId}
						onChange={(event) => {
							setCategoryId(event.target.value);
							setFolderId("");
						}}
						disabled={saving || !isAdmin}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
				</label>

				<label className="block space-y-2">
					<span className="text-sm font-medium">Folder</span>
					<select
						value={folderId}
						onChange={(event) => setFolderId(event.target.value)}
						disabled={saving || !isAdmin}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<option value="">No folder</option>
						{availableFolders.map((folder) => (
							<option key={folder.id} value={folder.id}>
								{folder.name}
							</option>
						))}
					</select>
				</label>

				<label className="block space-y-2">
					<span className="text-sm font-medium">Mode</span>
					<select
						value={mode}
						onChange={(event) => setMode(event.target.value as SheetImportMode)}
						disabled={saving || !isAdmin}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<option value="upsert">Update and add</option>
						<option value="replace">Replace imported set</option>
					</select>
				</label>
			</div>

			{preview && (
				<div className="rounded-lg border border-border bg-surface">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
						<div>
							<div className="text-sm font-semibold">
								{preview.rows.length} rows found
							</div>
							<div className="mt-1 text-xs text-muted">
								{preview.rows.filter((row) => row.errors.length === 0).length}{" "}
								ready to import
							</div>
						</div>

						<button
							type="button"
							onClick={commitImport}
							disabled={
								saving ||
								!categoryId ||
								!isAdmin ||
								preview.rows.every((row) => row.errors.length > 0)
							}
							className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{saving ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<UploadCloud size={16} />
							)}
							Import
						</button>
					</div>

					<div className="max-h-[520px] overflow-auto">
						<table className="w-full border-collapse text-sm">
							<thead className="sticky top-0 bg-surface-elevated text-left text-xs uppercase tracking-wider text-muted">
								<tr>
									<th className="border-b border-border px-4 py-2">Row</th>
									<th className="border-b border-border px-4 py-2">Title</th>
									<th className="border-b border-border px-4 py-2">Slug</th>
									<th className="border-b border-border px-4 py-2">
										Languages
									</th>
									<th className="border-b border-border px-4 py-2">Status</th>
								</tr>
							</thead>

							<tbody>
								{preview.rows.map((row) => (
									<tr key={`${row.hash}-${row.rowNumber}`}>
										<td className="border-b border-border px-4 py-2 text-muted">
											{row.rowNumber}
										</td>
										<td className="max-w-xs truncate border-b border-border px-4 py-2">
											{row.title}
										</td>
										<td className="max-w-xs truncate border-b border-border px-4 py-2 text-muted">
											{row.slug}
										</td>
										<td className="border-b border-border px-4 py-2 text-muted">
											{row.translations
												.map((translation) =>
													translation.language.toUpperCase(),
												)
												.join(", ")}
										</td>
										<td className="border-b border-border px-4 py-2">
											{row.errors.length > 0 ? (
												<span className="text-red-300">
													{row.errors.join(", ")}
												</span>
											) : (
												<span className="text-green-300">Ready</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
