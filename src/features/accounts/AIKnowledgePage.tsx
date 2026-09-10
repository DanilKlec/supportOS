import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/services/authenticated-fetch";
export function AIKnowledgePage() {
	const [content, setContent] = useState("");
	const [ready, setReady] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	useEffect(() => {
		const abort = new AbortController();
		void (async () => {
			try {
				const response = await authenticatedFetch("/api/ai/knowledge", {
					signal: abort.signal,
				});
				const data = await response.json();
				if (!response.ok) throw new Error(data.error);
				setContent(data.content);
				setReady(true);
			} catch (e) {
				if (!abort.signal.aborted)
					setMessage(
						e instanceof Error ? e.message : "Не удалось загрузить правила",
					);
			}
		})();
		return () => abort.abort();
	}, []);
	return (
		<main className="mx-auto max-w-4xl space-y-4 p-6">
			<h1 className="text-2xl font-semibold">Правила и примеры ответов ИИ</h1>
			<p>
				Добавьте проверенные правила поддержки и примеры правильных ответов.
				Генератор будет учитывать их в следующих ответах. Это общая база
				инструкций, а не переобучение модели.
			</p>
			<textarea
				aria-label="Правила ИИ"
				className="min-h-96 w-full rounded border border-border bg-surface p-4"
				maxLength={16000}
				value={content}
				disabled={!ready || busy}
				onChange={(e) => setContent(e.target.value)}
			/>
			<p>{content.length} / 16 000</p>
			<button
				className="rounded border border-border p-3 disabled:opacity-40"
				disabled={!ready || busy}
				onClick={async () => {
					setBusy(true);
					setMessage("");
					try {
						const response = await authenticatedFetch("/api/ai/knowledge", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ content }),
						});
						const data = await response.json();
						if (!response.ok) throw new Error(data.error);
						setMessage("Правила сохранены");
					} catch (e) {
						setMessage(e instanceof Error ? e.message : "Не удалось сохранить");
					} finally {
						setBusy(false);
					}
				}}
			>
				Сохранить общие правила
			</button>
			{message && <p role="status">{message}</p>}
		</main>
	);
}
