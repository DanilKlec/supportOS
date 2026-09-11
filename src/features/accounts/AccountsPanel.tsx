import { BaseModal } from "@/shared/modals/BaseModal";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
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
}: {
	standalone?: boolean;
}) {
	const identity = useAuthStore((s) => s.session?.user);
	const access = identity?.access;
	const usersAllowed = can(access, "users.manage");
	const rolesAllowed = can(access, "roles.manage");
	const owner = access?.roles.some((r) => r.id === "creator") ?? false;
	const [tab, setTab] = useState(usersAllowed ? "users" : "roles");
	const [roles, setRoles] = useState<ManagedRole[]>([]);
	const [permissions, setPermissions] = useState<Permission[]>([]);
	const [users, setUsers] = useState<User[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");
	const [revision, setRevision] = useState(0);
	const [audit, setAudit] = useState<Audit[]>([]);
	const [moreAudit, setMoreAudit] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [userEdit, setUserEdit] = useState<User | null>(null);
	const [roleEdit, setRoleEdit] = useState<ManagedRole | null>(null);
	const [create, setCreate] = useState(false);
	const refresh = () => setRevision((r) => r + 1);
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
						{ page: String(page), search: query },
						abort.signal,
					);
					if (abort.signal.aborted) return;
					setUsers(data.users);
					setTotal(data.total);
				}
				if (tab === "audit") {
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
	}, [tab, page, query, revision, usersAllowed]);
	const assignable = roles.filter(
		(r) =>
			owner ||
			(r.id !== "creator" &&
				r.permissions.every((p) => access?.permissions.includes(p))),
	);
	const mutate = async (body: unknown) => {
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
			{!standalone && (
				<h2 className="text-xl font-semibold">Пользователи, роли и доступы</h2>
			)}
			<div
				className="flex flex-wrap gap-2"
				role="tablist"
				aria-label="Управление доступами"
			>
				{[
					["users", "Пользователи"],
					["roles", "Роли и разрешения"],
					["audit", "Журнал изменений"],
				]
					.filter(([id]) => id !== "users" || usersAllowed)
					.map(([id, label]) => (
						<button
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
				<button className={control} disabled={busy} onClick={refresh}>
					Обновить
				</button>
			</div>
			{busy && <p role="status">Загрузка…</p>}
			{error && !create && !userEdit && (
				<p role="alert" className="text-red-400">
					{error}
				</p>
			)}
			{notice && <p role="status">{notice}</p>}
			{tab === "users" && usersAllowed && (
				<>
					<form
						className="flex flex-wrap gap-2"
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
						<button className={control} disabled={busy}>
							Найти
						</button>
						<button
							type="button"
							className={control}
							disabled={busy}
							onClick={() => {
								setCreate(true);
								setUserEdit(null);
							}}
						>
							Создать аккаунт
						</button>
					</form>
					<p className="text-sm text-muted">
						Найдено: {total}. У одного сотрудника может быть несколько ролей —
						их разрешения объединяются.
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
							size="lg"
							onClose={() => setUserEdit(null)}
							closeDisabled={busy}
						>
							{error && (
								<p role="alert" className="mb-4 text-red-400">
									{error}
								</p>
							)}
							<EditUser
								key={`${userEdit.id}-${userEdit.version}`}
								user={userEdit}
								roles={assignable}
								permissions={permissions}
								busy={busy}
								onSave={mutate}
								onCancel={() => setUserEdit(null)}
							/>
						</BaseModal>
					)}
					<div className="overflow-auto rounded-xl border border-border">
						<table className="w-full min-w-[680px] text-left text-sm">
							<thead className="bg-background/70 text-xs text-muted">
								<tr>
									<th>Сотрудник</th>
									<th>Роли</th>
									<th>Статус</th>
									<th>Действия</th>
								</tr>
							</thead>
							<tbody>
								{users.map((u) => (
									<tr
										key={u.id}
										className="border-t border-border/60 transition hover:bg-surface-elevated/40"
									>
										<td className="py-3">
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
										<td>
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
										<td>
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
										<td>
											<button
												className={control}
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
					<div className="flex items-center gap-3">
						<button
							className={control}
							disabled={busy || page === 1}
							onClick={() => setPage((p) => p - 1)}
						>
							Назад
						</button>
						<span>Страница {page}</span>
						<button
							className={control}
							disabled={busy || page * 50 >= total}
							onClick={() => setPage((p) => p + 1)}
						>
							Далее
						</button>
					</div>
				</>
			)}
			{tab === "roles" && (
				<>
					<p className="text-sm text-muted">
						Разрешения действуют для всех сотрудников с этой ролью. Собственную
						роль и роль Creator менять нельзя. Технические права закреплены за
						Creator.
					</p>
					{rolesAllowed && (
						<button
							className={control}
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
					<div className="grid gap-3 md:grid-cols-2">
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
										className={control}
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
			{tab === "audit" && (
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
							className={control}
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
		<fieldset disabled={disabled} className="flex flex-wrap gap-4">
			<legend className="mb-2">Роли сотрудника</legend>
			{roles.map((r) => (
				<label key={r.id}>
					<input
						type="checkbox"
						checked={selected.includes(r.id)}
						onChange={(e) =>
							onChange(
								e.target.checked
									? [...selected, r.id]
									: selected.filter((id) => id !== r.id),
							)
						}
					/>{" "}
					{r.name}
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
			className="space-y-3 rounded border border-border p-4"
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
			<button className={control} disabled={busy || !selected.length}>
				Создать аккаунт
			</button>{" "}
			<button
				type="button"
				className={control}
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
			className="space-y-3 rounded border border-border p-4"
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
				className={control}
				disabled={busy || (status === "active" && !selected.length)}
			>
				Сохранить доступ
			</button>{" "}
			<button
				type="button"
				className={control}
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
			className="space-y-3 rounded border border-border p-4"
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
			<fieldset disabled={busy} className="grid gap-2 md:grid-cols-2">
				<legend>Разрешения</legend>
				{permissions.map((p) => (
					<label key={p.id} className="rounded border border-border p-2">
						<input
							type="checkbox"
							checked={selected.includes(p.id)}
							onChange={(e) =>
								setSelected(
									e.target.checked
										? [...selected, p.id]
										: selected.filter((id) => id !== p.id),
								)
							}
						/>{" "}
						{p.name}
						<span className="block text-xs text-muted">{p.description}</span>
					</label>
				))}
			</fieldset>
			<button className={control} disabled={busy}>
				Сохранить роль
			</button>{" "}
			<button
				type="button"
				className={control}
				disabled={busy}
				onClick={onCancel}
			>
				Отмена
			</button>
			{role.version > 0 && !role.is_system && (
				<>
					<button
						type="button"
						className={control}
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
								className={control}
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
