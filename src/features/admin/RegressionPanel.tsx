import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import {
	type GenerationResult,
	type RegressionCase,
	type RegressionResult,
	runRegression,
} from "./regression";

type Case = RegressionCase & { kind: string; enabled: boolean; status: string };
export function RegressionPanel({
	entries,
	version,
	canPreview,
}: {
	entries: Case[];
	version: number;
	canPreview: boolean;
}) {
	const [selected, setSelected] = useState<string[]>([]);
	const [compare, setCompare] = useState(false);
	const [results, setResults] = useState<RegressionResult[]>([]);
	const [running, setRunning] = useState(false);
	const [runVersion, setRunVersion] = useState<number>();
	const [runDraftIds, setRunDraftIds] = useState<string[]>([]);
	const controller = useRef<AbortController | null>(null);
	useEffect(() => () => controller.current?.abort(), []);
	const cases = entries.filter(
		(entry) =>
			entry.kind === "tests" && entry.enabled && entry.status !== "archived",
	);
	const drafts = entries.filter(
		(entry) => entry.kind !== "tests" && entry.status === "draft",
	);
	const selectedIds = selected.filter((id) =>
		drafts.some((entry) => entry.id === id),
	);
	const start = async () => {
		const requestController = new AbortController();
		controller.current = requestController;
		setRunning(true);
		setResults([]);
		setRunVersion(version);
		setRunDraftIds(compare ? selectedIds : []);
		try {
			await runRegression(
				cases,
				async (test, preview) => {
					const response = await authenticatedFetch("/api/ai/generate", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						signal: requestController.signal,
						body: JSON.stringify({
							purpose: "test",
							customerMessage: test.content,
							project: test.project,
							language: test.language || "auto",
							intent: test.intent || "general",
							tone: "neutral",
							preview,
							draftIds: preview ? selectedIds : [],
						}),
					});
					const data = await response.json();
					if (!response.ok) throw new Error(data.error ?? "Ошибка AI");
					if (data.metadata?.version !== version)
						throw new Error(
							"Настройки AI изменились во время проверки. Запустите тесты заново.",
						);
					return data as GenerationResult;
				},
				compare,
				(result) => setResults((previous) => [...previous, result]),
				requestController.signal,
			);
		} finally {
			setRunning(false);
		}
	};
	const exportReport = () => {
		const url = URL.createObjectURL(
			new Blob(
				[
					JSON.stringify(
						{ version: runVersion, draftIds: runDraftIds, results },
						null,
						2,
					),
				],
				{ type: "application/json" },
			),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = "supportos-ai-tests.json";
		link.click();
		URL.revokeObjectURL(url);
	};
	return (
		<section className="rounded-xl border border-border bg-surface p-4 space-y-4">
			<div>
				<h3 className="font-semibold">Проверка качества ответов</h3>
				<p className="mt-1 text-sm text-muted">
					Проверяются обязательные и запрещённые фразы. Эталон показан для
					ручного сравнения; смысловую корректность эти проверки не гарантируют.
				</p>
			</div>
			{canPreview && (
				<label className="block text-sm">
					<input
						type="checkbox"
						checked={compare}
						disabled={running}
						onChange={(event) => setCompare(event.target.checked)}
					/>{" "}
					Сравнить опубликованную версию и черновики
				</label>
			)}
			{compare && (
				<fieldset className="space-y-2">
					<legend className="mb-2 text-sm">Какие черновики проверить</legend>
					{drafts.length ? (
						drafts.map((entry) => (
							<label key={entry.id} className="block text-sm">
								<input
									type="checkbox"
									checked={selectedIds.includes(entry.id)}
									disabled={running}
									onChange={(event) =>
										setSelected(
											event.target.checked
												? [...selectedIds, entry.id]
												: selectedIds.filter((id) => id !== entry.id),
										)
									}
								/>{" "}
								{entry.title}
							</label>
						))
					) : (
						<p className="text-sm text-muted">
							Сначала сохраните черновик правила, знания или термина.
						</p>
					)}
				</fieldset>
			)}
			<div className="ui-actions flex flex-wrap">
				<button
					type="button"
					className="ui-button ui-button--primary"
					disabled={
						running || !cases.length || (compare && !selectedIds.length)
					}
					onClick={() => void start()}
				>
					Запустить {cases.length} тестов
					{compare ? " · сравнение" : "· опубликованная версия"}
				</button>
				{running && (
					<button
						type="button"
						className="ui-button ui-button--secondary"
						onClick={() => controller.current?.abort()}
					>
						Остановить
					</button>
				)}
				{results.length > 0 && (
					<button
						type="button"
						className="ui-button ui-button--secondary"
						onClick={exportReport}
					>
						Скачать отчёт
					</button>
				)}
			</div>
			{!cases.length && (
				<p className="text-sm text-muted">
					Создайте и сохраните тестовый запрос с условиями проверки.
				</p>
			)}
			{runVersion !== undefined && (
				<p className="text-sm text-muted">
					Версия настроек: {runVersion} · Обработано: {results.length}/
					{cases.length}
					{runVersion !== version
						? " · Настройки изменились, повторите проверку"
						: ""}
				</p>
			)}
			{results.map((result) => (
				<article
					key={result.id}
					className="rounded-lg border border-border p-3 space-y-2"
				>
					<h4 className="font-semibold">{result.name}</h4>
					{result.error && (
						<p role="alert" className="text-sm text-red-400">
							{result.error}
						</p>
					)}
					{result.production && result.draft && (
						<p className="text-sm">
							{result.production.evaluation.passed &&
							!result.draft.evaluation.passed
								? "Черновик ухудшил результат"
								: !result.production.evaluation.passed &&
										result.draft.evaluation.passed
									? "Улучшение: черновик прошёл проверку"
									: "Результат проверок не изменился"}
						</p>
					)}
					<div className="grid gap-3 lg:grid-cols-2">
						{(["production", "draft"] as const).map((mode) => {
							const output = result[mode];
							return (
								output && (
									<div key={mode}>
										<h5 className="text-sm font-medium">
											{mode === "production" ? "Опубликованная версия" : "Черновики"} ·{" "}
											{output.evaluation.passed ? "Пройдено" : "Не пройдено"}
										</h5>
										<p className="whitespace-pre-wrap text-sm my-2">
											{output.text || "Пустой ответ"}
										</p>
										{output.evaluation.missing.length > 0 && (
											<p className="text-xs text-amber-400">
												Не найдено: {output.evaluation.missing.join(", ")}
											</p>
										)}
										{output.evaluation.forbidden.length > 0 && (
											<p className="text-xs text-red-400">
												Запрещено: {output.evaluation.forbidden.join(", ")}
											</p>
										)}
										<p className="text-xs text-muted">
											{output.provider} · {output.model}
										</p>
									</div>
								)
							);
						})}
					</div>
					{result.reference && (
						<details>
							<summary className="text-sm">Эталон для сравнения</summary>
							<p className="whitespace-pre-wrap text-sm mt-2">
								{result.reference}
							</p>
						</details>
					)}
				</article>
			))}
		</section>
	);
}
