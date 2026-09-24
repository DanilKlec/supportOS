import { useState } from "react";
import { authenticatedFetch } from "@/services/authenticated-fetch";
export function AIFeedback({
	project,
	language,
}: {
	project?: string;
	language: string;
}) {
	const [negative, setNegative] = useState(false),
		[reason, setReason] = useState("Неверная информация"),
		[busy, setBusy] = useState(false),
		[sent, setSent] = useState(false),
		[error, setError] = useState("");
	const submit = async (rating: string) => {
		setBusy(true);
		setError("");
		try {
			const response = await authenticatedFetch("/api/ai/knowledge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "feedback",
					rating,
					reason,
					project,
					language,
				}),
			});
			if (!response.ok) throw new Error("Не удалось отправить оценку");
			setSent(true);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	if (sent)
		return (
			<output className="block text-xs text-muted">
				Спасибо, оценка отправлена.
			</output>
		);
	return (
		<div className="space-y-2">
			<div className="ui-actions items-center flex gap-2">
				<button
					type="button"
					aria-label="Полезный ответ AI"
					disabled={busy}
					onClick={() => void submit("positive")}
					className="min-h-10 px-3"
				>
					👍
				</button>
				<button
					type="button"
					aria-label="Проблема с ответом AI"
					disabled={busy}
					onClick={() => setNegative(!negative)}
					className="min-h-10 px-3"
				>
					👎
				</button>
			</div>
			{negative && (
				<div className="ui-actions items-center flex flex-wrap gap-2">
					<select
						aria-label="Причина оценки AI"
						className="ui-input border border-border bg-background"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					>
						{[
							"Неверная информация",
							"Не тот язык",
							"Слишком длинно",
							"Не учтена policy",
							"Не найден материал",
							"Другое",
						].map((r) => (
							<option key={r}>{r}</option>
						))}
					</select>
					<button
						type="button"
						disabled={busy}
						className="min-h-10 px-3 text-sm"
						onClick={() => void submit("negative")}
					>
						Отправить
					</button>
					<p className="text-xs text-muted">
						Текст переписки не отправляется вместе с оценкой.
					</p>
				</div>
			)}
			{error && (
				<p role="alert" className="text-sm">
					{error}
				</p>
			)}
		</div>
	);
}
