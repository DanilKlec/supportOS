import { BindDiff } from "./BindDiff";
import { bindChange } from "./bind-diff";
import type { Bind } from "@/entities/bind";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { googleSheetsService } from "@/services/google-sheets.service";
import { sharedBindsService } from "@/services/shared-binds.service";
import { contentApi } from "@/services/shared-content.service";
import type { BindTranslation } from "@/entities/bind";

export function CommonBindImport() {
	const client = useQueryClient();
	const [originals, setOriginals] = useState<Bind[]>([]);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [url, setUrl] = useState(""),
		[rows, setRows] = useState<
			{
				id: string;
				slug: string;
				expected: string | null;
				translations: BindTranslation[];
				tags: string[];
			}[]
		>([]);
	const [busy, setBusy] = useState(false),
		[error, setError] = useState(""),
		[message, setMessage] = useState("");
	const preview = async (input: unknown) => {
		const value = input as any;
		const source = Array.isArray(value)
			? value
			: (value?.knowledge?.binds ?? value?.binds);
		if (!Array.isArray(source) || !source.length || source.length > 1000)
			throw new Error(
				"Нужен массив binds: от 1 до 1000 биндов. Поддерживается полный экспорт SupportOS.",
			);
		const existing = await sharedBindsService.list();
		let skippedTranslations = 0;
		let skippedBinds = 0;
		const prepared = source.flatMap((r: any, i: number) => {
			if (!r || !Array.isArray(r.translations))
				throw new Error(`Бинд ${i + 1}: нужен массив переводов translations`);
			const translations = r.translations.filter((t: any) => {
				// An empty language slot may still contain a copied title.
				const absent =
					!t ||
					t.language == null ||
					(typeof t.language === "string" && !t.language.trim()) ||
					t.content == null ||
					(typeof t.content === "string" && !t.content.trim());
				if (absent) skippedTranslations++;
				return !absent;
			});
			if (!translations.length) {
				skippedBinds++;
				return [];
			}
			if (
				translations.some(
					(t: any) =>
						typeof t.language !== "string" ||
						typeof t.title !== "string" ||
						!t.title.trim() ||
						typeof t.content !== "string",
				)
			)
				throw new Error(
					`Бинд ${i + 1}: заполните язык и название непустого перевода`,
				);
			if (
				new Set(translations.map((t: any) => t.language.trim())).size !==
				translations.length
			)
				throw new Error(`Бинд ${i + 1}: повторяются языки`);
			const slug =
				typeof r.slug === "string" && r.slug.trim()
					? r.slug.trim()
					: translations[0].title.trim().toLowerCase();
			const matches = existing.filter((b) => b.id === r.id || b.slug === slug);
			if (matches.length > 1)
				throw new Error(
					`Неоднозначное совпадение: ${slug}. Уточните slug в файле.`,
				);
			const original = matches[0];
			return {
				id: original?.id ?? `shared-${crypto.randomUUID()}`,
				slug,
				expected: original?.updatedAt ?? null,
				translations: translations.map((t: BindTranslation) => ({
					language: t.language.trim(),
					title: t.title.trim(),
					content: t.content.trim(),
					updatedAt: new Date().toISOString(),
				})),
				tags: Array.isArray(r.tags)
					? r.tags.filter((t: unknown) => typeof t === "string")
					: [],
			};
		});
		if (
			new Set(prepared.map((r) => r.slug)).size !== prepared.length ||
			new Set(prepared.map((r) => r.id)).size !== prepared.length
		)
			throw new Error("В файле повторяются бинды или slug. Уберите дубликаты.");
		setOriginals(existing);
		setRows(prepared);
		if (skippedTranslations || skippedBinds)
			setMessage(
				`Пропущено пустых переводов: ${skippedTranslations}; биндов без переводов: ${skippedBinds}.`,
			);
		if (!prepared.length)
			setMessage(
				"Нет заполненных переводов для импорта. Все пустые бинды пропущены.",
			);
	};
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		setError("");
		setMessage("");
		setRows([]);
		try {
			await action();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const publish = async () => {
		setBusy(true);
		setError("");
		try {
			await contentApi("binds", changedRows);
			setMessage(`Опубликовано биндов: ${changedRows.length}`);
			setRows([]);
			await client.invalidateQueries({ queryKey: ["shared-binds"] });
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const status = (row: (typeof rows)[number]) =>
		bindChange(
			originals.find((b) => b.id === row.id),
			row,
		);
	const changedRows = rows.filter((r) => status(r) !== "unchanged");
	return (
		<details className="mb-5 rounded-2xl border border-border bg-surface p-4">
			<summary className="cursor-pointer font-semibold">
				Загрузить базовые бинды для всей команды
			</summary>
			<p className="my-3 text-sm text-muted">
				JSON из SupportOS или Google Sheets: название, RU, EN, DE, PT, EL.
				Совпадения по ID или slug обновят общие оригиналы. Личные версии
				сохраняются. Отсутствующие языки и пустые переводы пропускаются.
			</p>
			<div className="flex flex-wrap gap-3">
				<label className="rounded-xl border border-border p-3 text-sm">
					JSON-файл
					<input
						aria-label="JSON с общими биндами"
						type="file"
						accept=".json,application/json"
						disabled={busy}
						className="ml-3 max-w-60"
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = "";
							if (file)
								void run(async () => {
									if (file.size > 3000000)
										throw new Error("Файл не должен превышать 3 МБ");
									await preview(JSON.parse(await file.text()));
								});
						}}
					/>
				</label>
				<input
					aria-label="Ссылка Google Sheets"
					placeholder="https://docs.google.com/spreadsheets/…"
					value={url}
					disabled={busy}
					onChange={(e) => {
						setUrl(e.target.value);
						setRows([]);
					}}
					className="min-w-48 flex-1 rounded-xl border border-border bg-background px-3"
				/>
				<button
					type="button"
					disabled={busy || !url.trim()}
					onClick={() =>
						void run(async () => {
							const sheet = await googleSheetsService.preview(url);
							const errors = [
								...sheet.errors,
								...sheet.rows.flatMap((r) => r.errors),
							];
							if (errors.length) throw new Error(errors.slice(0, 4).join("; "));
							await preview(sheet.rows);
						})
					}
					className="rounded-xl border border-border px-4 py-3 disabled:opacity-40"
				>
					Предпросмотр таблицы
				</button>
			</div>
			{busy && (
				<p role="status" className="mt-3 text-muted">
					Обработка…
				</p>
			)}
			{error && (
				<p role="alert" className="mt-3 text-red-400">
					{error}
				</p>
			)}
			{message && (
				<p role="status" className="mt-3 text-emerald-400">
					{message}
				</p>
			)}
			{!!rows.length && (
				<div className="mt-4">
					<p className="mb-2 text-sm">
						Новых: {rows.filter((r) => status(r) === "added").length} ·
						Изменённых: {rows.filter((r) => status(r) === "changed").length} ·
						Без изменений:{" "}
						{rows.filter((r) => status(r) === "unchanged").length}
					</p>
					<p className="mb-3 text-xs text-muted">
						Отсутствующие в файле бинды не удаляются. В обновляемом бинде список
						переводов заменяется: удаляемые языки показаны в сравнении.
					</p>
					<div className="max-h-64 overflow-auto rounded-xl border border-border">
						<table className="w-full text-left text-sm">
							<thead>
								<tr>
									<th className="p-3">Название</th>
									<th>Языки</th>
									<th>Действие</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.id} className="border-t border-border">
										<td className="p-3">
											<details
												onToggle={(e) => {
													if (e.currentTarget.open) setExpanded(r.id);
												}}
											>
												<summary className="cursor-pointer">
													{r.translations[0].title}
												</summary>
												{expanded === r.id &&
													(status(r) === "unchanged" ? (
														<p className="p-3 text-xs text-muted">
															Содержимое совпадает. Повторная запись не нужна.
														</p>
													) : (
														<BindDiff
															before={originals.find((b) => b.id === r.id)}
															after={r}
														/>
													))}
											</details>
										</td>
										<td>{r.translations.map((t) => t.language).join(", ")}</td>
										<td>
											{
												{
													added: "Добавить",
													changed: "Обновить",
													unchanged: "Без изменений",
												}[status(r)]
											}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<button
						type="button"
						disabled={busy || !changedRows.length}
						onClick={() => void publish()}
						className="mt-3 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground disabled:opacity-40"
					>
						Опубликовать {changedRows.length} изменений
					</button>
				</div>
			)}
		</details>
	);
}
