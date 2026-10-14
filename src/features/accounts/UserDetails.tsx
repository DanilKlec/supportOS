import { type ReactNode, useEffect, useState } from "react";
import { Button, Input, Select, Tabs } from "@/components/ui";
import type { Bind } from "@/entities/bind";
import type { MonitorData } from "@/features/agent-monitor/live-model";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { sharedBindsService } from "@/services/shared-binds.service";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { accessApi } from "./access-api";
import type { Audit, ManagedRole, Permission, User } from "./account-types";
import { UserAccountActions } from "./UserAccountActions";
import "./employee-dialog.css";

export function UserDetails({
	user,
	roles,
	permissions,
	busy,
	editDisabled,
	error,
	onSave,
	onCancel,
}: {
	user: User;
	roles: ManagedRole[];
	permissions: Permission[];
	busy: boolean;
	editDisabled: boolean;
	error: string;
	onSave: (body: unknown) => Promise<void>;
	onCancel: () => void;
}) {
	const ownId = useAuthStore((state) => state.session?.user.id);
	const protection =
		user.id === ownId
			? "Управляйте своим паролем, 2FA и сессиями в личном кабинете. Админские действия над собственным аккаунтом недоступны."
			: user.roles.includes("creator")
				? "Аккаунт Creator защищён от админских действий других пользователей."
				: editDisabled && !busy
					? "Для изменения этого аккаунта нужны права не ниже прав сотрудника."
					: "";
	return (
		<BaseModal
			title="Профиль и доступы сотрудника"
			size="xl"
			className="employee-dialog"
			onClose={onCancel}
			closeDisabled={busy}
		>
			{error && (
				<p role="alert" className="mb-4 text-red-400">
					{error}
				</p>
			)}
			<UserDetailsContent
				key={user.id}
				user={user}
				security={
					<>
						{protection && <p className="employee-info mb-4">{protection}</p>}
						<UserAccountActions
							user={user}
							disabled={editDisabled}
							onSave={onSave}
						/>
					</>
				}
			>
				<EditUser
					key={`${user.id}-${user.version}`}
					user={user}
					roles={roles}
					permissions={permissions}
					busy={editDisabled}
					onSave={onSave}
					onCancel={onCancel}
				/>
			</UserDetailsContent>
		</BaseModal>
	);
}

