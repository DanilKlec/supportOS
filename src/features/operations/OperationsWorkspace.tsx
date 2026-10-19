import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ChevronRight,
	ShieldCheck,
	type LucideIcon,
} from "lucide-react";
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
	icon?: LucideIcon;
};
export function OperationsWorkspace({
	area,
	sections,
	active,
	children,
	onSelect,
	wide = false,
	fit = false,
}: {
	area: "admin" | "qc";
	sections: WorkspaceSection[];
	active: string;
	children: ReactNode;
	onSelect: (id: string) => void;
	wide?: boolean;
	fit?: boolean;
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
		<div
			className={`ops-workspace${area === "qc" ? " ops-workspace--qc" : ""}${wide ? " ops-workspace--wide" : ""}${fit ? " ops-workspace--library" : ""}`}
		>
			<aside className="ops-sidebar">
				<Link to="/" className="ops-back">
					{area === "qc" ? (
						<ArrowLeft size={15} strokeWidth={1.7} aria-hidden="true" />
					) : (
						"← "
					)}
					Рабочее пространство
				</Link>
				<div className="ops-workspace-title">
					{area === "qc" && (
						<div className="qc-brand-mark">
							<ShieldCheck size={21} strokeWidth={1.5} aria-hidden="true" />
						</div>
					)}
					<div>
						<p>
							{area === "admin"
								? "Рабочее пространство платформы"
								: "Quality Control"}
						</p>
						<h1>
							{area === "admin" ? "Администрирование" : "Контроль качества"}
						</h1>
					</div>
				</div>
				<nav
					aria-label={
						area === "admin" ? "Администрирование" : "Контроль качества"
					}
				>
					{[...new Set(navigation.map((s) => s.group))].map((group) => (
						<section key={group}>
							<h2 className={area === "qc" ? "sr-only" : undefined}>{group}</h2>
							{navigation
								.filter((s) => s.group === group)
								.map((s) => {
									const Icon = s.icon;
									return (
										<button
											type="button"
											key={s.id}
											className="ops-nav"
											aria-current={
												s.id === (current?.parent ?? active)
													? "page"
													: undefined
											}
											onClick={() => onSelect(s.id)}
										>
											{Icon ? (
												<Icon size={18} strokeWidth={1.6} aria-hidden="true" />
											) : (
												<span aria-hidden="true" />
											)}
											{s.label}
											{area === "qc" && (
												<ChevronRight
													className="qc-nav-arrow"
													size={14}
													strokeWidth={1.6}
													aria-hidden="true"
												/>
											)}
										</button>
									);
								})}
						</section>
					))}
				</nav>
				<div className="ops-sidebar-footer">
					{area === "qc" && (
						<ShieldCheck size={17} strokeWidth={1.6} aria-hidden="true" />
					)}
					<div>
						<strong>
							{area === "admin"
								? "Система и контроль доступов"
								: "Качество рабочих материалов"}
						</strong>
						<p>
							{area === "qc"
								? "Бинды, почты и бонусы команды"
								: "Доступ по правам вашей учётной записи"}
						</p>
					</div>
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
