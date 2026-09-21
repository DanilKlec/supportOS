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
import { operationsCapabilities } from "@/services/operations-capabilities";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { can, canAccessPage, canTrain } from "../../../../shared/access.js";

function Missing({ kind }: { kind: keyof typeof operationsCapabilities }) {
	const state = operationsCapabilities[kind]();
	return (
		<Unavailable
			message={state.state === "not-configured" ? state.reason : "Нет записей."}
		/>
	);
}
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
	return (
		<Panel title="Integration health">
			<Row
				title="AI provider"
				detail="Проверка конфигурации, не тестовый запрос к модели."
			>
				{can(user?.access, "tools") ? (
					<div>
						<QueryState query={ai} />
						{ai.data && (
							<Badge>
								{ai.data.configured
									? `${ai.data.provider} · ${ai.data.model}`
									: "Ключ не настроен"}
							</Badge>
						)}
					</div>
				) : (
					<Badge>Нет прав на проверку</Badge>
				)}
			</Row>
			<Row
				title="LiveChat"
				detail={
					monitor.data?.lastSync
						? `Последний подтверждённый опрос: ${new Date(monitor.data.lastSync).toLocaleString("ru")}`
						: "Последний успешный опрос неизвестен."
				}
			>
				{can(user?.access, "monitor.read") ? (
					<>
						<QueryState query={monitor} />
						<Link to="/agent-monitor" className="ui-button">
							Мониторинг
						</Link>
					</>
				) : (
					<Badge>Нет прав monitor.read</Badge>
				)}
			</Row>
			<Row
				title="Supabase"
				detail="Наличие клиентской конфигурации не подтверждает доступность базы."
			>
				<Badge>{configured ? "Конфигурация подключена" : "Не настроено"}</Badge>
			</Row>
			<Row
				title="Google Sheets"
				detail="Ручной импорт справочников доступен в настройках. Телеметрия автоматической синхронизации не подключена."
			>
				<Badge>Нет телеметрии</Badge>
			</Row>
			{can(user?.access, "technical") && (
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
			<Panel title="Access recommendations">
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
					!candidates.length && (
						<Unavailable message="В загруженной выборке нет рекомендаций." />
					)}
				{candidates.map((u) => (
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
			<Panel title="Unused custom roles">
				{complete && catalog.data ? (
					catalog.data.roles
						.filter(
							(r) => !r.is_system && !users.some((u) => u.roles.includes(r.id)),
						)
						.map((r) => (
							<Row key={r.id} title={r.name}>
								<Badge>Не назначена</Badge>
							</Row>
						))
				) : (
					<Unavailable message="Вывод о неиспользуемых ролях доступен только после полной загрузки аккаунтов и каталога." />
				)}
				{complete &&
					catalog.data &&
					!catalog.data.roles.some(
						(r) => !r.is_system && !users.some((u) => u.roles.includes(r.id)),
					) && (
						<Unavailable message="Неиспользуемых пользовательских ролей не найдено." />
					)}
			</Panel>
			<Panel title="Unavailable signals">
				<Unavailable message="Единого источника последней активности и назначений проектов нет. Неактивность и отсутствие проекта не вычисляются по предположениям." />
			</Panel>
		</div>
	);
}
export function ProjectsPage() {
	const projects = useBonusStore((s) => s.projects);
	return (
		<Panel title="Reference projects">
			<p className="ops-note">
				Загруженные проекты справочника бонусов. Это не реестр доступа
				сотрудников и не AI-инструкции проектов.
			</p>
			{projects.length ? (
				projects.map((p) => (
					<Row key={p.id} title={p.name} detail={p.id}>
						<Badge>Reference project</Badge>
					</Row>
				))
			) : (
				<Unavailable message="В рабочем хранилище пока нет проектов справочника." />
			)}
			<Unavailable message="Единый backend конфигурации проектов и назначений сотрудников не подключён. Эти настройки недоступны для изменения." />
		</Panel>
	);
}
export function AIOverviewPage() {
	const user = useAuthStore((s) => s.session?.user);
	const ai = useAIStatus(),
		runtime = useAIRuntime();
	const feedback = runtime.data?.document.feedback ?? [];
	return (
		<div className="ops-stack">
			<Panel title="AI runtime">
				{can(user?.access, "tools") ? (
					<>
						<QueryState query={ai} />
						{ai.data && (
							<Row title={ai.data.provider} detail={ai.data.model}>
								<Badge>{ai.data.configured ? "Настроен" : "Не настроен"}</Badge>
							</Row>
						)}
					</>
				) : (
					<Unavailable message="Нет прав на проверку конфигурации AI." />
				)}
			</Panel>
			<Panel title="Quality signals">
				{canTrain(user?.access) ? (
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
				) : (
					<Unavailable message="Для чтения оценок и знаний нужны действующие AI-права." />
				)}
			</Panel>
			<Panel title="Learning pipeline">
				<Missing kind="candidates" />
			</Panel>
			<Panel title="Latency & costs">
				<Missing kind="usage" />
			</Panel>
		</div>
	);
}
export function ModelsPage() {
	const ai = useAIStatus();
	const access = useAuthStore((s) => s.session?.user.access);
	return (
		<Panel title="Models & task routing">
			{can(access, "tools") ? (
				<>
					<QueryState query={ai} />
					{ai.data && (
						<Row title="Primary model" detail={ai.data.provider}>
							<Badge>{ai.data.model}</Badge>
						</Row>
					)}
				</>
			) : (
				<Unavailable message="Нет прав на чтение конфигурации модели." />
			)}
			{["Fast model", "Reasoning model", "Fallback", "Task routing"].map(
				(label) => (
					<Row key={label} title={label}>
						<input aria-label={label} disabled placeholder="Not configured" />
					</Row>
				),
			)}
			<Missing kind="routing" />
			<div className="ops-panel-actions">
				<button type="button" className="ui-button" disabled>
					Сохранение недоступно
				</button>
			</div>
		</Panel>
	);
}
export function LearningPage() {
	return (
		<div className="ops-stack">
			<Panel title="Learning policy">
				<p className="ops-note">
					Работа операторов → сигналы → повторяющиеся паттерны → кандидат →
					оценка риска → QC или разрешённая автопубликация → доступность знаний
					при следующем запросе.
				</p>
				{[
					[
						"Candidate generation",
						"Выделение кандидатов из подтверждённых сигналов",
					],
					[
						"Auto-publish low-risk",
						"Публикация только после подтверждённой оценки риска",
					],
					[
						"Semantic auto-publish",
						"По умолчанию выключено: смысловые изменения требуют проверки",
					],
				].map(([title, detail]) => (
					<Row key={title} title={title} detail={detail}>
						<input
							type="checkbox"
							aria-label={title}
							disabled
							checked={false}
						/>
					</Row>
				))}
				<Missing kind="learningPolicy" />
			</Panel>
			<Panel title="Risk & QC requirements">
				{[
					"Категории риска",
					"Категории обязательного QC",
					"Минимум подтверждений",
					"Минимальная уверенность",
				].map((label) => (
					<Row key={label} title={label}>
						<input aria-label={label} disabled placeholder="Not configured" />
					</Row>
				))}
			</Panel>
		</div>
	);
}
export function BoundaryPage({ section }: { section: string }) {
	if (section === "learning") return <LearningPage />;
	if (section === "models") return <ModelsPage />;
	if (section === "jobs")
		return (
			<Panel title="Background operations">
				{[
					"LiveChat sync",
					"Knowledge indexing",
					"Learning analysis",
					"Analytics refresh",
					"Sheet sync",
				].map((job) => (
					<Row
						key={job}
						title={job}
						detail="Реестр заданий и управление расписанием не подключены."
					>
						<Badge>Not configured</Badge>
					</Row>
				))}
			</Panel>
		);
	if (section === "logs")
		return (
			<Panel title="AI request log">
				<div className="ops-table-wrap">
					<table>
						<thead>
							<tr>
								{[
									"Время",
									"Проект / тема",
									"Модель",
									"Задержка",
									"Источники",
									"Уверенность",
									"Safety / routing",
								].map((c) => (
									<th key={c}>{c}</th>
								))}
							</tr>
						</thead>
						<tbody>
							<tr>
								<td colSpan={7}>
									<Missing kind="logs" />
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</Panel>
		);
	if (section === "flags")
		return (
			<Panel title="Server feature flags">
				<Missing kind="flags" />
				<div className="ops-panel-actions">
					<button type="button" disabled className="ui-button">
						Добавление недоступно
					</button>
				</div>
			</Panel>
		);
	return (
		<Panel title="Usage & budget">
			<div className="ops-metrics">
				{["Запросы", "Токены", "Стоимость", "Бюджет"].map((label) => (
					<div key={label}>
						<span>{label}</span>
						<strong>—</strong>
						<small>No telemetry</small>
					</div>
				))}
			</div>
			<Missing kind="usage" />
		</Panel>
	);
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
			<div className="ops-metrics">
				{[
					["Аккаунты", accounts.data?.total],
					[
						"Активные в выборке",
						accounts.data
							? rows.filter((u) => u.status === "active").length
							: undefined,
					],
					["AI requests today", undefined],
					["Monthly AI spend", undefined],
				].map(([label, value]) => (
					<div key={label}>
						<span>{label}</span>
						<strong>{value ?? "—"}</strong>
						<small>
							{value === undefined
								? "No telemetry"
								: `${rows.length} загружено`}
						</small>
					</div>
				))}
			</div>
			<div className="ops-two-col">
				<Panel title="Needs attention">
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
								Access Review
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
	return (
		<div className="ops-stack">
			<IntegrationsPage />
			<Panel title="Knowledge index">
				<Unavailable message="Индексирование не предоставляет отдельную телеметрию. Подбор знаний выполняется текущим AI runtime; процент готовности индекса неизвестен." />
			</Panel>
			<Panel title="Learning pipeline">
				<Missing kind="candidates" />
			</Panel>
		</div>
	);
}
