import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { knowledgeService } from "@/services/knowledge.service";
import {
	type BackupPreview,
	supportOSExportService,
} from "@/services/supportos-export.service";
import { useToast } from "@/shared/hooks/useToast";

const labels = {
	categories: "Категории",
	folders: "Папки",
	binds: "Бинды",
} as const;

export function BackupImportPanel() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [fileText, setFileText] = useState("");
	const [preview, setPreview] = useState<BackupPreview | null>(null);
	const [busy, setBusy] = useState(false);
	const { showToast } = useToast();

	async function chooseFile(file?: File) {
		setPreview(null);
		setFileText("");
		if (!file) return;
		setBusy(true);
		try {
			const text = await file.text();
			const result = await supportOSExportService.previewImport(text);
			setFileText(text);
			setPreview(result);
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Не удалось проверить файл",
			);
		} finally {
			setBusy(false);
		}
	}

	async function apply(mode: "merge" | "upsert") {
		if (!preview || !fileText) return;
		setBusy(true);
		try {
			await supportOSExportService.applyImport(fileText, preview, mode);
			setPreview(null);
			setFileText("");
			try {
				await knowledgeService.loadKnowledge();
				showToast("Импорт завершён. Данные загружены из DB.");
			} catch {
				showToast(
					"Импорт в DB завершён, но обновить экран не удалось. Перезагрузите страницу.",
				);
			}
		} catch (error) {
			setPreview(null);
			showToast(
				error instanceof Error
					? error.message
					: "Не удалось импортировать файл",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="min-w-0">
			<button
				type="button"
				disabled={busy}
				onClick={() => inputRef.current?.click()}
				className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left hover:bg-surface-elevated"
			>
				<span>
					<span className="block text-sm font-semibold">Импорт JSON</span>
					<span className="mt-1 block text-xs text-muted">
						Проверить файл и выбрать безопасный режим импорта.
					</span>
				</span>
				<Upload size={18} />
			</button>
			<input
				ref={inputRef}
				type="file"
				accept="application/json,.json"
				className="hidden"
				onChange={(event) => {
					void chooseFile(event.target.files?.[0]);
					event.target.value = "";
				}}
			/>
			{preview && (
				<section
					className="mt-3 rounded-lg border border-border bg-background p-3 text-sm"
					aria-label="Предпросмотр импорта"
				>
					<p className="font-semibold">Предпросмотр: ничего ещё не изменено</p>
					{(Object.keys(labels) as Array<keyof typeof labels>).map((key) => (
						<p key={key}>
							{labels[key]}: новых {preview.counts[key].add}, уже существуют{" "}
							{preview.counts[key].existing}
							{preview.existingIds[key]?.length > 0 && (
								<span className="block break-all text-xs text-muted">
									Совпадающие ID: {preview.existingIds[key].join(", ")}
									{preview.counts[key].existing >
									preview.existingIds[key].length
										? " …"
										: ""}
								</span>
							)}
						</p>
					))}
					<p className="mt-2 text-muted">
						Merge добавит только отсутствующие записи. Upsert также обновит
						существующие записи с теми же ID. Удалений нет.
					</p>
					<div className="ui-actions mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							className="ui-button"
							disabled={busy}
							onClick={() => void apply("merge")}
						>
							Добавить только новые
						</button>
						<button
							type="button"
							className="ui-button ui-button--secondary"
							disabled={busy}
							onClick={() => void apply("upsert")}
						>
							Обновить совпадающие ID
						</button>
						<button
							type="button"
							className="ui-button ui-button--ghost"
							disabled={busy}
							onClick={() => {
								setPreview(null);
								setFileText("");
							}}
						>
							Отмена
						</button>
					</div>
				</section>
			)}
		</div>
	);
}
