import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BindProposals } from "@/features/shared-binds/BindProposals";
import { sharedBindsService } from "@/services/shared-binds.service";
import { useAuthStore } from "@/store/auth.store";
export function ProposalWorkflow() {
	const [mode, setMode] = useState("pending");
	const user = useAuthStore((s) => s.session?.user);
	const results = useQuery({
		queryKey: ["proposal-results", user?.id],
		queryFn: () => sharedBindsService.proposalResults(),
	});
	return (
		<>
			<nav
				aria-label="Статус предложений"
				className="flex overflow-auto gap-1 mb-4"
			>
				{[
					["pending", "На проверке"],
					["accepted", "Принятые"],
					["rejected", "Отклонённые"],
					["mine", "Мои"],
				].map(([id, label]) => (
					<button
						key={id}
						className="space-tab"
						aria-pressed={mode === id}
						onClick={() => setMode(id)}
					>
						{label}
					</button>
				))}
			</nav>
			{mode === "pending" || mode === "mine" ? (
				<BindProposals mineOnly={mode === "mine"} />
			) : (
				<>
					<p className="mb-3 text-xs text-muted">
						Результаты ваших предложений, доступные в журнале.
					</p>
					{results.isPending ? (
						<p>Загрузка…</p>
					) : results.error ? (
						<p role="alert">
							Не удалось загрузить результаты.{" "}
							<button onClick={() => void results.refetch()}>Повторить</button>
						</p>
					) : results.data?.filter((r) => r.status === mode).length ? (
						<ul>
							{results.data
								.filter((r) => r.status === mode)
								.map((r) => (
									<li className="border-b border-border py-3" key={r.id}>
										{r.title}
										<time className="block text-xs text-muted">
											{new Date(r.resolvedAt).toLocaleString("ru")}
										</time>
									</li>
								))}
						</ul>
					) : (
						<p className="p-4 text-muted">В этом статусе предложений нет.</p>
					)}
				</>
			)}
		</>
	);
}