function UserDetailsContent({
	user,
	children,
	security,
}: {
	user: User;
	children: ReactNode;
	security: ReactNode;
}) {
	const access = useAuthStore((s) => s.session?.user.access);
	const [personalBinds, setPersonalBinds] = useState<Bind[]>([]);
	const [tab, setTab] = useState("profile"),
		[rows, setRows] = useState<Audit[]>([]),
		[monitor, setMonitor] = useState<MonitorData>(),
		[error, setError] = useState(""),
		[loading, setLoading] = useState(false);
	useEffect(() => {
		if (tab === "profile" || tab === "security") return;
		const abort = new AbortController();
		setLoading(true);
		setError("");
		void (async () => {
			try {
				if (tab === "binds" && can(access, "binds.manage")) {
					const data = await sharedBindsService.personal(user.id);
					if (!abort.signal.aborted) setPersonalBinds(data);
				} else if (tab === "activity") {
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
					const data = (await response.json()) as MonitorData;
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
		<div className="employee-content">
			<div className="employee-identity">
				<div className="employee-avatar" aria-hidden="true">
					{(user.display_name || user.email).slice(0, 2).toUpperCase()}
				</div>
				<div>
					<h3>{user.display_name || "Новый сотрудник"}</h3>
					<p>{user.email}</p>
				</div>
				<span className={`employee-status employee-status--${user.status}`}>
					{user.status === "active"
						? "Активен"
						: user.status === "disabled"
							? "Отключён"
							: "Ожидает доступа"}
				</span>
			</div>
			<Tabs
				ariaLabel="Карточка сотрудника"
				value={tab}
				onValueChange={setTab}
				items={[
					{ value: "profile", label: "Профиль, роли и доступ" },
					{ value: "security", label: "Безопасность" },
					{ value: "activity", label: "Активность" },
					...(can(access, "binds.manage")
						? [{ value: "binds", label: "Личные бинды" }]
						: []),
					...(can(access, "monitor.read")
						? [{ value: "monitor", label: "Мониторинг" }]
						: []),
				]}
			/>
			<div className="min-w-0" hidden={tab !== "profile"}>
				{children}
			</div>
			<div hidden={tab !== "security"}>{security}</div>
			{tab === "binds" && !loading && !error && (
				<div>
					{personalBinds.length ? (
						personalBinds.map((bind) => (
							<details
								key={bind.id}
								className="rounded-lg border border-border p-3"
							>
								<summary>{bind.translations[0]?.title || bind.slug}</summary>
								<p className="whitespace-pre-wrap text-sm">
									{bind.translations[0]?.content}
								</p>
							</details>
						))
					) : (
						<p>Личных биндов нет.</p>
					)}
				</div>
			)}
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
		<fieldset disabled={disabled} className="role-choice-grid min-w-0">
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

export function CreateUser({
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
	const [confirmCreate, setConfirmCreate] = useState(false);
	const [selected, setSelected] = useState<string[]>(
		roles.some((r) => r.id === "support") ? ["support"] : [],
	);
	return (
		<form
			className="employee-access-form employee-create-form"
			onSubmit={(e) => {
				e.preventDefault();
				setConfirmCreate(true);
			}}
		>
			<h3 className="font-semibold">Новый личный аккаунт</h3>
			<div className="employee-fields">
				<Input
					aria-label="Имя нового сотрудника"
					placeholder="Имя"
					maxLength={120}
					value={name}
					onChange={(e) => setName(e.target.value)}
					disabled={busy}
				/>
				<Input
					type="email"
					aria-label="Почта нового аккаунта"
					placeholder="Email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={busy}
				/>
				<Input
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
			<Button type="submit" disabled={busy || !selected.length}>
				Создать аккаунт
			</Button>{" "}
			<Button type="button" disabled={busy} onClick={onCancel}>
				Отмена
			</Button>
			{confirmCreate && (
				<BaseModal
					title="Создать аккаунт?"
					size="sm"
					onClose={() => setConfirmCreate(false)}
					closeDisabled={busy}
				>
					<p className="text-sm leading-7">
						Вы уверены, что хотите создать аккаунт{" "}
						<strong className="break-all">{email}</strong>?
					</p>
					<p className="mt-3 text-xs leading-6 text-muted">
						Роли:{" "}
						{roles
							.filter((role) => selected.includes(role.id))
							.map((role) => role.name)
							.join(", ")}
						. Пароль передайте сотруднику лично.
					</p>
					<div className="ui-actions justify-end gap-2 mt-5">
						<Button
							variant="secondary"
							disabled={busy}
							onClick={() => setConfirmCreate(false)}
						>
							Отмена
						</Button>
						<Button
							variant="primary"
							disabled={busy}
							onClick={() => {
								setConfirmCreate(false);
								void onSave({
									action: "create",
									confirmed: true,
									email,
									password,
									display_name: name,
									roles: selected,
								});
							}}
						>
							Да, создать аккаунт
						</Button>
					</div>
				</BaseModal>
			)}
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
	const [status, setStatus] = useState(
		user.status === "pending" ? "active" : user.status,
	);
	const effective = [
		...new Set(
			roles
				.filter((r) => selected.includes(r.id))
				.flatMap((r) => r.permissions),
		),
	];
	return (
		<form
			className="employee-access-form"
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
			{user.status === "pending" && (
				<p className="text-sm text-muted">
					Новая заявка. Выберите роли и подтвердите регистрацию. До
					подтверждения доступ закрыт. Для отклонения выберите статус
					«Отключён».
				</p>
			)}
			<div className="employee-card">
				<div className="employee-section-heading">
					<h3>Личные данные</h3>
					<p>Имя в команде и состояние аккаунта.</p>
				</div>
				<div className="employee-fields">
					<label className="employee-field">
						<span>Имя сотрудника</span>
						<Input
							aria-label="Имя сотрудника"
							value={name}
							maxLength={120}
							onChange={(e) => setName(e.target.value)}
							disabled={busy}
						/>
					</label>
					<label className="employee-field">
						<span>Статус аккаунта</span>
						<Select
							aria-label="Статус аккаунта"
							value={status}
							onChange={(e) => setStatus(e.target.value)}
							disabled={busy}
						>
							<option value="active">Активен</option>
							<option value="disabled">Отключён</option>
							<option value="pending">Ожидает доступа</option>
						</Select>
					</label>
				</div>
			</div>
			<div className="employee-card">
				<RolesChoice
					roles={roles}
					selected={selected}
					onChange={setSelected}
					disabled={busy}
				/>
				<details className="employee-permissions">
					<summary>
						Доступ после сохранения ·{" "}
						{status === "active" ? effective.length : 0} разрешений
					</summary>
					<p>
						{status !== "active"
							? "закрыт"
							: effective
									.map((id) => permissions.find((p) => p.id === id)?.name ?? id)
									.join(", ") || "нет разрешений"}
						.
					</p>
				</details>
			</div>
			<div className="ui-actions employee-access-footer">
				<Button
					variant="primary"
					type="submit"
					disabled={busy || (status === "active" && !selected.length)}
				>
					{user.status === "pending" && status === "active"
						? "Подтвердить и выдать роли"
						: "Сохранить доступ"}
				</Button>
				<Button type="button" disabled={busy} onClick={onCancel}>
					Отмена
				</Button>
			</div>
		</form>
	);
}
