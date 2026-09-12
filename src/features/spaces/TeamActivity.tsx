import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accessApi } from "@/features/accounts/AccountsPanel";
import { sharedBindsService } from "@/services/shared-binds.service";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { workDay } from "@/features/agent-monitor/live-model";
export function TeamActivity() {
	const user = useAuthStore((s) => s.session?.user);
	const [filter, setFilter] = useState("all");
	const audit = useQuery({
		queryKey: ["team-audit", user?.id],
		enabled: can(user?.access, "users.manage"),
		queryFn: () => accessApi("audit"),
	});
	const content = useQuery({
		queryKey: ["proposal-results", user?.id],
		enabled: can(user?.access, "binds.read"),
		queryFn: () => sharedBindsService.proposalResults(),
	});
	const monitor = useQuery({
		queryKey: ["team-events", user?.id],
		enabled: can(user?.access, "monitor.read"),
		queryFn: async () => {
			const r = await authenticatedFetch(
				"/api/agent-monitor?action=data&day=" + workDay(),
			);
			const d = await r.json();
			if (!r.ok) throw new Error(d.error ?? "Мониторинг недоступен");
			return d;
		},
	});
	const sources = [
		{
			id: "access",
			label: "Доступы",
			query: audit,
			allowed: can(user?.access, "users.manage"),
		},
		{
			id: "content",
			label: "Контент",
			query: content,
			allowed: can(user?.access, "binds.read"),
		},
		{
			id: "monitor",
			label: "Мониторинг",
			query: monitor,
			allowed: can(user?.access, "monitor.read"),
		},
	].filter((s) => s.allowed && (filter === "all" || filter === s.id));
	return (
		<>
			<nav
				className="flex gap-1 overflow-auto mb-4"
				aria-label="Фильтр активности"
			>
				{[
					["all", "Все"],
					["access", "Доступы"],
					["content", "Контент"],
					["monitor", "Мониторинг"],
				].map(([id, label]) => (
					<button
						className="space-tab"
						key={id}
						aria-pressed={filter === id}
						onClick={() => setFilter(id)}
					>
						{label}
					</button>
				))}
			</nav>
			{sources.map((s) => (
				<section className="mb-6" key={s.id}>
					<h2 className="font-semibold mb-2">{s.label}</h2>
					{s.query.isPending ? (
						<p>Загрузка событий…</p>
					) : s.query.error ? (
						<p role="alert">
							Не удалось загрузить события.{" "}
							<button
								className="underline"
								onClick={() => void s.query.refetch()}
							>
								Повторить
							</button>
						</p>
					) : (
						<ActivityRows kind={s.id} data={s.query.data} />
					)}
				</section>
			))}
		</>
	);
}
function ActivityRows({ kind, data }: { kind: string; data: any }) {
	const rows: any[] =
		kind === "content"
			? (data ?? [])
			: kind === "access"
				? (data?.rows ?? [])
				: (data?.audit ?? []);
	return rows.length ? (
		<ul className="divide-y divide-border">
			{rows.map((r, i) => (
				<li className="py-3 text-sm" key={r.id ?? i}>
					<span>
						{kind === "content"
							? r.title
							: kind === "access"
								? r.actor_label
								: r.agent_id}{" "}
						· {r.action ?? r.operation ?? r.status ?? r.type ?? "Событие"}
					</span>
					<time className="block text-xs text-muted">
						{r.created_at ?? r.resolvedAt ?? r.at}
					</time>
				</li>
			))}
		</ul>
	) : (
		<p className="py-4 text-sm text-muted">В доступном журнале нет событий.</p>
	);
}
