import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { sharedBindsService } from "@/services/shared-binds.service";
import { getKnowledgeHealthReport } from "@/shared/lib/knowledge-health";
import { getBindTitle } from "@/shared/lib/bind-search";
import { can } from "../../../shared/access.js";
export function ContentOverview() {
	const { binds, categories, folders, language, openBind } =
		useKnowledgeStore();
	const user = useAuthStore((s) => s.session?.user);
	const navigate = useNavigate();
	const proposals = useQuery({
		queryKey: ["bind-proposals", user?.id, undefined],
		queryFn: () => sharedBindsService.proposals(),
		enabled: can(user?.access, "knowledge.write"),
	});
	const report = getKnowledgeHealthReport({ binds, categories, folders });
	const active = binds.filter((b) => !b.archived);
	const stale = active.filter(
		(b) => Date.parse(b.updatedAt) < Date.now() - 90 * 86400000,
	);
	const lists = [
		{
			title: "Последние изменения",
			rows: [...active]
				.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
				.slice(0, 8),
		},
		{
			title: "Часто используемые",
			rows: [...active]
				.filter((b) => (b.copyCount ?? 0) > 0)
				.sort((a, b) => (b.copyCount ?? 0) - (a.copyCount ?? 0))
				.slice(0, 8),
		},
		{
			title: "Нет зарегистрированных копирований",
			rows: active.filter((b) => !(b.copyCount ?? 0)).slice(0, 8),
		},
		{ title: "Не обновлялись более 90 дней", rows: stale.slice(0, 8) },
	];
	return (
		<div className="supportos-scroll min-h-0 flex-1 overflow-auto p-4 md:p-6">
			<p className="mb-4 text-sm text-muted">
				Обзор загруженной рабочей библиотеки. Предложения поступают из общей
				базы команды.
			</p>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{[
					{ label: "Материалы", value: active.length, to: "/" },
					{
						label: "Проблемы качества",
						value: report.issues.length,
						to: "/health",
					},
					{
						label: "Нет переводов",
						value: report.stats.missingTranslations,
						to: "/health",
					},
					{ label: "Архив", value: report.stats.archivedBinds, to: "/archive" },
				].map((c) => (
					<Link
						className="rounded-xl border border-border p-4 hover:bg-surface-elevated"
						to={c.to}
						key={c.label}
					>
						<span className="block text-sm">{c.label}</span>
						<strong className="block py-2 text-2xl">{c.value}</strong>
						<span className="text-sm text-accent">Открыть →</span>
					</Link>
				))}
			</div>
			{can(user?.access, "knowledge.write") && (
				<section className="my-5 border-b border-border py-4">
					<h2 className="font-semibold">Предложения на проверку</h2>
					{proposals.isPending ? (
						<p>Загрузка…</p>
					) : proposals.error ? (
						<p role="alert">
							Не удалось загрузить предложения.{" "}
							<button
								onClick={() => void proposals.refetch()}
								className="underline"
							>
								Повторить
							</button>
						</p>
					) : (
						<Link to="/shared-binds" hash="proposals" className="text-accent">
							{proposals.data?.length
								? proposals.data.length + " предложений — открыть"
								: "Все изменения обработаны — открыть предложения"}
						</Link>
					)}
				</section>
			)}
			<div className="grid gap-6 pt-4 lg:grid-cols-2">
				{lists.map((list) => (
					<section key={list.title}>
						<h2 className="mb-2 font-semibold">{list.title}</h2>
						{!list.rows.length ? (
							<p className="py-4 text-sm text-muted">
								Подходящих материалов нет.
							</p>
						) : (
							list.rows.map((b) => (
								<button
									key={b.id}
									onClick={() => {
										openBind(b.id);
										void navigate({ to: "/" });
									}}
									className="flex w-full items-center justify-between gap-3 border-b border-border/50 py-3 text-left text-sm"
								>
									<span className="truncate">{getBindTitle(b, language)}</span>
									<span className="shrink-0 text-accent">Открыть →</span>
								</button>
							))
						)}
					</section>
				))}
			</div>
			<p className="mt-6 text-xs text-muted">
				История поисков без результатов и время последнего использования пока не
				собираются. Счётчики копирования относятся к этой библиотеке.
			</p>
		</div>
	);
}
