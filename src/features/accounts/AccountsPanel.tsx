import { Fragment, type ReactNode, useEffect, useState } from "react";
import type { MonitorData } from "@/features/agent-monitor/live-model";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { AdminOverview } from "./AdminOverview";
export type ManagedRole = {
	id: string;
	name: string;
	description: string;
	is_system: boolean;
	version: number;
	permissions: string[];
};
type Permission = {
	id: string;
	name: string;
	description: string;
	creator_only: boolean;
};
type User = {
	id: string;
	email: string;
	display_name: string;
	status: string;
	version: number;
	roles: string[];
};
type Audit = {
	id: number;
	actor_label: string;
	action: string;
	target_id: string;
	created_at: string;
	before_data: any;
	after_data: any;
};
const control =
	"rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-40";
const permissionGroup = (id: string) => {
	if (
		id.startsWith("ai.") ||
		id === "tools" ||
		id === "translator.use" ||
		id === "composer.use"
	)
		return "AI";
	if (id === "knowledge.write" || id === "binds.manage") return "QC";
	if (id.startsWith("monitor.")) return "Team";
	if (
		/^(users|roles|settings)\./.test(id) ||
		id === "technical" ||
		id === "work"
	)
		return "Administration";
	return "Knowledge";
};
export async function accessApi(
	action: string,
	body?: unknown,
	params: Record<string, string> = {},
	signal?: AbortSignal,
) {
	const response = await authenticatedFetch(
		`/api/accounts?${new URLSearchParams({ action, ...params })}`,
		{
			method: body === undefined ? "GET" : "POST",
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal,
		},
	);
	const data = await response.json();
	if (!response.ok)
		throw new Error(data.error ?? "Ошибка управления доступами");
	return data;
}
export function AccountsPanel({
	standalone = false,
	initialTab,
	initialUser,
	embedded = false,
}: {
	standalone?: boolean;
	initialTab?: "users" | "roles" | "audit";
	initialUser?: User;
	embedded?: boolean;
}) {
	const identity = useAuthStore((s) => s.session?.user);
	const access = identity?.access;
	const usersAllowed = can(access, "users.manage");
	const rolesAllowed = can(access, "roles.manage");
	const owner = access?.roles.some((r) => r.id === "creator") ?? false;
	const [tab, setTab] = useState<string>(
		initialTab ?? (usersAllowed ? "users" : "roles"),
	);
	const [roles, setRoles] = useState<ManagedRole[]>([]);
	const [permissions, setPermissions] = useState<Permission[]>([]);
	const [users, setUsers] = useState<User[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState(initialUser?.email ?? "");
	const [query, setQuery] = useState(initialUser?.email ?? "");
	const [revision, setRevision] = useState(0);
	const [audit, setAudit] = useState<Audit[]>([]);
	const [moreAudit, setMoreAudit] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [userEdit, setUserEdit] = useState<User | null>(initialUser ?? null);
	const [roleEdit, setRoleEdit] = useState<ManagedRole | null>(null);
	const [create, setCreate] = useState(false);
	const [confirmation, setConfirmation] = useState<{
		body: unknown;
		diff: string[];
	} | null>(null);
	const [statusFilter, setStatusFilter] = useState("");
	const [roleFilter, setRoleFilter] = useState("");
	const refresh = () => setRevision((r) => r + 1);
	// biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly refreshes the server snapshot after mutations.
	useEffect(() => {
		const abort = new AbortController();
		setBusy(true);
		setError("");
		void (async () => {
			try {
				const catalog = await accessApi("catalog", undefined, {}, abort.signal);
				if (abort.signal.aborted) return;
				setRoles(catalog.roles);
				setPermissions(catalog.permissions);
				if (tab === "users" && usersAllowed) {
					const data = await accessApi(
						"users",
						undefined,
						{
							page: String(page),
							search: query,
							status: statusFilter,
							role: roleFilter,
						},
						abort.signal,
					);
					if (abort.signal.aborted) return;
					setUsers(data.users);
					setTotal(data.total);
				}
				if (tab === "audit" && usersAllowed) {
					const data = await accessApi("audit", undefined, {}, abort.signal);
					if (abort.signal.aborted) return;
					setAudit(data.rows);
					setMoreAudit(data.hasMore);
				}
			} catch (e) {
				if (!abort.signal.aborted)
					setError(e instanceof Error ? e.message : "Ошибка");
			} finally {
				if (!abort.signal.aborted) setBusy(false);
			}
		})();
		return () => abort.abort();
	}, [
		tab,
		page,
		query,
		revision,
		usersAllowed,
		embedded,
		statusFilter,
		roleFilter,
	]);
	const assignable = roles.filter(
		(r) =>
			owner ||
			(r.id !== "creator" &&
				r.permissions.every((p) => access?.permissions.includes(p))),
	);
	const mutate = async (body: unknown, confirmed = false) => {
		const change = body as {
			action: string;
			payload?: { permissions?: string[]; roles?: string[]; status?: string };
		};
		if (
			!confirmed &&
			["user.update", "role.save", "role.delete"].includes(change.action)
		) {
			const previous =
				change.action === "user.update"
					? roles
							.filter((r) => userEdit?.roles.includes(r.id))
							.flatMap((r) => r.permissions)
					: (roleEdit?.permissions ?? []);
			const next =
				change.action === "user.update"
					? roles
							.filter((r) => change.payload?.roles?.includes(r.id))
							.flatMap((r) => r.permissions)
					: (change.payload?.permissions ?? []);
			const label = (key: string) =>
				permissions.find((p) => p.id === key)?.name ?? key;
			const diff = [...new Set(next.filter((p) => !previous.includes(p)))]
				.map((p) => `+ ${label(p)}`)
				.concat(
					[...new Set(previous.filter((p) => !next.includes(p)))].map(
						(p) => `− ${label(p)}`,
					),
				);
			if (
				change.action === "user.update" &&
				change.payload?.status !== userEdit?.status
			)
				diff.push(`Доступ: ${userEdit?.status} → ${change.payload?.status}`);
			if (change.action === "role.delete") diff.push("Удалить роль");
			if (diff.length) {
				setConfirmation({ body, diff });
				return;
			}
		}
		setBusy(true);
		setError("");
		setNotice("");
		try {
			const result = await accessApi("users", body);
			setNotice(result.warning ?? "Изменения сохранены");
			setCreate(false);
			setUserEdit(null);
			setRoleEdit(null);
			refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Ошибка");
		} finally {
			setBusy(false);
		}
	};
	const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
	return (
		<section className="accounts-registry space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
			{confirmation && (
				<BaseModal
					title="Подтвердить изменения прав"
					onClose={() => setConfirmation(null)}
				>
					<ul className="space-y-2">
						{confirmation.diff.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
					<div className="ui-actions items-center mt-4 flex gap-2">
						<button
							type="button"
							className={`${control} ui-button`}
							onClick={() => {
								const body = confirmation.body;
								setConfirmation(null);
								void mutate(body, true);
							}}
						>
							Подтвердить изменения
						</button>
						<button
							type="button"
							className={`${control} ui-button`}
							onClick={() => setConfirmation(null)}
						>
							Отмена
						</button>
					</div>
				</BaseModal>
			)}
			{!standalone && (
				<h2 className="text-xl font-semibold">Пользователи, роли и доступы</h2>
			)}
			<div
				className="ui-actions items-center flex flex-wrap gap-2"
				role="tablist"
				aria-label="Управление доступами"
				style={embedded ? { display: "none" } : undefined}
			>
				{[
					...(!standalone && usersAllowed ? [["overview", "Обзор"]] : []),
					["users", "Пользователи"],
					["roles", "Роли и разрешения"],
					["audit", "Журнал изменений"],
				]
					.filter(([id]) => (id === "roles" ? rolesAllowed : usersAllowed))
					.map(([id, label]) => (
						<button
							type="button"
							key={id}
							role="tab"
							aria-selected={tab === id}
							className={`${control} ${tab === id ? "border-accent/30 bg-accent/10 text-accent" : "border-transparent text-muted"}`}
							disabled={busy}
							onClick={() => {
								setTab(id);
								setUserEdit(null);
								setRoleEdit(null);
								setCreate(false);
							}}
						>
							{label}
						</button>
					))}
				<button
					type="button"
					className={`${control} ui-button`}
					disabled={busy}
					onClick={refresh}
				>
					Обновить
				</button>
			</div>
			{busy && <output>Загрузка…</output>}
			{error && !create && (!userEdit || embedded) && (
				<p role="alert" className="text-red-400">
					{error}
				</p>
			)}
			{notice && <output>{notice}</output>}
			{tab === "overview" && usersAllowed && (
				<AdminOverview
					key={revision}
					onAudit={() => setTab("audit")}
					onUser={(u) => {
						setTab("users");
						setUserEdit(u);
						setSearch(u.email);
						setQuery(u.email);
						setPage(1);
					}}
				/>
			)}
			{tab === "users" && usersAllowed && (
				<>
					<header className="user-registry-heading">
						<div>
							<p className="section-eyebrow">Команда</p>
							<h1>Пользователи</h1>
							<p>Управляйте аккаунтами, ролями и доступом сотрудников.</p>
						</div>
						<button
							type="button"
							className="ui-button ui-button--primary"
							disabled={busy}
							onClick={() => {
								setCreate(true);
								setUserEdit(null);
							}}
						>
							Создать аккаунт
						</button>
					</header>
					<form
						className="user-registry-filters"
						onSubmit={(e) => {
							e.preventDefault();
							setQuery(search);
							setPage(1);
							refresh();
						}}
					>
						<input
							className={control}
							aria-label="Поиск пользователя"
							placeholder="Почта или имя"
							value={search}
							maxLength={120}
							onChange={(e) => setSearch(e.target.value)}
						/>
						<button
							type="submit"
							className={`${control} ui-button`}
							disabled={busy}
						>
							Найти
						</button>
						<select
							aria-label="Статус сотрудников"
							className={control}
							value={statusFilter}
							onChange={(e) => {
								setStatusFilter(e.target.value);
								setPage(1);
							}}
						>
							<option value="">Все статусы</option>
							<option value="active">Активные</option>
							<option value="pending">Ожидают доступа</option>
							<option value="disabled">Отключены</option>
						</select>
						<select
							aria-label="Роль сотрудников"
							className={control}
							value={roleFilter}
							onChange={(e) => {
								setRoleFilter(e.target.value);
								setPage(1);
							}}
						>
							<option value="">Все роли</option>
							{roles.map((role) => (
								<option key={role.id} value={role.id}>
									{role.name}
								</option>
							))}
						</select>
						{(query || search || statusFilter || roleFilter) && (
							<button
								type="button"
								className="ui-button ui-button--ghost"
								onClick={() => {
									setSearch("");
									setQuery("");
									setStatusFilter("");
									setRoleFilter("");
									setPage(1);
								}}
							>
								Сбросить
							</button>
						)}
					</form>
					<p className="text-sm text-muted">
						Найдено: {total} · Страница {page} из{" "}
						{Math.max(1, Math.ceil(total / 50))}
					</p>
					{create && (
						<BaseModal
							title="Новый сотрудник"
							size="lg"
							onClose={() => setCreate(false)}
							closeDisabled={busy}
						>
							{error && (
								<p role="alert" className="mb-4 text-red-400">
									{error}
								</p>
							)}
							<CreateUser
								key="create"
								roles={assignable}
								busy={busy}
								onSave={mutate}
								onCancel={() => setCreate(false)}
							/>
						</BaseModal>
					)}
					{userEdit && (
						<BaseModal
							title="Профиль и доступы сотрудника"
							size="xl"
							onClose={() => setUserEdit(null)}
							closeDisabled={busy}
						>
							{error && (
								<p role="alert" className="mb-4 text-red-400">
									{error}
								</p>
							)}
							<UserDetails key={userEdit.id} user={userEdit}>
								<EditUser
									key={`${userEdit.id}-${userEdit.version}`}
									user={userEdit}
									roles={assignable}
									permissions={permissions}
									busy={
										busy ||
										userEdit.id === identity?.id ||
										userEdit.roles.includes("creator") ||
										(!owner &&
											userEdit.roles.some(
												(id) => !assignable.some((role) => role.id === id),
											))
									}
									onSave={mutate}
									onCancel={() => setUserEdit(null)}
								/>
							</UserDetails>
						</BaseModal>
					)}
					<div
						className="accounts-registry user-registry-table overflow-auto rounded-xl border border-border"
						aria-busy={busy}
					>
						<table
							aria-label="Реестр пользователей"
							className="w-full min-w-[680px] text-left text-sm"
						>
							<thead className="bg-background/70 text-xs text-muted">
								<tr>
									<th scope="col">Сотрудник</th>
									<th scope="col">Роли</th>
									<th scope="col">Статус</th>
									<th scope="col">Действия</th>
								</tr>
							</thead>
							<tbody>
								{users.map((u) => (
									<tr
										key={u.id}
										className="border-t border-border/60 transition hover:bg-surface-elevated/40"
									>
										<td data-label="Сотрудник" className="py-3">
											<div className="flex items-center gap-3">
												<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-sm font-semibold uppercase text-accent">
													{(u.display_name || u.email).slice(0, 2)}
												</span>
												<div>
													<p className="font-medium">
														{u.display_name || u.email.split("@")[0]}
														{u.id === identity?.id && (
															<span className="ml-2 text-xs font-normal text-muted">
																Это вы
															</span>
														)}
													</p>
													<p className="mt-1 text-xs text-muted">{u.email}</p>
												</div>
											</div>
										</td>
										<td data-label="Роли">
											<div className="flex max-w-xs flex-wrap gap-1.5">
												{u.roles.length ? (
													u.roles.map((id) => (
														<span
															key={id}
															className={`registry-role registry-role-${id}`}
														>
															{roleName(id)}
														</span>
													))
												) : (
													<span className="text-xs text-muted">Без роли</span>
												)}
											</div>
										</td>
										<td data-label="Статус">
											<span
												className={`registry-status registry-status-${u.status}`}
											>
												{
													{
														active: "Активен",
														disabled: "Отключён",
														pending: "Ожидает доступа",
													}[u.status]
												}
											</span>
										</td>
										<td data-label="Действия">
											<button
												type="button"
												className={`${control} ui-button`}
												disabled={
													busy ||
													u.id === identity?.id ||
													u.roles.includes("creator") ||
													(!owner &&
														u.roles.some(
															(id) => !assignable.some((r) => r.id === id),
														))
												}
												onClick={() => {
													setUserEdit(u);
													setCreate(false);
												}}
											>
												Изменить
											</button>
										</td>
									</tr>
								))}
								{!busy && !users.length && (
									<tr>
										<td colSpan={4} className="py-12 text-center text-muted">
											{query
												? "По вашему запросу сотрудники не найдены"
												: "В реестре пока нет пользователей"}
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
					<div className="ui-actions items-center flex  gap-3">
						<button
							type="button"
							className={`${control} ui-button`}
							disabled={busy || page === 1}
							onClick={() => setPage((p) => p - 1)}
						>
							Назад
						</button>
						<span>Страница {page}</span>
						<button
							type="button"
							className={`${control} ui-button`}
							disabled={busy || page * 50 >= total}
							onClick={() => setPage((p) => p + 1)}
						>
							Далее
						</button>
					</div>
				</>
			)}
			{tab === "roles" && rolesAllowed && (
				<>
					{embedded && (
						<div className="overflow-auto border border-border rounded-lg">
							<table className="w-full text-sm text-left">
								<caption className="p-2 text-left font-semibold">
									Матрица разрешений
								</caption>
								<thead>
									<tr>
										<th className="p-2">Разрешение</th>
										{roles.map((r) => (
											<th key={r.id} className="p-2">
												<button
													type="button"
													className={`${control} ui-button`}
													disabled={
														!rolesAllowed ||
														busy ||
														r.id === "creator" ||
														access?.roles.some((own) => own.id === r.id) ||
														(!owner &&
															r.permissions.some(
																(p) => !access?.permissions.includes(p),
															))
													}
													onClick={() => setRoleEdit(r)}
												>
													{r.name}
												</button>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{["Knowledge", "AI", "Team", "QC", "Administration"].map(
										(group) => (
											<Fragment key={group}>
												{permissions
													.filter((p) => permissionGroup(p.id) === group)
													.map((p, index) => (
														<tr key={p.id} className="border-t border-border">
															<th className="p-2 font-normal">
																{index === 0 && (
																	<span className="block text-xs font-semibold text-muted">
																		{group}
																	</span>
																)}
																{p.name}
																<small className="block text-muted">
																	{p.id}
																</small>
															</th>
															{roles.map((r) => (
																<td
																	key={r.id}
																	className="p-2"
																	aria-label={`${r.name}: ${p.name}`}
																>
																	{r.permissions.includes(p.id) ? "✓" : "—"}
																</td>
															))}
														</tr>
													))}
											</Fragment>
										),
									)}
								</tbody>
							</table>
						</div>
					)}
					<p className="text-sm text-muted">
						Разрешения действуют для всех сотрудников с этой ролью. Собственную
						роль и роль Creator менять нельзя. Технические права закреплены за
						Creator.
					</p>
					{rolesAllowed && (
						<button
							type="button"
							className={`${control} ui-button`}
							disabled={busy}
							onClick={() =>
								setRoleEdit({
									id: "",
									name: "",
									description: "",
									permissions: ["work"],
									is_system: false,
									version: 0,
								})
							}
						>
							Создать роль
						</button>
					)}
					{roleEdit && (
						<EditRole
							key={`${roleEdit.id}-${roleEdit.version}`}
							role={roleEdit}
							permissions={permissions.filter(
								(p) =>
									!p.creator_only &&
									(owner || access?.permissions.includes(p.id)),
							)}
							busy={busy}
							onSave={mutate}
							onCancel={() => setRoleEdit(null)}
						/>
					)}
					<div className="grid gap-3 md:grid-cols-2" hidden={embedded}>
						{roles.map((r) => (
							<div
								key={r.id}
								className="space-y-3 rounded-2xl border border-border bg-background/40 p-5"
							>
								<h3 className="font-semibold">
									{r.name}{" "}
									{r.is_system && (
										<span className="text-xs text-muted">Системная</span>
									)}
								</h3>
								<p className="text-sm text-muted">{r.description}</p>
								<ul className="text-sm">
									{r.permissions.map((p) => (
										<li key={p}>
											{permissions.find((item) => item.id === p)?.name ?? p}
										</li>
									))}
								</ul>
								{rolesAllowed && (
									<button
										type="button"
										className={`${control} ui-button`}
										disabled={
											busy ||
											r.id === "creator" ||
											access?.roles.some((own) => own.id === r.id) ||
											(!owner &&
												r.permissions.some(
													(p) => !access?.permissions.includes(p),
												))
										}
										onClick={() => setRoleEdit(r)}
									>
										Настроить
									</button>
								)}
							</div>
						))}
					</div>
				</>
			)}
			{tab === "audit" && usersAllowed && (
				<>
					{!audit.length && !busy && <p>Изменений доступа пока нет.</p>}
					{audit.map((row) => (
						<details key={row.id} className="rounded border border-border p-3">
							<summary className="cursor-pointer">
								{new Date(row.created_at).toLocaleString("ru")} ·{" "}
								{row.actor_label || "Система"} ·{" "}
								{{
									"content.publish": "Опубликован общий справочник",
									"content.binds_import": "Импорт общих биндов",
									"bind.save": "Изменена личная версия бинда",
									"bind.reset": "Сброс личной версии бинда",
									"user.update": "Изменение пользователя",
									"role.save": "Сохранение роли",
									"role.delete": "Удаление роли",
								}[row.action] ?? row.action}{" "}
								·{" "}
								{row.after_data?.email ??
									row.before_data?.email ??
									row.after_data?.name ??
									row.before_data?.name ??
									row.target_id}
							</summary>
							<div className="grid gap-3 p-3 text-sm md:grid-cols-2">
								<AuditState
									title="До"
									value={row.before_data}
									roleName={roleName}
									permissions={permissions}
								/>
								<AuditState
									title="После"
									value={row.after_data}
									roleName={roleName}
									permissions={permissions}
								/>
							</div>
						</details>
					))}
					{moreAudit && (
						<button
							type="button"
							className={`${control} ui-button`}
							disabled={busy}
							onClick={async () => {
								setBusy(true);
								try {
									const data = await accessApi("audit", undefined, {
										before: String(audit.at(-1)?.id),
									});
									setAudit((rows) => [...rows, ...data.rows]);
									setMoreAudit(data.hasMore);
								} catch (e) {
									setError(e instanceof Error ? e.message : "Ошибка");
								} finally {
									setBusy(false);
								}
							}}
						>
							Показать ещё
						</button>
					)}
				</>
			)}
		</section>
	);
}
function UserDetails({ user, children }: { user: User; children: ReactNode }) {
	const access = useAuthStore((s) => s.session?.user.access);
	const [tab, setTab] = useState("profile"),
		[rows, setRows] = useState<Audit[]>([]),
		[monitor, setMonitor] = useState<MonitorData>(),
		[error, setError] = useState(""),
		[loading, setLoading] = useState(false);
	useEffect(() => {
		if (tab === "profile") return;
		const abort = new AbortController();
		setLoading(true);
		setError("");
		void (async () => {
			try {
				if (tab === "activity") {
					const result = await accessApi(
						"audit",
						undefined,
						{ target: user.id },
						abort.signal,
					);
					if (!abort.signal.aborted) setRows(result.rows);
				} else if (can(access, "monitor.read")) {
					const response = await authenticatedFetch(
						"/api/agent-monitor?action=data&day=" +
							new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10),
						{ signal: abort.signal },
					);
					if (!response.ok) throw new Error("Не удалось загрузить мониторинг");
					const data = await response.json();
					if (!abort.signal.aborted) setMonitor(data);
				}
			} catch (e) {
				if (!abort.signal.aborted) setError((e as Error).message);
			} finally {
				if (!abort.signal.aborted) setLoading(false);
			}
		})();
		return () => abort.abort();
	}, [tab, user.id, access]);
	const agent = monitor?.agents.find(
		(a) => a.id.toLowerCase() === user.email.toLowerCase(),
	);
	return (
		<div className="space-y-3">
			<div
				className="flex flex-wrap gap-2"
				role="tablist"
				aria-label="Карточка сотрудника"
			>
				{[
					["profile", "Профиль, роли и доступ"],
					["activity", "Активность"],
					...(can(access, "monitor.read") ? [["monitor", "Мониторинг"]] : []),
				].map(([id, label]) => (
					<button
						type="button"
						role="tab"
						aria-selected={tab === id}
						key={id}
						className={`${control} ui-button`}
						onClick={() => setTab(id)}
					>
						{label}
					</button>
				))}
			</div>
			<div hidden={tab !== "profile"}>{children}</div>
			{loading && <p>Загрузка…</p>}
			{error && <p role="alert">{error}</p>}
			{tab === "activity" && !loading && (
				<div>
					{!rows.length && <p>Изменений доступа пока нет.</p>}
					{rows.map((row) => (
						<p key={row.id} className="border-b border-border py-2 text-sm">
							{new Date(row.created_at).toLocaleString("ru")} ·{" "}
							{row.actor_label} · {row.action}
						</p>
					))}
				</div>
			)}
			{tab === "monitor" && !loading && (
				<div>
					{agent ? (
						<>
							<p>
								{agent.name}: {agent.status}
							</p>
							<p className="text-sm text-muted">
								Последнее наблюдение:{" "}
								{agent.observed_at
									? new Date(agent.observed_at).toLocaleString("ru")
									: "нет данных"}
							</p>
						</>
					) : (
						<p>В мониторинге нет агента с почтой {user.email}.</p>
					)}
				</div>
			)}
		</div>
	);
}
function RolesChoice({
	roles,
	selected,
	onChange,
	disabled,
}: {
	roles: ManagedRole[];
	selected: string[];
	onChange: (ids: string[]) => void;
	disabled: boolean;
}) {
	return (
		<fieldset disabled={disabled} className="role-choice-grid">
			<legend className="mb-3 text-sm font-semibold">
				Роли сотрудника{" "}
				<span className="ml-2 text-xs font-normal text-muted">
					Выбрано: {selected.length}
				</span>
			</legend>
			{roles.map((r) => (
				<label key={r.id} className="access-role-card">
					<input
						className="sr-only"
						type="checkbox"
						aria-label={r.name}
						checked={selected.includes(r.id)}
						onChange={(e) =>
							onChange(
								e.target.checked
									? [...selected, r.id]
									: selected.filter((id) => id !== r.id),
							)
						}
					/>
					<span className="access-role-heading">
						<span className="access-role-avatar" aria-hidden="true">
							{r.name.slice(0, 2).toUpperCase()}
						</span>
						<span className="font-semibold">{r.name}</span>
						<span className="access-role-state" aria-hidden="true">
							{selected.includes(r.id) ? "Выбрана" : "Добавить"}
						</span>
					</span>
					<span className="mt-3 block text-xs leading-5 text-muted">
						{r.description || "Набор разрешений сотрудника"}
					</span>
					<span className="mt-3 block text-[11px] text-muted">
						Разрешений: {r.permissions.length}
					</span>
				</label>
			))}
		</fieldset>
	);
}

function CreateUser({
	roles,
	busy,
	onSave,
	onCancel,
}: {
	roles: ManagedRole[];
	busy: boolean;
	onSave: (body: unknown) => Promise<void>;
	onCancel: () => void;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [selected, setSelected] = useState<string[]>(
		roles.some((r) => r.id === "support") ? ["support"] : [],
	);
	return (
		<form
			className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
			onSubmit={(e) => {
				e.preventDefault();
				void onSave({
					action: "create",
					email,
					password,
					display_name: name,
					roles: selected,
				});
			}}
		>
			<h3 className="font-semibold">Новый личный аккаунт</h3>
			<div className="flex flex-wrap gap-2">
				<input
					className={control}
					aria-label="Имя нового сотрудника"
					placeholder="Имя"
					maxLength={120}
					value={name}
					onChange={(e) => setName(e.target.value)}
					disabled={busy}
				/>
				<input
					className={control}
					type="email"
					aria-label="Почта нового аккаунта"
					placeholder="Email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={busy}
				/>
				<input
					className={control}
					type="password"
					autoComplete="new-password"
					aria-label="Пароль нового аккаунта"
					placeholder="Пароль от 12 символов"
					required
					minLength={12}
					maxLength={128}
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					disabled={busy}
				/>
			</div>
			<RolesChoice
				roles={roles}
				selected={selected}
				onChange={setSelected}
				disabled={busy}
			/>
			<p className="text-sm text-muted">
				Передайте пароль сотруднику лично. Письмо не отправляется. Сотрудник
				сможет изменить пароль в настройках.
			</p>
			<button
				type="submit"
				className={`${control} ui-button`}
				disabled={busy || !selected.length}
			>
				Создать аккаунт
			</button>{" "}
			<button
				type="button"
				className={`${control} ui-button`}
				disabled={busy}
				onClick={onCancel}
			>
				Отмена
			</button>
		</form>
	);
}
function EditUser({
	user,
	roles,
	permissions,
	busy,
	onSave,
	onCancel,
}: {
	user: User;
	roles: ManagedRole[];
	permissions: Permission[];
	busy: boolean;
	onSave: (body: unknown) => Promise<void>;
	onCancel: () => void;
}) {
	const [name, setName] = useState(user.display_name);
	const [selected, setSelected] = useState(user.roles);
	const [status, setStatus] = useState(user.status);
	const effective = [
		...new Set(
			roles
				.filter((r) => selected.includes(r.id))
				.flatMap((r) => r.permissions),
		),
	];
	return (
		<form
			className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
			onSubmit={(e) => {
				e.preventDefault();
				void onSave({
					action: "user.update",
					payload: {
						id: user.id,
						version: user.version,
						display_name: name,
						roles: selected,
						status,
					},
				});
			}}
		>
			<h3 className="font-semibold">Доступ: {user.email}</h3>
			<input
				className={control}
				aria-label="Имя сотрудника"
				value={name}
				maxLength={120}
				onChange={(e) => setName(e.target.value)}
				disabled={busy}
			/>
			<select
				className={control}
				aria-label="Статус аккаунта"
				value={status}
				onChange={(e) => setStatus(e.target.value)}
				disabled={busy}
			>
				<option value="active">Активен</option>
				<option value="disabled">Отключён</option>
				<option value="pending">Ожидает доступа</option>
			</select>
			<RolesChoice
				roles={roles}
				selected={selected}
				onChange={setSelected}
				disabled={busy}
			/>
			<p className="text-sm">
				Доступ после сохранения:{" "}
				{status !== "active"
					? "закрыт"
					: effective
							.map((id) => permissions.find((p) => p.id === id)?.name ?? id)
							.join(", ") || "нет разрешений"}
				.
			</p>
			<button
				type="submit"
				className={`${control} ui-button`}
				disabled={busy || (status === "active" && !selected.length)}
			>
				Сохранить доступ
			</button>{" "}
			<button
				type="button"
				className={`${control} ui-button`}
				disabled={busy}
				onClick={onCancel}
			>
				Отмена
			</button>
		</form>
	);
}
function EditRole({
	role,
	permissions,
	busy,
	onSave,
	onCancel,
}: {
	role: ManagedRole;
	permissions: Permission[];
	busy: boolean;
	onSave: (body: unknown) => Promise<void>;
	onCancel: () => void;
}) {
	const [id, setId] = useState(role.id);
	const [name, setName] = useState(role.name);
	const [description, setDescription] = useState(role.description);
	const [selected, setSelected] = useState(role.permissions);
	const [deleting, setDeleting] = useState(false);
	return (
		<form
			className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
			onSubmit={(e) => {
				e.preventDefault();
				void onSave({
					action: "role.save",
					payload: {
						id,
						name,
						description,
						permissions: selected,
						version: role.version,
					},
				});
			}}
		>
			<h3 className="font-semibold">
				{role.version ? "Настройка роли" : "Новая роль"}
			</h3>
			<input
				className={control}
				aria-label="Код роли"
				placeholder="Код: support_senior"
				pattern="[a-z][a-z0-9_]{1,39}"
				required
				value={id}
				onChange={(e) => setId(e.target.value)}
				disabled={busy || role.version > 0}
			/>
			<input
				className={control}
				aria-label="Название роли"
				placeholder="Название"
				required
				maxLength={80}
				value={name}
				onChange={(e) => setName(e.target.value)}
				disabled={busy}
			/>
			<input
				className={control}
				aria-label="Описание роли"
				placeholder="Описание"
				maxLength={500}
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				disabled={busy}
			/>
			<fieldset disabled={busy} className="space-y-4">
				<legend className="mb-3 text-sm font-semibold">
					Разрешения{" "}
					<span className="text-muted">· {selected.length} включено</span>
				</legend>
				{Object.entries(
					permissions.reduce<Record<string, Permission[]>>((groups, p) => {
						const key = permissionGroup(p.id);
						groups[key] ??= [];
						groups[key].push(p);
						return groups;
					}, {}),
				).map(([group, items]) => (
					<section key={group} className="rounded-2xl border border-border p-4">
						<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
							{(
								{
									binds: "Бинды",
									knowledge: "Общая база",
									users: "Пользователи",
									roles: "Роли",
									monitor: "Мониторинг",
									ai: "Искусственный интеллект",
									bonuses: "Бонусы",
									projects: "Проекты",
									work: "Рабочее пространство",
									tools: "Инструменты",
									settings: "Настройки",
								} as Record<string, string>
							)[group] ?? group}
						</h4>
						<div className="grid gap-2 md:grid-cols-2">
							{items.map((p) => (
								<label key={p.id} className="access-permission">
									<input
										className="sr-only"
										type="checkbox"
										aria-label={p.name}
										checked={selected.includes(p.id)}
										onChange={(e) =>
											setSelected(
												e.target.checked
													? [...selected, p.id]
													: selected.filter((id) => id !== p.id),
											)
										}
									/>
									<span className="min-w-0 flex-1">
										<span className="block text-sm font-medium">{p.name}</span>
										<span className="mt-1 block text-xs leading-5 text-muted">
											{p.description}
										</span>
									</span>
									<span className="access-switch" aria-hidden="true">
										<span />
									</span>
								</label>
							))}
						</div>
					</section>
				))}
			</fieldset>
			<button type="submit" className={`${control} ui-button`} disabled={busy}>
				Сохранить роль
			</button>{" "}
			<button
				type="button"
				className={`${control} ui-button`}
				disabled={busy}
				onClick={onCancel}
			>
				Отмена
			</button>
			{role.version > 0 && !role.is_system && (
				<>
					<button
						type="button"
						className={`${control} ui-button`}
						disabled={busy}
						onClick={() => setDeleting(true)}
					>
						Удалить роль
					</button>
					{deleting && (
						<p>
							Удаление возможно только если роль никому не назначена.{" "}
							<button
								type="button"
								className={`${control} ui-button`}
								disabled={busy}
								onClick={() =>
									void onSave({
										action: "role.delete",
										payload: { id: role.id, version: role.version },
									})
								}
							>
								Подтвердить удаление
							</button>
						</p>
					)}
				</>
			)}
		</form>
	);
}
function AuditState({
	title,
	value,
	roleName,
	permissions,
}: {
	title: string;
	value: any;
	roleName: (id: string) => string;
	permissions: Permission[];
}) {
	return (
		<div>
			<strong>{title}</strong>
			{!value ? (
				<p>Нет записи</p>
			) : (
				<>
					<p>{value.display_name ?? value.name ?? ""}</p>
					{value.version != null && <p>Версия: {value.version}</p>}
					{value.records != null && <p>Записей: {value.records}</p>}
					{value.source_bind_id && (
						<p className="text-xs text-muted">
							Общий бинд: {value.source_bind_id}
						</p>
					)}
					{Array.isArray(value.translations) &&
						value.translations.map(
							(t: { language: string; title: string; content: string }) => (
								<div
									key={t.language}
									className="mt-2 rounded-lg border border-border p-3"
								>
									<strong>
										{t.title} · {t.language}
									</strong>
									<p className="mt-2 whitespace-pre-wrap break-words text-muted">
										{t.content}
									</p>
								</div>
							),
						)}
					{value.status && (
						<p>
							Статус:{" "}
							{
								{
									active: "Активен",
									disabled: "Отключён",
									pending: "Ожидает доступа",
								}[value.status as string]
							}
						</p>
					)}
					{value.roles && (
						<p>
							Роли:{" "}
							{value.roles
								.map((r: any) => roleName(typeof r === "string" ? r : r.id))
								.join(", ") || "нет"}
						</p>
					)}
					{value.permissions && (
						<p>
							Разрешения:{" "}
							{value.permissions
								.map(
									(id: string) =>
										permissions.find((p) => p.id === id)?.name ?? id,
								)
								.join(", ") || "нет"}
						</p>
					)}
				</>
			)}
		</div>
	);
}
