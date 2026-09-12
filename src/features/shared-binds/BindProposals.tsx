import { BindDiff } from "./BindDiff";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { sharedBindsService } from "@/services/shared-binds.service";
import { can } from "../../../shared/access.js";

export function BindProposals({
	sourceId,
	mineOnly = false,
}: {
	sourceId?: string;
	mineOnly?: boolean;
}) {
	const user = useAuthStore((s) => s.session?.user);
	const client = useQueryClient();
	const review = can(user?.access, "knowledge.write");
	const proposals = useQuery({
		queryKey: ["bind-proposals", user?.id, sourceId],
		queryFn: () => sharedBindsService.proposals(sourceId),
		refetchInterval: 30000,
	});
	const sources = useQuery({
		queryKey: ["shared-binds", user?.id],
		queryFn: () => sharedBindsService.list(),
	});
	const [busy, setBusy] = useState(""),
		[error, setError] = useState("");
	const resolve = async (action: string, id: string) => {
		setBusy(id);
		setError("");
		try {
			await sharedBindsService.branchAction(action, { proposalId: id });
			await Promise.all([
				client.invalidateQueries({ queryKey: ["bind-proposals"] }),
				client.invalidateQueries({ queryKey: ["proposal-results"] }),
				client.invalidateQueries({ queryKey: ["shared-binds"] }),
				client.invalidateQueries({ queryKey: ["bind-history"] }),
			]);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy("");
		}
	};
	return (
		<section className="rounded-2xl border border-border bg-surface p-4">
			<h2 className="text-sm font-semibold">
				{review ? "Предложения в основную ветку" : "Мои предложения команде"}{" "}
				<span className="text-muted">
					{proposals.data
						? proposals.data.filter(
								(p) => !mineOnly || p.author_id === user?.id,
							).length
						: "—"}
				</span>
			</h2>
			{(error || proposals.error) && (
				<p role="alert" className="mt-3 text-sm text-red-400">
					{error || proposals.error?.message}
				</p>
			)}
			{proposals.isPending && (
				<p className="mt-3 text-sm text-muted">Загрузка предложений…</p>
			)}
			{proposals.data?.filter((p) => !mineOnly || p.author_id === user?.id)
				.length === 0 && (
				<p className="mt-2 text-xs text-muted">
					Нет предложений, ожидающих проверки.
				</p>
			)}
			{proposals.data
				?.filter((p) => !mineOnly || p.author_id === user?.id)
				.map((p) => {
					const base = sources.data?.find((b) => b.id === p.source_id);
					return (
						<details
							key={p.id}
							className="mt-3 rounded-xl border border-border p-3"
						>
							<summary className="cursor-pointer text-sm">
								{p.translations[0]?.title}{" "}
								<span className="text-xs text-muted">
									· {p.author} ·{" "}
									{new Date(p.created_at).toLocaleDateString("ru")}
								</span>
							</summary>
							<div className="mt-3">
								{base ? (
									<BindDiff
										before={{
											translations: base.translations,
											tags: base.tags,
										}}
										after={p}
									/>
								) : (
									<p className="text-sm text-muted">
										Общая версия недоступна для сравнения.
									</p>
								)}
							</div>
							<div className="mt-3 flex flex-wrap gap-2">
								{review && (
									<>
										<button
											disabled={!!busy || !base}
											type="button"
											onClick={() => void resolve("accept", p.id)}
											className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground"
										>
											Опубликовать в основной
										</button>
										<button
											disabled={!!busy}
											type="button"
											onClick={() => void resolve("reject", p.id)}
											className="rounded-lg border border-border px-3 py-2 text-sm"
										>
											Отклонить
										</button>
									</>
								)}
								{p.author_id === user?.id && (
									<button
										disabled={!!busy}
										type="button"
										onClick={() => void resolve("withdraw", p.id)}
										className="rounded-lg border border-border px-3 py-2 text-sm"
									>
										Отозвать предложение
									</button>
								)}
							</div>
						</details>
					);
				})}
		</section>
	);
}
