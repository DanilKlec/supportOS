import { useMemo, useState } from "react";
import {
	parseSchedule,
	sheetMonth,
	type SheetRows,
	type ScheduleImport,
} from "./import-schedule";
const control =
	"rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-40";
export function ScheduleUpload({
	agents,
	onSave,
}: {
	agents: { id: string }[];
	onSave: (payload: ScheduleImport) => Promise<void>;
}) {
	const [sheets, setSheets] = useState<{ sheet: string; data: SheetRows }[]>(
		[],
	);
	const [selected, setSelected] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [filename, setFilename] = useState("");
	const result = useMemo(() => {
		if (!selected) return null;
		try {
			const directory = sheets.find((s) => s.sheet.trim() === "Почты сотр");
			if (!directory)
				throw new Error(
					"В файле нет листа «Почты сотр» с корпоративными почтами в столбце E.",
				);
			return parseSchedule(
				sheets.find((s) => s.sheet === selected)?.data ?? [],
				directory.data,
				selected,
				agents,
			);
		} catch (error) {
			return {
				error:
					error instanceof Error
						? error.message
						: "Не удалось прочитать график",
			};
		}
	}, [sheets, selected, agents]);
	async function read(file?: File) {
		setSheets([]);
		setSelected("");
		setMessage("");
		setFilename("");
		if (!file) return;
		if (!/\.xlsx$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
			setMessage("Выберите файл .xlsx размером до 10 МБ.");
			return;
		}
		setBusy(true);
		try {
			const { default: readExcel } = await import("read-excel-file/browser");
			const loaded = await readExcel(file);
			const months = loaded
				.filter((s) => sheetMonth(s.sheet))
				.sort((a, b) =>
					sheetMonth(b.sheet)!.localeCompare(sheetMonth(a.sheet)!),
				);
			if (!months.length)
				throw new Error("Не найдены месячные листы, например September 26.");
			setSheets(loaded);
			setSelected(months[0].sheet);
			setFilename(file.name);
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : "Не удалось прочитать Excel.",
			);
		} finally {
			setBusy(false);
		}
	}
	async function save() {
		if (!result || "error" in result || result.issues.length) return;
		setBusy(true);
		setMessage("");
		try {
			await onSave(result.payload);
			setSheets([]);
			setSelected("");
			setMessage(`График за ${result.payload.month} обновлён.`);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "Не удалось сохранить график. Можно повторить попытку.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<details className="rounded-xl border border-border bg-surface p-4">
			<summary className="cursor-pointer font-semibold">
				Загрузить график Excel
			</summary>
			<div className="mt-4 space-y-3">
				<p className="text-sm text-muted">
					Выберите таблицу, проверьте месяц и сотрудников, затем подтвердите
					обновление. Время смен — GMT+3.
				</p>
				<input
					aria-label="Файл графика"
					type="file"
					accept=".xlsx"
					disabled={busy}
					onChange={(e) => {
						void read(e.target.files?.[0]);
						e.target.value = "";
					}}
					className={control}
				/>
				{busy && <p role="status">Обработка графика…</p>}
				{message && <p role="status">{message}</p>}
				{selected && (
					<>
						<p className="text-sm">{filename}</p>
						<label className="block">
							Месяц графика{" "}
							<select
								aria-label="Месяц графика"
								className={control}
								value={selected}
								disabled={busy}
								onChange={(e) => {
									setSelected(e.target.value);
									setMessage("");
								}}
							>
								{sheets
									.filter((s) => sheetMonth(s.sheet))
									.sort((a, b) =>
										sheetMonth(b.sheet)!.localeCompare(sheetMonth(a.sheet)!),
									)
									.map((s) => (
										<option key={s.sheet}>{s.sheet}</option>
									))}
							</select>
						</label>
					</>
				)}
				{result &&
					("error" in result ? (
						<p role="alert">{result.error}</p>
					) : (
						<>
							<p>
								{result.payload.month}: {result.preview.length} сотрудников,{" "}
								{result.payload.records.length} назначений.
							</p>
							<p className="text-sm">
								Будут заменены все назначения за этот месяц у перечисленных
								сотрудников, включая ручные. Выходные уберут прежние смены.
								Остальные сотрудники и месяцы сохранятся.
							</p>
							<p className="text-sm text-muted">
								День 09:00–16:30 · Вечер 16:00–23:00 · Ночь 23:00–09:00. Код 13
								— день и вечер.
							</p>
							{result.issues.length > 0 && (
								<div role="alert">
									<p>Исправьте ошибки в Excel и выберите файл повторно:</p>
									<ul className="max-h-48 overflow-auto">
										{result.issues.map((issue, i) => (
											<li key={`${i}-${issue}`}>{issue}</li>
										))}
									</ul>
								</div>
							)}
							<div className="max-h-80 overflow-auto">
								<table className="w-full text-left text-sm">
									<thead>
										<tr>
											<th>Сотрудник</th>
											<th>Корпоративная почта</th>
											<th>Назначения</th>
										</tr>
									</thead>
									<tbody>
										{result.preview.map((p) => (
											<tr key={p.email}>
												<td>{p.name}</td>
												<td>{p.email}</td>
												<td>{p.shifts}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<details>
								<summary className="cursor-pointer">
									Показать даты и смены
								</summary>
								<div className="max-h-80 overflow-auto text-sm">
									{result.payload.records.map((r) => (
										<p key={`${r.day}-${r.email}-${r.shift}`}>
											{r.day} · {r.email} ·{" "}
											{
												{
													day: "Дневная",
													evening: "Вечерняя",
													night: "Ночная",
												}[r.shift]
											}
										</p>
									))}
								</div>
							</details>
							<button
								type="button"
								className={control}
								disabled={busy || result.issues.length > 0}
								onClick={() => void save()}
							>
								Подтвердить обновление графика
							</button>
							<button
								type="button"
								className={control}
								disabled={busy}
								onClick={() => {
									setSheets([]);
									setSelected("");
									setMessage("");
								}}
							>
								Отменить
							</button>
						</>
					))}
			</div>
		</details>
	);
}
