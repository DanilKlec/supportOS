import { useEffect, useState } from "react";
import { Button, Panel, Tabs } from "@/components/ui";
import type {
	CriticalProof,
	CriticalRequest,
} from "@/services/critical-confirmation.service";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { AdminOverview } from "./AdminOverview";
import { AuditPanel } from "./AuditPanel";
import { accessApi } from "./access-api";
import type { Audit, ManagedRole, Permission, User } from "./account-types";
import { CriticalConfirmationModal } from "./CriticalConfirmationModal";
import { LoginHistoryPanel } from "./LoginHistoryPanel";
import { RolesPanel } from "./RolesPanel";
import { TelegramLinkRequests } from "./TelegramLinkRequests";
import { CreateUser, UserDetails } from "./UserDetails";
import { UsersTable } from "./UsersTable";

export { accessApi } from "./access-api";
export type { ManagedRole } from "./account-types";

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
	const [historyUser, setHistoryUser] = useState<User | null>(null);
	const [roleEdit, setRoleEdit] = useState<ManagedRole | null>(null);
	const [create, setCreate] = useState(false);
	const [critical, setCritical] = useState<{
		body: unknown;
		request: CriticalRequest;
	} | null>(null);
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
	const mutate = async (
		body: unknown,
		confirmed = false,
		proof?: CriticalProof,
	) => {
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
			const result = await accessApi(
				"users",
				proof
					? { ...(body as Record<string, unknown>), confirmation: proof }
					: body,
			);
			setNotice(result.warning ?? "Изменения сохранены");
			setCreate(false);
			setUserEdit(null);
			setRoleEdit(null);
			setCritical(null);
			refresh();
		} catch (e) {
			if (
				!proof &&
				e instanceof Error &&
				"code" in e &&
				e.code === "critical_confirmation_required"
			) {
				setCritical({
					body,
					request: {
						action: change.action === "create" ? "user.create" : change.action,
						payload: (change.action === "create"
							? body
							: change.payload) as Record<string, unknown>,
					},
				});
				return;
			}
			setError(e instanceof Error ? e.message : "Ошибка");
			if (proof) throw e;
		} finally {
			setBusy(false);
		}
	};
	const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
	const isUserEditDisabled = (user: User) =>
		busy ||
		user.id === identity?.id ||
		user.roles.includes("creator") ||
		(!owner &&
			user.roles.some((id) => !assignable.some((role) => role.id === id)));
	const isRoleEditDisabled = (role: ManagedRole) =>
		busy ||
		role.id === "creator" ||
		access?.roles.some((own) => own.id === role.id) ||
		(!owner && role.permissions.some((p) => !access?.permissions.includes(p)));
	const loadMoreAudit = async () => {
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
	};

	return (
		<Panel className="accounts-registry space-y-5 p-4 sm:p-6">
			{critical && (
				<CriticalConfirmationModal
					request={critical.request}
					onClose={() => setCritical(null)}
					onExecute={(proof) => mutate(critical.body, true, proof)}
				/>
			)}
			{historyUser && usersAllowed && (
				<BaseModal
					title={`История входов · ${historyUser.display_name || historyUser.email}`}
					placement="right"
					onClose={() => setHistoryUser(null)}
				>
					<LoginHistoryPanel
						key={historyUser.id}
						userId={historyUser.id}
						embedded
					/>
				</BaseModal>
			)}
			{usersAllowed && <TelegramLinkRequests />}
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
					<div className="ui-actions items-center mt-4 gap-2">
						<Button
							onClick={() => {
								const body = confirmation.body;
								setConfirmation(null);
								void mutate(body, true);
							}}
						>
							Подтвердить изменения
						</Button>
						<Button onClick={() => setConfirmation(null)}>Отмена</Button>
					</div>
				</BaseModal>
			)}
			{!standalone && (
				<h2 className="text-xl font-semibold">Пользователи, роли и доступы</h2>
			)}
			<Tabs
				className="items-center"
				ariaLabel="Управление доступами"
				value={tab}
				items={[
					...(!standalone && usersAllowed
						? [{ value: "overview", label: "Обзор" }]
						: []),
					{ value: "users", label: "Пользователи" },
					{ value: "roles", label: "Роли и разрешения" },
					{ value: "audit", label: "Журнал изменений" },
				]
					.filter((item) =>
						item.value === "roles" ? rolesAllowed : usersAllowed,
					)
					.map((item) => ({ ...item, disabled: busy }))}
				onValueChange={(nextTab) => {
					setTab(nextTab);
					setUserEdit(null);
					setRoleEdit(null);
					setCreate(false);
				}}
			/>
			<Button disabled={busy} onClick={refresh}>
				Обновить
			</Button>
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
				<UsersTable
					users={users}
					roles={roles}
					identityId={identity?.id}
					busy={busy}
					total={total}
					page={page}
					search={search}
					query={query}
					statusFilter={statusFilter}
					roleFilter={roleFilter}
					roleName={roleName}
					isEditDisabled={isUserEditDisabled}
					onSearchChange={setSearch}
					onSearch={() => {
						setQuery(search);
						setPage(1);
						refresh();
					}}
					onStatusFilterChange={(value) => {
						setStatusFilter(value);
						setPage(1);
					}}
					onRoleFilterChange={(value) => {
						setRoleFilter(value);
						setPage(1);
					}}
					onReset={() => {
						setSearch("");
						setQuery("");
						setStatusFilter("");
						setRoleFilter("");
						setPage(1);
					}}
					onCreate={() => {
						setCreate(true);
						setUserEdit(null);
					}}
					onEdit={(user) => {
						setUserEdit(user);
						setCreate(false);
					}}
					onHistory={setHistoryUser}
					onPreviousPage={() => setPage((p) => p - 1)}
					onNextPage={() => setPage((p) => p + 1)}
				>
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
						<UserDetails
							user={userEdit}
							roles={assignable}
							permissions={permissions}
							busy={busy}
							editDisabled={isUserEditDisabled(userEdit)}
							error={error}
							onSave={mutate}
							onCancel={() => setUserEdit(null)}
						/>
					)}
				</UsersTable>
			)}
			{tab === "roles" && rolesAllowed && (
				<RolesPanel
					roles={roles}
					permissions={permissions}
					editablePermissions={permissions.filter(
						(p) =>
							!p.creator_only && (owner || access?.permissions.includes(p.id)),
					)}
					embedded={embedded}
					rolesAllowed={rolesAllowed}
					busy={busy}
					roleEdit={roleEdit}
					isEditDisabled={isRoleEditDisabled}
					onEdit={setRoleEdit}
					onSave={mutate}
					onCancel={() => setRoleEdit(null)}
				/>
			)}
			{tab === "audit" && usersAllowed && (
				<AuditPanel
					audit={audit}
					busy={busy}
					moreAudit={moreAudit}
					roleName={roleName}
					permissions={permissions}
					onLoadMore={loadMoreAudit}
				/>
			)}
		</Panel>
	);
}
