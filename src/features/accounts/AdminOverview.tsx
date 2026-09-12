import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/store/auth.store";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { sharedBindsService } from "@/services/shared-binds.service";
import { can } from "../../../shared/access.js";
import { BindProposals } from "@/features/shared-binds/BindProposals";
export interface OverviewUser {
	id: string;
	email: string;
	display_name: string;
	status: string;
	roles: string[];
	version: number;
}
export function needsAccess(user: OverviewUser) {
	return (
		user.status === "pending" ||
		(user.status === "active" && user.roles.length === 0)
	);
}
async function get(path: string, signal?: AbortSignal) {
	const r = await authenticatedFetch(path, { signal });
	const data = await r.json();
	if (!r.ok) throw new Error(data.error ?? "Не удалось получить данные");
	return data;
}
export function AdminOverview({
	onUser,
	onAudit,
}: {
	onUser: (user: OverviewUser) => void;
	onAudit: () => void;
}) {
	const user = useAuthStore((s) => s.session?.user);
	const access = user?.access;
	const navigate = useNavigate();
	const accounts = useQuery({
		queryKey: ["admin-overview-users", user?.id],
		enabled: can(access, "users.manage"),
		staleTime: 30000,
		queryFn: async ({ signal }) => {
			const users: OverviewUser[] = [];
			let total = 0;
			for (let page = 1; page <= 20; page++) {
				const data = await get(
					"/api/accounts?action=users&page=" + page,
					signal,
				);
				total = data.total;
				users.push(...data.users);
				if (users.length >= total || !data.users.length) break;
			}
			return {
				users: [...new Map(users.map((u) => [u.id, u])).values()],
				total,
			};
		},
	});
	const proposals = useQuery({
		queryKey: ["bind-proposals", user?.id, undefined],
		enabled: can(access, "knowledge.write"),
		queryFn: () => sharedBindsService.proposals(),
		staleTime: 30000,
	});
	const ai = useQuery({
		queryKey: ["admin-overview-ai", user?.id],
		enabled: can(access, "tools"),
		queryFn: ({ signal }) => get("/api/ai/status", signal),
		staleTime: 30000,
	});
	const monitor = useQuery({
		queryKey: ["admin-overview-monitor", user?.id],
 refetchInterval:30000,
		enabled: can(access, "monitor.read"),
		queryFn: ({ signal }) =>
			get(
				"/api/agent-monitor?action=data&day=" +
					new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10),
				signal,
			),
		staleTime: 30000,
	});
	if (!can(access, "users.manage")) return null;
	const pending = accounts.data?.users.filter(needsAccess) ?? [];
	const incomplete =
		accounts.data && accounts.data.users.length < accounts.data.total;
	const lastSync = monitor.data?.lastSync;
	const recent =
		lastSync &&
		Number.isFinite(Date.parse(lastSync)) &&
		Date.now() - Date.parse(lastSync) < 120000;
	return (
		<div className="space-y-5">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">Обзор администратора</h2>
					<p className="mt-1 text-xs text-muted">
						Доступы, проверка контента и состояние сервисов
					</p>
				</div>
				<button
					type="button"
					className="rounded-xl border border-border px-3 py-2 text-xs"
					onClick={() => {
						void accounts.refetch();
						if (can(access, "knowledge.write")) void proposals.refetch();
						if (can(access, "tools")) void ai.refetch();
						if (can(access, "monitor.read")) void monitor.refetch();
					}}
				>
					Обновить обзор
				</button>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				{[
					{
						title: "Пользователей",
						value: accounts.error
							? "Недоступно"
							: (accounts.data?.total ?? "…"),
					},
					{
						title: incomplete
							? "Без доступа среди загруженных"
							: "Ожидают доступа",
						value: accounts.error
							? "Недоступно"
							: accounts.data
								? pending.length
								: "…",
					},
					...(can(access, "knowledge.write")
						? [
								{
									title: "Предложений на проверку",
									value: proposals.error
										? "Недоступно"
										: (proposals.data?.length ?? "…"),
								},
							]
						: []),
				].map((c) => (
					<div
						key={c.title}
						className="rounded-2xl border border-border bg-background p-4"
					>
						<p className="text-xs text-muted">{c.title}</p>
						<p className="mt-3 text-2xl font-semibold">{c.value}</p>
					</div>
				))}
			</div>
			<section className="rounded-2xl border border-border p-4">
				<h3 className="mb-3 font-semibold">Нужно выдать доступ</h3>
				{accounts.error && (
					<p role="alert" className="text-sm text-red-400">
						{accounts.error.message}
					</p>
				)}
				{incomplete && (
					<p className="mb-3 text-xs text-amber-400">
						Загружено {accounts.data?.users.length} из {accounts.data?.total}.
						Полный список доступен во вкладке пользователей.
					</p>
				)}
				{accounts.isPending && <p className="text-sm text-muted">Загрузка…</p>}
				{!accounts.error && accounts.data && !pending.length && (
					<p className="text-sm text-muted">
						В загруженном списке нет аккаунтов, ожидающих доступа.
					</p>
				)}
				<div className="max-h-72 divide-y divide-border overflow-auto">
					{pending.map((u) => (
						<div
							key={u.id}
							className="flex items-center justify-between gap-3 py-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm">{u.display_name || u.email}</p>
								<p className="truncate text-xs text-muted">{u.email}</p>
							</div>
							<button
								type="button"
								onClick={() => onUser(u)}
								className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs"
							>
								Настроить доступ
							</button>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={onAudit}
					className="mt-3 text-xs underline underline-offset-4"
				>
					Журнал изменений ролей и доступов
				</button>
			</section>
			<section className="rounded-2xl border border-border p-4">
				<h3 className="mb-3 font-semibold">Интеграции</h3>
				<div className="grid gap-3 sm:grid-cols-2">
					{can(access, "tools") && (
						<div className="rounded-xl bg-background p-4">
							<h4 className="text-sm">ИИ</h4>
							<p className="mt-2 text-xs text-muted">
								{ai.error
									? ai.error.message
									: ai.isPending
										? "Проверка…"
										: ai.data?.configured
											? "Ключ настроен · " + ai.data.provider
											: "Ключ не настроен"}
							</p>
							<p className="mt-2 text-xs text-muted">
								Проверка конфигурации, без тестового запроса к модели.
							</p>
						</div>
					)}
					{can(access, "monitor.read") && (
						<div className="rounded-xl bg-background p-4">
							<h4 className="text-sm">LiveChat</h4>
							<p className="mt-2 text-xs text-muted">
								{monitor.error
									? monitor.error.message
									: monitor.isPending
										? "Проверка…"
										: recent
											? "Есть недавний успешный опрос"
											: "Нет свежего подтверждения связи"}
							</p>
							{lastSync && (
								<p className="mt-2 text-xs text-muted">
									Последний опрос: {new Date(lastSync).toLocaleString("ru")}
								</p>
							)}
							<button
								type="button"
								onClick={() => void navigate({ to: "/agent-monitor" })}
								className="mt-3 text-xs underline"
							>
								Открыть мониторинг
							</button>
						</div>
					)}
				</div>
			</section>
			{can(access, "knowledge.write") && <BindProposals />}
		</div>
	);
}
