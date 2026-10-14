import { Database, Download, FileJson } from "lucide-react";
import { BackupImportPanel } from "@/components/backup/BackupImportPanel";
import { GoogleSheetsImportPanel } from "@/components/import/GoogleSheetsImportPanel";
import { supportOSExportService } from "@/services/supportos-export.service";
import { useToast } from "@/shared/hooks/useToast";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";

export function DataSettings() {
	const { showToast } = useToast();
	const authSession = useAuthStore((state) => state.session);
	const exportJson = async () => {
		if (!can(authSession?.user.access, "binds.read")) return;
		try {
			const blob = new Blob([await supportOSExportService.exportJson()], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");

			link.href = url;
			link.download = `supportos-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			showToast("Снимок базы знаний экспортирован");
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Не удалось экспортировать данные",
			);
		}
	};

	return (
		<section className="rounded-lg border border-border bg-surface p-5">
			<div className="mb-5 flex items-center gap-2 text-lg font-semibold">
				<Database size={18} />
				Импорт и экспорт
			</div>

			<div className="mb-5 grid gap-3 sm:grid-cols-2">
				{can(authSession?.user.access, "knowledge.write") ? (
					<BackupImportPanel />
				) : (
					<p className="text-sm text-muted">
						Импорт доступен редакторам базы знаний.
					</p>
				)}

				<button
					type="button"
					disabled={!can(authSession?.user.access, "binds.read")}
					onClick={exportJson}
					className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left hover:bg-surface-elevated"
				>
					<span>
						<span className="block text-sm font-semibold">Экспорт JSON</span>
						<span className="mt-1 block text-xs text-muted">
							Скачать снимок доступной базы знаний из DB.
						</span>
					</span>
					<Download size={18} />
				</button>
			</div>

			<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
				<FileJson size={16} />
				Google Sheets
			</div>
			{can(authSession?.user.access, "knowledge.write") ? (
				<GoogleSheetsImportPanel showHeading={false} />
			) : (
				<p className="text-sm text-muted">Импорт доступен редакторам базы.</p>
			)}
		</section>
	);
}
