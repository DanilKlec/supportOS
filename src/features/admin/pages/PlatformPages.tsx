import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { OverviewUser } from "@/features/accounts/AdminOverview";
import {
	readOperation,
	useAccounts,
	useAIRuntime,
	useAIStatus,
	useCatalog,
} from "@/features/operations/data";
import {
	Badge,
	Panel,
	QueryState,
	Row,
	Unavailable,
} from "@/features/operations/OperationsWorkspace";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { can, canAccessPage, canTrain } from "../../../../shared/access.js";

export function IntegrationsPage() {
	const user = useAuthStore((s) => s.session?.user),
		configured = useAuthStore((s) => s.configured);
	const ai = useAIStatus();
	const monitor = useQuery({
		queryKey: ["ops-monitor", user?.id],
		enabled: can(user?.access, "monitor.read"),
		queryFn: ({ signal }) =>
			readOperation<{ lastSync?: string }>(
				`/api/agent-monitor?action=data&day=${new Date(Date.now() - 21600000).toISOString().slice(0, 10)}`,
				signal,
			),
		staleTime: 30000,
	});
	const canReadAI = can(user?.access, "tools");
	const canReadMonitor = can(user?.access, "monitor.read");
	const canManageIntegrations = can(user?.access, "technical");
	const showAI =
		canReadAI && (ai.isPending || Boolean(ai.error) || Boolean(ai.data?.configured));
	const showMonitor =
		canReadMonitor &&
		(monitor.isPending || Boolean(monitor.error) || Boolean(monitor.data?.lastSync));
	if (!showAI && !showMonitor && !configured && !canManageIntegrations) return null;
	return (
		<Panel title="Подключения">
			{showAI && (
				<Row
					title="Провайдер AI"
					detail="Проверка конфигурации, не тестовый запрос к модели."
				>
					<div>
						<QueryState query={ai} />
						{ai.data?.configured && (
							<Badge>{ai.data.provider} · {ai.data.model}</Badge>
						)}
					</div>
				</Row>
			)}
			{showMonitor && monitor.data?.lastSync && (
				<Row
					title="LiveChat"
					detail={`Последний подтверждённый опрос: ${new Date(monitor.data.lastSync).toLocaleString("ru")}`}
				>
					<Link to="/agent-monitor" className="ui-button">
						Мониторинг
					</Link>
				</Row>
			)}
			{showMonitor && <QueryState query={monitor} />}
			{configured && (
				<Row
					title="Supabase"
					detail="Наличие клиентской конфигурации не подтверждает доступность базы."
				>
					<Badge>Конфигурация подключена</Badge>
				</Row>
			)}
			{canManageIntegrations && (
				<Row title="Управление подключениями">
					<Link to="/settings" hash="integrations" className="ui-button">
						Открыть настройки
					</Link>
				</Row>
			)}
		</Panel>
	);
}
export function AccessReviewPage({
	onUser,
}: {
	onUser: (user: OverviewUser) => void;
}) {
	const accounts = useAccounts(),
		catalog = useCatalog();
	const privileged = new Set(
		catalog.data?.roles
			.filter((r) =>
				r.permissions.some((p) =>
					[
						"users.manage",
						"roles.manage",
						"technical",
						"ai.publish",
						"knowledge.write",
					].includes(p),
				),
			)
			.map((r) => r.id),
	);
	const users = accounts.data?.users ?? [];
	const candidates = users.filter(
		(u) =>
			u.status === "pending" ||
			!u.roles.length ||
			u.roles.some((r) => privileged.has(r)),
	);
	const complete = accounts.data && users.length === accounts.data.total;
	return (
		<div className="ops-stack">
			<Panel title="Рекомендации по доступам">
				<QueryState query={accounts} />
				<QueryState query={catalog} />
				{accounts.data && (
					<p className="ops-note">
						Проверено {users.length} из {accounts.data.total} аккаунтов.
						Рекомендации не меняют доступ автоматически.
					</p>
				)}
				{!accounts.isPending &&
					!accounts.error &&
					!catalog.isPending &&
					!catalog.error &&
					candidates.map((u) => (
						<Row
							key={u.id}
							title={u.display_name || u.email}
							detail={
								!u.roles.length
									? "Нет назначенных ролей"
									: u.status === "pending"
										? "Ожидает выдачи доступа"
										: "Привилегированный аккаунт — проверьте необходимость прав"
							}
						>
							<button
								type="button"
								className="ui-button"
								onClick={() => onUser(u)}
							>
								Проверить
							</button>
						</Row>
					))}
			</Panel>
			{complete &&
				catalog.data &&
				catalog.data.roles.some(
					(r) => !r.is_system && !users.some((u) => u.roles.includes(r.id)),
				) && (
					<Panel title="Неиспользуемые пользовательские роли">
						{catalog.data.roles
							.filter(
								(r) => !r.is_system && !users.some((u) => u.roles.includes(r.id)),
							)
							.map((r) => (
								<Row key={r.id} title={r.name}>
									<Badge>Не назначена</Badge>
								</Row>
							))}
					</Panel>
				)}
		</div>
	);
}
export function ProjectsPage() {
	const projects = useBonusStore((s) => s.projects);
	if (!projects.length) return null;
	return (
		<Panel title="Проекты справочника">
			<p className="ops-note">
				Загруженные проекты справочника бонусов. Это не реестр доступа
				сотрудников и не AI-инструкции проектов.
			</p>
			{projects.map((p) => (
				<Row key={p.id} title={p.name} detail={p.id}>
					<Badge>Проект справочника</Badge>
				</Row>
			))}
		</Panel>
	);
}
export function AIOverviewPage() {
	const user = useAuthStore((s) => s.session?.user);
	const ai = useAIStatus(),
		runtime = useAIRuntime();
	const feedback = runtime.data?.document.feedback ?? [];
	const canReadAI = can(user?.access, "tools");
	const canReadQuality = canTrain(user?.access);
	return (
		<div className="ops-stack">
			{canReadAI && (
				<Panel title="Среда выполнения AI">
					<>
						<QueryState query={ai} />
						{ai.data?.configured && (
							<Row title={ai.data.provider} detail={ai.data.model}>
								<Badge>Настроен</Badge>
							</Row>
						)}
					</>
				</Panel>
			)}
			{canReadQuality && (
				<Panel title="Сигналы качества">
					<>
						<QueryState query={runtime} />
						{runtime.data && (
							<>
								<Row
									title="Оценки ответов"
									detail="Последние 100 записей; не доля принятых или отправленных ответов."
								>
									<Badge>
										{feedback.filter((f) => f.rating === "positive").length}{" "}
										полезных / {feedback.length} оценок
									</Badge>
								</Row>
								<Row
									title="Опубликованные записи"
									detail="Количество записей с опубликованной версией; это не размер векторного индекса."
								>
									<Badge>
										{
											runtime.data.document.entries.filter(
												(e) => e.status !== "archived" && e.published,
											).length
										}
									</Badge>
								</Row>
							</>
						)}
					</>
				</Panel>
			)}
		</div>
	);
}
export function ModelsPage() {
	const ai = useAIStatus();
	const access = useAuthStore((s) => s.session?.user.access);
	if (!can(access, "tools")) return null;
	return (
		<Panel title="Модели и маршрутизация задач">
			<QueryState query={ai} />
			{ai.data?.configured && (
				<Row title="Основная модель" detail={ai.data.provider}>
					<Badge>{ai.data.model}</Badge>
				</Row>
			)}
		</Panel>
	);
}
export function LearningPage() {
	return null;
}
export function BoundaryPage({ section }: { section: string }) {
	if (section === "learning") return <LearningPage />;
	if (section === "models") return <ModelsPage />;
	return null;
}
export function DashboardPage({
	onUser,
	onSection,
}: {
	onUser: (user: OverviewUser) => void;
	onSection: (id: string) => void;
}) {
	const accounts = useAccounts();
	const user = useAuthStore((s) => s.session?.user);
	const rows = accounts.data?.users ?? [];
	return (
		<div className="ops-stack">
			<QueryState query={accounts} />
			{accounts.data && (
				<div className="ops-metrics">
					{[
						["Аккаунты", accounts.data.total],
						["Активные в выборке", rows.filter((u) => u.status === "active").length],
					].map(([label, value]) => (
						<div key={label}>
							<span>{label}</span>
							<strong>{value}</strong>
							<small>{`${rows.length} загружено`}</small>
						</div>
					))}
				</div>
			)}
			<div className="ops-two-col">
				<Panel title="Требует внимания">
					{rows
						.filter((u) => u.status === "pending" || !u.roles.length)
						.map((u) => (
							<Row
								key={u.id}
								title={u.display_name || u.email}
								detail="Требуется проверка доступа"
							>
								<button
									className="ui-button"
									type="button"
									onClick={() => onUser(u)}
								>
									Открыть
								</button>
							</Row>
						))}
					{accounts.data &&
						!rows.some((u) => u.status === "pending" || !u.roles.length) && (
							<Unavailable message="В загруженной выборке нет запросов доступа." />
						)}
					{canAccessPage(user?.access, "/admin", "access") && (
						<Row title="Проверка привилегий">
							<button
								className="ui-button"
								type="button"
							onClick={() => onSection("access")}
							>
								Роли и доступы
							</button>
						</Row>
					)}
				</Panel>
				<IntegrationsPage />
			</div>
		</div>
	);
}

export function SystemHealthPage() {
	return <IntegrationsPage />;
}
