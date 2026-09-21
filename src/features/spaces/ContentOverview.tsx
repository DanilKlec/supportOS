import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { sharedBindsService } from "@/services/shared-binds.service";
import { getBindTitle } from "@/shared/lib/bind-search";
import { getKnowledgeHealthReport } from "@/shared/lib/knowledge-health";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { can, canAccessPage } from "../../../shared/access.js";
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
		{
			title: "Не копировались более 90 дней",
			rows: active
				.filter(
					(b) =>
						b.lastCopiedAt &&
						Date.parse(b.lastCopiedAt) < Date.now() - 90 * 86400000,
				)
				.slice(0, 8),
		},
	];
	return (
		<div className="supportos-page-scroll min-h-0 flex-1 overflow-auto py-4 sm:py-6">
			<h1 className="mb-2 text-2xl font-semibold">Обзор контента</h1>
			<p className="mb-4 text-sm text-muted">
				Обзор загруженной рабочей библиотеки. Предложения поступают из общей
				базы команды.
			</p>
			<div className="content-stats grid gap-3 sm:grid-cols-2">
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
				]
					.filter((c) => canAccessPage(user?.access, c.to))
					.map((c) => (
						<Link
							className="rounded-xl border border-border p-4 hover:bg-surface-elevated"
							to={c.to}
							key={c.label}
						>
							<span className="block text-sm">{c.label}</span>
							<strong className="block py-2 text-2xl">{c.value}</strong>
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
								type="button"
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
			{!active.length ? (
				<section className="my-6 rounded-xl border border-border bg-surface p-6">
					<h2 className="font-semibold">Библиотека пока пуста</h2>
					<p className="mt-2 text-sm text-muted">
						Здесь появятся последние изменения и часто используемые материалы.
					</p>
					<Link className="space-tab mt-4" to="/">
						Перейти к биндам
					</Link>
				</section>
			) : (
				<div className="grid gap-6 pt-4 lg:grid-cols-2">
					{lists
						.filter((list, index) => index < 2 || list.rows.length > 0)
						.map((list) => (
							<section
								key={list.title}
								className="min-w-0 rounded-xl border border-border bg-surface p-4"
							>
								<h2 className="mb-2 font-semibold">{list.title}</h2>
								{!list.rows.length ? (
									<p className="py-4 text-sm text-muted">
										Подходящих материалов нет.
									</p>
								) : (
									list.rows.map((b) => (
										<button
											type="button"
											key={b.id}
											onClick={() => {
												openBind(b.id);
												void navigate({ to: "/" });
											}}
											className="flex w-full items-center justify-between gap-3 border-b border-border/50 py-3 text-left text-sm"
										>
											<span className="truncate">
												{getBindTitle(b, language)}
											</span>
										</button>
									))
								)}
							</section>
						))}
				</div>
			)}
			<p className="mt-6 text-xs text-muted">
				Сообщения «Не нашёл нужный ответ» доступны в разделе качества. Счётчики
				копирования относятся к этой библиотеке.
			</p>
		</div>
	);
}
