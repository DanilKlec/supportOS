import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
export type WorkspaceSection = {
	id: string;
	label: string;
	group: string;
	description: string;
	parent?: string;
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
		(s) => !s.parent || !available.some((parent) => parent.id === s.parent),
	);
	const current = available.find((s) => s.id === active);
	return (
		<div className="ops-workspace">
			<aside className="ops-sidebar">
				<Link to="/" className="ops-back">
					← Рабочее пространство
				</Link>
				<div className="ops-workspace-title">
					<p>{area === "admin" ? "Platform workspace" : "Контроль качества"}</p>
					<h1>{area === "admin" ? "Administration" : "QC"}</h1>
				</div>
				<nav
					aria-label={
						area === "admin" ? "Администрирование" : "QC"
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
							? "System & access control"
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
						{available.map((s) => (
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
						<p role="alert">Нет доступа к этому разделу.</p>
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
	return <p className="ops-empty">{message}</p>;
}
export function QueryState({
	query,
}: {
	query: { isPending: boolean; error: Error | null; refetch: () => unknown };
}) {
	return query.error ? (
		<p role="alert" className="ops-empty">
			{/[а-яё]/i.test(query.error.message)?query.error.message:'Не удалось загрузить данные. Повторите попытку.'}{" "}
			<button
				className="ui-button"
				type="button"
				onClick={() => void query.refetch()}
			>
				Повторить
			</button>
		</p>
	) : query.isPending ? (
		<output className="ops-empty block">Загрузка…</output>
	) : null;
}
