import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "@/services/authenticated-fetch";

type Request = {
	id: string;
	user_id: string;
	telegram_id: number;
	telegram_username?: string;
	user?: { email: string; display_name: string };
};
export function TelegramLinkRequests() {
	const [rows, setRows] = useState<Request[]>([]),
		[error, setError] = useState(""),
		[busy, setBusy] = useState(false);
	const load = useCallback(async () => {
		try {
			const r = await authenticatedFetch("/api/accounts?action=telegram-links");
			const d = await r.json();
			if (!r.ok) throw new Error(d.error);
			setRows(d.requests ?? []);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Ошибка загрузки");
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	async function review(row: Request, approve: boolean) {
		if (
			!window.confirm(
				`${approve ? "Одобрить" : "Отклонить"} привязку Telegram ${row.telegram_username ? "@" + row.telegram_username : row.telegram_id} к ${row.user?.email ?? row.user_id}? Сверьте личность сотрудника по доверенному каналу.`,
			)
		)
			return;
		setBusy(true);
		setError("");
		try {
			const r = await authenticatedFetch(
				"/api/accounts?action=telegram-links",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id: row.id, approve }),
				},
			);
			const d = await r.json();
			if (!r.ok) throw new Error(d.error);
			await load();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Ошибка проверки");
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="mb-6 rounded-2xl border border-border bg-surface p-5">
			<div className="flex items-center justify-between gap-4">
				<h2 className="font-semibold">Привязки Telegram · {rows.length}</h2>
				<button
					type="button"
					onClick={() => void load()}
					disabled={busy}
					className="text-sm text-blue-500"
				>
					Обновить
				</button>
			</div>
			<p className="my-3 text-sm text-muted">
				Первая привязка старого аккаунта. Перед одобрением сверьте Telegram с
				сотрудником.
			</p>
			{error && (
				<p role="alert" className="text-red-500">
					{error}
				</p>
			)}
			{rows.map((row) => (
				<div
					key={row.id}
					className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3"
				>
					<span className="mr-auto">
						{row.user?.display_name || row.user?.email || row.user_id} ·{" "}
						{row.telegram_username
							? "@" + row.telegram_username
							: "без username"}{" "}
						· ID {row.telegram_id}
					</span>
					<button
						type="button"
						disabled={busy}
						onClick={() => void review(row, true)}
						className="rounded-lg bg-blue-600 px-3 py-2 text-white"
					>
						Одобрить
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => void review(row, false)}
						className="rounded-lg border border-border px-3 py-2"
					>
						Отклонить
					</button>
				</div>
			))}
		</section>
	);
}
