import { Link } from "@tanstack/react-router";
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
	reviews = [],
	projects,
	onCreate,
	kinds,
}: {
	feedback: FeedbackRecord[];
	reviews?: Array<{
		id: string;
		project_id: string;
		source_ids: string[];
		comment: string;
		answer_ref: string;
		actor_id: string;
		created_at: string;
		status: string;
	}>;
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
					className="ui-input section-select"
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
					className="ui-input section-select"
					value={rating}
					onChange={(event) => setRating(event.target.value)}
				>
					<option value="all">Все оценки</option>
					<option value="negative">Отрицательные</option>
					<option value="positive">Положительные</option>
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
			{reviews.length > 0 && (
				<section className="space-y-3" aria-label="Отзывы для проверки QC">
					<h3 className="font-semibold">Отзывы для проверки QC</h3>
					{reviews.map((review) => (
						<article
							key={review.id}
							className="rounded-xl border border-border bg-surface p-4 space-y-2"
						>
							<p className="text-sm">
								<strong>Проблема:</strong> {review.comment} ·{" "}
								{name(review.project_id)}
							</p>
							<p className="text-xs text-muted">
								{review.created_at} · reference:{" "}
								{review.answer_ref.slice(0, 12)}
							</p>
							{review.source_ids.length > 0 && (
								<div className="ui-actions flex flex-wrap gap-2">
									{review.source_ids.map((id) => (
										<Link
											key={id}
											to="/"
											hash={`bind=${encodeURIComponent(id)}`}
											className="ui-button ui-button--secondary ui-button--small"
										>
											Открыть источник
										</Link>
									))}
								</div>
							)}
						</article>
					))}
				</section>
			)}
			{[...scoped]
				.reverse()
				.filter((item) => rating === "all" || item.rating === rating)
				.map((item) => (
					<article
						key={`${new Date(item.createdAt).toLocaleString("ru")}-${item.project}-${item.language}-${item.rating}-${item.reason}`}
						className="rounded-xl border border-border bg-surface p-4 space-y-3"
					>
						<p className="text-sm">
							{item.rating === "positive"
								? "Положительная оценка"
								: `Отрицательная оценка${item.reason ? `: ${item.reason}` : ""}`}{" "}
							· {name(item.project)} · {item.language}
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
