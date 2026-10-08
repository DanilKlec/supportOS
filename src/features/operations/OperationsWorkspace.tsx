import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
export type WorkspaceSection = {
	id: string;
	label: string;
	group: string;
	description: string;
	parent?: string;
	hiddenFromNavigation?: boolean;
};
export function OperationsWorkspace({
	area,
	sections,
	active,
	children,
	onSelect,
}: {
	area: "admin" | "qc";
	sections: WorkspaceSection[];
	active: string;
	children: ReactNode;
	onSelect: (id: string) => void;
}) {
	const access = useAuthStore((s) => s.session?.user.access);
	const available = sections.filter((s) =>
		canAccessPage(access, `/${area}`, s.id),
	);
	const navigation = available.filter(
		(s) =>
			!s.hiddenFromNavigation &&
			(!s.parent || !available.some((parent) => parent.id === s.parent)),
	);
	const current = available.find((s) => s.id === active);
	return (
		<div className="ops-workspace">
			<aside className="ops-sidebar">
				<Link to="/" className="ops-back">
					← Рабочее пространство
				</Link>
				<div className="ops-workspace-title">
					<p>
						{area === "admin"
							? "Рабочее пространство платформы"
							: "Контроль качества"}
					</p>
					<h1>
						{area === "admin" ? "Администрирование" : "Контроль качества"}
					</h1>
				</div>
				<nav
					aria-label={
						area === "admin" ? "Администрирование" : "Контроль качества"
					}
				>
					{[...new Set(navigation.map((s) => s.group))].map((group) => (
						<section key={group}>
							<h2>{group}</h2>
							{navigation
								.filter((s) => s.group === group)
								.map((s) => (
									<button
										type="button"
										key={s.id}
										className="ops-nav"
										aria-current={
											s.id === (current?.parent ?? active) ? "page" : undefined
										}
										onClick={() => onSelect(s.id)}
									>
										<span aria-hidden="true" />
										{s.label}
									</button>
								))}
						</section>
					))}
				</nav>
				<div className="ops-sidebar-footer">
					<strong>
						{area === "admin"
							? "Система и контроль доступов"
							: "Материалы и ответы AI"}
					</strong>
					<p>Доступ по правам вашей учётной записи</p>
				</div>
			</aside>
			<div className="ops-content">
				<label className="ui-field ops-mobile-nav">
					Раздел
					<select
						className="ui-input"
						value={current?.id ?? ""}
						onChange={(e) => onSelect(e.target.value)}
					>
						{navigation.map((s) => (
							<option key={s.id} value={s.id}>
								{s.label}
							</option>
						))}
					</select>
				</label>
				<div className="ops-page">
					{current ? (
						<>
							<header className="ops-heading">
								<div>
									<h2>{current.label}</h2>
									<p>{current.description}</p>
								</div>
							</header>
							{children}
						</>
					) : (
						<ErrorState
							title="Раздел недоступен"
							description="У вашей учётной записи нет доступа к этому разделу."
						/>
					)}
				</div>
			</div>
		</div>
	);
}
export function Panel({
	title,
	children,
	aside,
}: {
	title: string;
	children: ReactNode;
	aside?: ReactNode;
}) {
	return (
		<section className="ops-panel">
			<header>
				<h3>{title}</h3>
				{aside}
			</header>
			{children}
		</section>
	);
}
export function Row({
	title,
	detail,
	children,
}: {
	title: string;
	detail?: string;
	children?: ReactNode;
}) {
	return (
		<div className="ops-row">
			<div>
				<strong>{title}</strong>
				{detail && <p>{detail}</p>}
			</div>
			{children}
		</div>
	);
}
export function Badge({ children }: { children: ReactNode }) {
	return <span className="ops-badge">{children}</span>;
}
export function Unavailable({
	message = "Сервис не настроен. Данные появятся после подключения серверного источника.",
}: {
	message?: string;
}) {
	return <EmptyState title={message} className="ops-empty" />;
}
export function QueryState({
	query,
	loadingMessage = "Загружаем данные…",
	errorTitle = "Не удалось загрузить данные.",
}: {
	query: {
		isPending: boolean;
		isFetching?: boolean;
		error: Error | null;
		refetch: () => unknown;
	};
	loadingMessage?: string;
	errorTitle?: string;
}) {
	return query.error ? (
		<ErrorState
			title={errorTitle}
			description={
				/[а-яё]/i.test(query.error.message)
					? query.error.message
					: "Проверьте подключение и повторите попытку."
			}
			onRetry={() => void query.refetch()}
			retrying={query.isFetching}
			className="ops-empty"
		/>
	) : query.isPending ? (
		<LoadingState message={loadingMessage} className="ops-empty" />
	) : null;
}
