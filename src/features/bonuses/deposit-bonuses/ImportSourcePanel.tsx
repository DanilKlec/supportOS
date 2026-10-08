import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import type {
	DepositBonusImportMode,
	DepositBonusImportPreview,
} from "@/services/deposit-bonus-import.service";
import { getBonusTranslations, getLanguageLabel } from "./bonus-presentation";

export function ImportSourcePanel({
	sheetUrl,
	setSheetUrl,
	mode,
	setMode,
	loadPreview,
	importing,
	preview,
	commitPreview,
	committing,
}: {
	sheetUrl: string;
	setSheetUrl: (value: string) => void;
	mode: DepositBonusImportMode;
	setMode: (mode: DepositBonusImportMode) => void;
	loadPreview: () => Promise<void>;
	importing: boolean;
	preview?: DepositBonusImportPreview;
	commitPreview: () => void;
	committing: boolean;
}) {
	return (
		<div className="rounded-xl border border-border bg-surface p-4">
			<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
				<FileSpreadsheet size={16} />
				Импорт из Google-таблицы
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
				<textarea
					value={sheetUrl}
					onChange={(event) => setSheetUrl(event.target.value)}
					className="ui-input min-h-10 border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
					placeholder="Вставьте ссылку на Google-таблицу. Каждый лист станет проектом. Несколько ссылок указывайте по одной на строку."
				/>

				<select
					value={mode}
					onChange={(event) =>
						setMode(event.target.value as DepositBonusImportMode)
					}
					className="ui-input border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
				>
					<option value="upsert">Добавить и обновить</option>
					<option value="replace">Заменить все проекты</option>
				</select>

				<button
					type="button"
					onClick={loadPreview}
					disabled={importing || !sheetUrl.trim()}
					className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
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
							<span className="font-semibold">{preview.projects.length}</span>{" "}
							проектов найдено
						</div>

						<button
							type="button"
							onClick={commitPreview}
							disabled={
								committing ||
								preview.projects.length === 0 ||
								preview.errors.length > 0
							}
							className="ui-button ui-button--primary ui-button--small inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{committing && <Loader2 size={15} className="animate-spin" />}
							Применить импорт
						</button>
					</div>

					{preview.projects.length > 0 && (
						<div className="mt-3 flex flex-wrap gap-2">
							{preview.projects.map((project) => {
								const languages = Array.from(
									new Set(
										project.bonuses.flatMap((bonus) =>
											getBonusTranslations(bonus).map((translation) =>
												getLanguageLabel(translation.language),
											),
										),
									),
								).join(", ");

								return (
									<span
										key={`${project.slug}-${project.sheetId ?? "sheet"}`}
										className="rounded-md border border-border px-2 py-1 text-xs text-muted"
									>
										{project.name}: {project.bonuses.length}
										{languages ? ` (${languages})` : ""}
									</span>
								);
							})}
						</div>
					)}

					{preview.errors.length > 0 && (
						<div className="mt-3 space-y-1 text-sm text-red-300">
							{preview.errors.map((error) => (
								<div key={error}>{error}</div>
							))}
						</div>
					)}

					{preview.warnings.length > 0 && (
						<div className="mt-3 max-h-24 overflow-auto text-xs text-amber-200">
							{preview.warnings.slice(0, 12).map((warning) => (
								<div key={warning}>{warning}</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
