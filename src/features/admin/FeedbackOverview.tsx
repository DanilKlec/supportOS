import { useState } from "react";
export type FeedbackRecord = {
	rating: string;
	reason: string;
	project: string;
	language: string;
	createdAt: string;
};
export function FeedbackOverview({
	feedback,
	projects,
	onCreate,
	kinds,
}: {
	feedback: FeedbackRecord[];
	projects: { id: string; name: string }[];
	onCreate: (
		kind: "knowledge" | "rules" | "tests",
		feedback: FeedbackRecord,
	) => void;
	kinds: ("knowledge" | "rules" | "tests")[];
}) {
	const [project, setProject] = useState("");
	const [rating, setRating] = useState("all");
	const scoped = feedback.filter(
		(item) => !project || item.project === project,
	);
	const positive = scoped.filter((item) => item.rating === "positive").length;
	const reasons = [
		...new Set(
			scoped
				.filter((item) => item.rating === "negative")
				.map((item) => item.reason),
		),
	]
		.map((reason) => ({
			reason,
			count: scoped.filter(
				(item) => item.rating === "negative" && item.reason === reason,
			).length,
		}))
		.sort((a, b) => b.count - a.count);
	const name = (id: string) =>
		projects.find((item) => item.id === id)?.name || id || "Все проекты";
	return (
		<div className="space-y-4">
			<p className="text-xs text-muted">
				Доступны последние {feedback.length} оценок (хранилище сохраняет до
				100). Показатели относятся только к этой выборке.
			</p>
			<div className="ui-actions flex flex-wrap">
				<select
					aria-label="Проект обратной связи"
					className="section-select"
					value={project}
					onChange={(event) => setProject(event.target.value)}
				>
					<option value="">Все проекты</option>
					{[
						...new Set(feedback.map((item) => item.project).filter(Boolean)),
					].map((id) => (
						<option key={id} value={id}>
							{name(id)}
						</option>
					))}
				</select>
				<select
					aria-label="Тип оценки"
					className="section-select"
					value={rating}
					onChange={(event) => setRating(event.target.value)}
				>
					<option value="all">Все оценки</option>
					<option value="negative">Проблемы</option>
					<option value="positive">Полезные ответы</option>
				</select>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				{[
					["Оценок", scoped.length],
					["Полезных ответов", positive],
					["Проблем", scoped.length - positive],
				].map(([label, value]) => (
					<div
						key={label}
						className="rounded-xl border border-border bg-surface p-4"
					>
						<p className="text-xs text-muted">{label}</p>
						<strong className="text-2xl">{value}</strong>
					</div>
				))}
			</div>
			{reasons.length > 0 && (
				<section className="rounded-xl border border-border bg-surface p-4">
					<h3 className="font-semibold mb-2">
						Что исправлять в первую очередь
					</h3>
					{reasons.map((item) => (
						<p key={item.reason} className="flex justify-between py-2 text-sm">
							<span>{item.reason}</span>
							<strong>{item.count}</strong>
						</p>
					))}
				</section>
			)}
			{!scoped.length && (
				<p className="text-sm text-muted">
					Оценок пока нет. Они появятся после использования помощника
					операторами.
				</p>
			)}
			{[...scoped]
				.reverse()
				.filter((item) => rating === "all" || item.rating === rating)
				.map((item) => (
					<article
						key={`${item.createdAt}-${item.project}-${item.language}-${item.rating}-${item.reason}`}
						className="rounded-xl border border-border bg-surface p-4 space-y-3"
					>
						<p className="text-sm">
							{item.rating === "positive" ? "Полезный ответ" : item.reason} ·{" "}
							{name(item.project)} · {item.language}
						</p>
						<p className="text-xs text-muted">{item.createdAt}</p>
						{item.rating === "negative" && (
							<div className="ui-actions flex flex-wrap">
								{kinds.map((kind) => (
									<button
										key={kind}
										type="button"
										className="ui-button ui-button--secondary ui-button--small"
										onClick={() => onCreate(kind, item)}
									>
										Создать{" "}
										{kind === "knowledge"
											? "материал"
											: kind === "rules"
												? "правило"
												: "тест"}
									</button>
								))}
							</div>
						)}
					</article>
				))}
		</div>
	);
}
