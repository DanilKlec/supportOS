import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { answerAssistantService } from "@/services/answer-assistant.service";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { can, canTrain } from "../../../shared/access.js";
import { evaluateAIAnswer } from "../../../shared/ai-evaluation.js";
export type AISection =
	| "knowledge"
	| "rules"
	| "projects"
	| "glossary"
	| "playground"
	| "tests"
	| "feedback";
type Entry = {
	id: string;
	kind: string;
	title: string;
	content: string;
	project: string;
	category: string;
	language: string;
	intent: string;
	priority: number;
	enabled: boolean;
	status: string;
	required: string[];
	forbidden: string[];
	reference: string;
	related: string[];
	author?: string;
	updatedAt?: string;
	published?: Entry | null;
};
type Feedback = {
	rating: string;
	reason: string;
	project: string;
	language: string;
	createdAt: string;
};
type Runtime = {
	content: string;
	version: number;
	document: { global?: string; entries: Entry[]; feedback: Feedback[] };
};
const blank = (kind: string): Entry => ({
	id: "",
	kind,
	title: "",
	content: "",
	project: "",
	category: "",
	language: "",
	intent: "general",
	priority: 50,
	enabled: true,
	status: "draft",
	required: [],
	forbidden: [],
	reference: "",
	related: [],
});
async function api<T>(path: string, body?: object): Promise<T> {
	const response = await authenticatedFetch(
		path,
		body
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			: undefined,
	);
	const data = await response.json();
	if (!response.ok) throw new Error(data.error ?? "Ошибка AI");
	return data;
}
const control =
	"min-h-10 rounded-lg border border-border bg-background p-2 text-sm";
export function AIControlCenter({
	section,
	onSection,
}: {
	section: AISection;
	onSection: (section: AISection) => void;
}) {
	const user = useAuthStore((s) => s.session?.user),
		projects = useBonusStore((s) => s.projects),
		client = useQueryClient();
	const query = useQuery({
		queryKey: ["ai-runtime", user?.id],
		queryFn: () => api<Runtime>("/api/ai/knowledge"),
		enabled: canTrain(user?.access),
		staleTime: 30000,
	});
	const [entry, setEntry] = useState<Entry>(() => blank(section)),
		[search, setSearch] = useState(""),
		[message, setMessage] = useState(""),
		[busy, setBusy] = useState(false);
	const [request, setRequest] = useState(""),
		[project, setProject] = useState(""),
		[language, setLanguage] = useState("ru"),
		[intent, setIntent] = useState("general"),
		[tone, setTone] = useState("neutral"),
		[preview, setPreview] = useState(false),
		[draftIds, setDraftIds] = useState<string[]>([]),
		[answer, setAnswer] = useState(""),
		[debug, setDebug] = useState<object>(),
		[testResults, setTestResults] = useState<
			{
				id: string;
				name: string;
				passed: boolean;
				missing: string[];
				forbidden: string[];
			}[]
		>([]);
	const [reviewed, setReviewed] = useState<string[]>([]);
	const [reviewedVersion, setReviewedVersion] = useState<number>();
	useEffect(() => {
		if (!["playground", "feedback"].includes(section) && entry.kind !== section)
			setEntry(blank(section));
	}, [section, entry.kind]);
	if (!canTrain(user?.access)) return null;
	const entries = query.data?.document.entries ?? [];
	const editable = can(
		user?.access,
		section === "rules"
			? "ai.rules"
			: section === "tests"
				? "ai.tests"
				: "ai.train",
	);
	const save = async (action: string) => {
		if (!query.data || (!["publish", "archive"].includes(action) && !editable))
			return;
		setBusy(true);
		setMessage("");
		try {
			await api("/api/ai/knowledge", {
				action,
				expected: query.data.version,
				id: entry.id,
				entry,
			});
			await client.invalidateQueries({ queryKey: ["ai-runtime", user?.id] });
			setMessage(action === "publish" ? "Опубликовано" : "Сохранено");
			setEntry(blank(section));
			setReviewed([]);
		} catch (error) {
			setMessage((error as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const generate = async (
		input: string,
		projectValue = project,
		languageValue = language,
		intentValue = intent,
	) => {
		const result = await api<{
			text: string;
			provider: string;
			model: string;
			metadata: object;
		}>("/api/ai/generate", {
			purpose: section === "tests" ? "test" : "playground",
			customerMessage: input,
			project: projectValue,
			language: languageValue,
			intent: intentValue,
			tone,
			preview,
			draftIds,
		});
		const guard = answerAssistantService.checkAnswer({
			answer: result.text,
			customerMessage: input,
			glossary: [],
			language: languageValue,
		});
		return { ...result, guard };
	};
	const run = async () => {
		setBusy(true);
		setMessage("");
		try {
			const result = await generate(request);
			setAnswer(result.text);
			setDebug({
				...result.metadata,
				provider: result.provider,
				model: result.model,
				policyGuard: result.guard,
			});
			setReviewed(preview ? draftIds : []);
			setReviewedVersion(query.data?.version);
		} catch (error) {
			setMessage((error as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const patch = (key: keyof Entry, value: unknown) => {
		setEntry((current) => ({ ...current, [key]: value }));
		setReviewed([]);
	};
	const choose = (value: Entry) => {
		setEntry(value);
		setProject(value.project);
		setLanguage(value.language || "ru");
		setIntent(value.intent || "general");
	};
	return (
		<div className="space-y-4">
			<h2 className="text-xl font-semibold">AI · {section}</h2>
			{query.isPending && <p>Загрузка…</p>}
			{query.error && (
				<p role="alert">
					{query.error.message}{" "}
					<button type="button" onClick={() => void query.refetch()}>
						Повторить
					</button>
				</p>
			)}
			{message && <output className="block text-sm">{message}</output>}
			{section === "feedback" ? (
				<div className="divide-y divide-border">
					{(query.data?.document.feedback ?? [])
						.filter((f) => f.rating === "negative")
						.map((feedback) => (
							<div
								key={`${feedback.createdAt}-${feedback.reason}`}
								className="py-3 text-sm"
							>
								<p>
									{feedback.reason} · {feedback.project || "Все проекты"} ·{" "}
									{feedback.language}
								</p>
								<div className="flex gap-2">
									{(["knowledge", "rules", "tests"] as const).map((kind) => (
										<button
											type="button"
											key={kind}
											className={control}
											onClick={() => {
												setEntry({
													...blank(kind),
													title: feedback.reason,
													project: feedback.project,
													language: feedback.language,
												});
												onSection(kind);
											}}
										>
											Создать {kind}
										</button>
									))}
								</div>
							</div>
						))}
				</div>
			) : section === "playground" ? (
				<div className="grid gap-4 xl:grid-cols-2">
					<div className="space-y-3">
						<label className="block">
							Сообщение
							<textarea
								value={request}
								maxLength={8000}
								onChange={(e) => setRequest(e.target.value)}
								className={`${control} block min-h-36 w-full`}
							/>
						</label>
						<div className="flex flex-wrap gap-2">
							<select
								aria-label="Проект Playground"
								className={control}
								value={project}
								onChange={(e) => setProject(e.target.value)}
							>
								<option value="">Все проекты</option>
								{projects.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
							<input
								aria-label="Язык Playground"
								className={control}
								value={language}
								onChange={(e) => setLanguage(e.target.value)}
							/>
							<input
								aria-label="Intent Playground"
								className={control}
								value={intent}
								onChange={(e) => setIntent(e.target.value)}
							/>
							<select
								aria-label="Тон"
								className={control}
								value={tone}
								onChange={(e) => setTone(e.target.value)}
							>
								{["neutral", "friendly", "formal", "concise"].map((t) => (
									<option key={t}>{t}</option>
								))}
							</select>
							<select
								aria-label="Режим Playground"
								className={control}
								value={preview ? "draft" : "production"}
								onChange={(e) => setPreview(e.target.value === "draft")}
							>
								<option value="production">Production</option>
								<option value="draft">Draft Preview</option>
							</select>
						</div>
						{preview && (
							<fieldset>
								<legend>Черновики для проверки</legend>
								{entries
									.filter((e) => e.status !== "archived" && e.kind !== "tests")
									.map((e) => (
										<label key={e.id} className="block text-sm">
											<input
												type="checkbox"
												checked={draftIds.includes(e.id)}
												onChange={(event) =>
													setDraftIds(
														event.target.checked
															? [...draftIds, e.id]
															: draftIds.filter((id) => id !== e.id),
													)
												}
											/>{" "}
											{e.title}
										</label>
									))}
							</fieldset>
						)}
						<button
							type="button"
							disabled={
								busy || !request.trim() || !can(user?.access, "ai.playground")
							}
							className={control}
							onClick={() => void run()}
						>
							{busy ? "Проверка…" : "Подготовить ответ"}
						</button>
					</div>
					<div>
						<h3>Ответ</h3>
						<p className="my-3 whitespace-pre-wrap">{answer}</p>
						{debug && (
							<details>
								<summary>Метаданные и Policy Guard</summary>
								<pre className="overflow-auto whitespace-pre-wrap text-xs">
									{JSON.stringify(debug, null, 2)}
								</pre>
							</details>
						)}
						{reviewed.length > 0 && (
							<button
								type="button"
								className={control}
								onClick={() => onSection(entry.kind as AISection)}
							>
								Вернуться к публикации
							</button>
						)}
					</div>
				</div>
			) : (
				<>
					{section === "projects" && (
						<p className="text-sm text-muted">
							Инструкции без выбранного проекта действуют глобально. Инструкции
							проекта дополняют их. Сохраните Draft и проверьте его в Playground
							перед публикацией.
						</p>
					)}
					<div className="grid items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
						<div className="space-y-2">
							<input
								aria-label="Поиск AI"
								className={`${control} w-full`}
								placeholder="Поиск"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							<button
								type="button"
								className={`${control} w-full`}
								onClick={() => setEntry(blank(section))}
							>
								Создать Draft
							</button>
							{entries
								.filter(
									(e) =>
										e.kind === section &&
										`${e.title} ${e.content}`
											.toLowerCase()
											.includes(search.toLowerCase()),
								)
								.map((e) => (
									<button
										type="button"
										key={e.id}
										className={`${control} block w-full text-left`}
										aria-pressed={entry.id === e.id}
										onClick={() => choose(e)}
									>
										{e.title}
										<small className="block text-muted">
											{e.status}
											{e.status === "draft" && e.published
												? " · предыдущая версия опубликована"
												: ""}
										</small>
									</button>
								))}
						</div>
						<form
							className="space-y-3"
							onSubmit={(e) => {
								e.preventDefault();
								void save("save");
							}}
						>
							<label className="block">
								Название / термин
								<input
									required
									className={`${control} block w-full`}
									value={entry.title}
									onChange={(e) => patch("title", e.target.value)}
								/>
							</label>
							<label className="block">
								{section === "tests"
									? "Тестовый запрос (без данных клиентов)"
									: section === "glossary"
										? "Предпочтительный перевод"
										: "Содержание / инструкции"}
								<textarea
									required
									maxLength={8000}
									className={`${control} block min-h-36 w-full`}
									value={entry.content}
									onChange={(e) => patch("content", e.target.value)}
								/>
							</label>
							<div className="grid gap-2 sm:grid-cols-2">
								<label>
									Проект
									<select
										className={`${control} block w-full`}
										value={entry.project}
										onChange={(e) => patch("project", e.target.value)}
									>
										<option value="">Все проекты</option>
										{projects.map((p) => (
											<option key={p.id} value={p.id}>
												{p.name}
											</option>
										))}
									</select>
								</label>
								{(
									[
										["language", "Язык"],
										["intent", "Intent"],
										["category", "Категория / контекст"],
									] as const
								).map(([key, label]) => (
									<label key={key}>
										{label}
										<input
											className={`${control} block w-full`}
											value={entry[key]}
											onChange={(e) => patch(key, e.target.value)}
										/>
									</label>
								))}
								<label>
									Приоритет
									<input
										type="number"
										min={0}
										max={100}
										className={`${control} block w-full`}
										value={entry.priority}
										onChange={(e) => patch("priority", Number(e.target.value))}
									/>
								</label>
								<label className="self-center">
									<input
										type="checkbox"
										checked={entry.enabled}
										onChange={(e) => patch("enabled", e.target.checked)}
									/>{" "}
									Включено
								</label>
							</div>
							{section === "tests" && (
								<>
									{(
										[
											["required", "Обязательные понятия"],
											["forbidden", "Запрещённые понятия"],
										] as const
									).map(([key, label]) => (
										<label key={key} className="block">
											{label} · по одному на строку
											<textarea
												className={`${control} block w-full`}
												value={entry[key].join("\n")}
												onChange={(e) => patch(key, e.target.value.split("\n"))}
											/>
										</label>
									))}
									<label className="block">
										Эталонный ответ
										<textarea
											className={`${control} block w-full`}
											value={entry.reference}
											onChange={(e) => patch("reference", e.target.value)}
										/>
									</label>
								</>
							)}
							{section === "rules" && (
								<fieldset>
									<legend>Связанные знания</legend>
									{entries
										.filter((e) => e.kind === "knowledge")
										.map((e) => (
											<label className="block text-sm" key={e.id}>
												<input
													type="checkbox"
													checked={entry.related.includes(e.id)}
													onChange={(event) =>
														patch(
															"related",
															event.target.checked
																? [...entry.related, e.id]
																: entry.related.filter((id) => id !== e.id),
														)
													}
												/>{" "}
												{e.title}
											</label>
										))}
								</fieldset>
							)}
							{entry.author && (
								<p className="text-xs text-muted">
									Автор: {entry.author} · {entry.updatedAt}
								</p>
							)}
							<div className="flex flex-wrap gap-2">
								<button
									disabled={busy || !query.data || !editable}
									type="submit"
									className={control}
								>
									Сохранить Draft
								</button>
								{entry.id && (
									<>
										<button
											type="button"
											className={control}
											onClick={() => {
												setPreview(true);
												setDraftIds([entry.id]);
												setRequest(entry.kind === "tests" ? entry.content : "");
												onSection("playground");
											}}
										>
											Playground
										</button>
										{can(user?.access, "ai.publish") && (
											<>
												<button
													type="button"
													disabled={
														busy ||
														!reviewed.includes(entry.id) ||
														reviewedVersion !== query.data?.version
													}
													title="Сначала проверьте сохранённый Draft в Playground"
													className={control}
													onClick={() => {
														if (
															window.confirm(
																"Опубликовать сохранённый Draft для Support? Несохранённые изменения не публикуются.",
															)
														)
															void save("publish");
													}}
												>
													Publish
												</button>
												<button
													type="button"
													disabled={busy}
													className={control}
													onClick={() => void save("archive")}
												>
													Архивировать
												</button>
											</>
										)}
										{!entry.published && (
											<button
												type="button"
												disabled={busy}
												className={control}
												onClick={() => void save("delete")}
											>
												Удалить Draft
											</button>
										)}
									</>
								)}
							</div>
						</form>
					</div>
					{section === "tests" && (
						<>
							<button
								type="button"
								className={control}
								disabled={busy}
								onClick={async () => {
									setBusy(true);
									setMessage("");
									const results = [];
									try {
										for (const test of entries
											.filter(
												(e) =>
													e.kind === "tests" &&
													e.enabled &&
													e.status !== "archived",
											)
											.slice(0, 20)) {
											const result = await generate(
												test.content,
												test.project,
												test.language,
												test.intent,
											);
											const { missing, forbidden, passed } = evaluateAIAnswer(
												result.text,
												test,
											);
											results.push({
												id: test.id,
												name: test.title,
												passed,
												missing,
												forbidden,
											});
											setTestResults([...results]);
										}
									} catch (error) {
										setMessage((error as Error).message);
									} finally {
										setBusy(false);
									}
								}}
							>
								Запустить до 20 тестов ·{" "}
								{preview ? "Draft Preview" : "Production"}
							</button>
							{testResults.map((result) => (
								<p key={result.id} className="text-sm">
									{result.name}: {result.passed ? "Passed" : "Failed"}{" "}
									{result.missing.length
										? `Не найдено: ${result.missing.join(", ")}`
										: ""}{" "}
									{result.forbidden.length
										? `Запрещено: ${result.forbidden.join(", ")}`
										: ""}
								</p>
							))}
						</>
					)}
				</>
			)}
		</div>
	);
}
