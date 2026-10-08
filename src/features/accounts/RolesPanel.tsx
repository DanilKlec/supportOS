import { Fragment, useState } from "react";
import { Button, Input } from "@/components/ui";
import type { ManagedRole, Permission } from "./account-types";
import {
	PermissionsEditor,
	permissionGroup,
	permissionGroupLabels,
} from "./PermissionsEditor";

export function RolesPanel({
	roles,
	permissions,
	editablePermissions,
	embedded,
	rolesAllowed,
	busy,
	roleEdit,
	isEditDisabled,
	onEdit,
	onSave,
	onCancel,
}: {
	roles: ManagedRole[];
	permissions: Permission[];
	editablePermissions: Permission[];
	embedded: boolean;
	rolesAllowed: boolean;
	busy: boolean;
	roleEdit: ManagedRole | null;
	isEditDisabled: (role: ManagedRole) => boolean;
	onEdit: (role: ManagedRole) => void;
	onSave: (body: unknown) => Promise<void>;
	onCancel: () => void;
}) {
	return (
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
										<Button
											disabled={!rolesAllowed || isEditDisabled(r)}
											onClick={() => onEdit(r)}
										>
											{r.name}
										</Button>
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
																{permissionGroupLabels[group] ?? group}
															</span>
														)}
														{p.name}
														<small className="block text-muted">{p.id}</small>
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
				Разрешения действуют для всех сотрудников с этой ролью. Собственную роль
				и роль Creator менять нельзя. Технические права закреплены за Creator.
			</p>
			{rolesAllowed && (
				<Button
					disabled={busy}
					onClick={() =>
						onEdit({
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
				</Button>
			)}
			{roleEdit && (
				<EditRole
					key={`${roleEdit.id}-${roleEdit.version}`}
					role={roleEdit}
					permissions={editablePermissions}
					busy={busy}
					onSave={onSave}
					onCancel={onCancel}
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
							<Button disabled={isEditDisabled(r)} onClick={() => onEdit(r)}>
								Настроить
							</Button>
						)}
					</div>
				))}
			</div>
		</>
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
			<Input
				aria-label="Код роли"
				placeholder="Код: support_senior"
				pattern="[a-z][a-z0-9_]{1,39}"
				required
				value={id}
				onChange={(e) => setId(e.target.value)}
				disabled={busy || role.version > 0}
			/>
			<Input
				aria-label="Название роли"
				placeholder="Название"
				required
				maxLength={80}
				value={name}
				onChange={(e) => setName(e.target.value)}
				disabled={busy}
			/>
			<Input
				aria-label="Описание роли"
				placeholder="Описание"
				maxLength={500}
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				disabled={busy}
			/>
			<PermissionsEditor
				permissions={permissions}
				selected={selected}
				onChange={setSelected}
				disabled={busy}
			/>
			<Button type="submit" disabled={busy}>
				Сохранить роль
			</Button>{" "}
			<Button type="button" disabled={busy} onClick={onCancel}>
				Отмена
			</Button>
			{role.version > 0 && !role.is_system && (
				<>
					<Button
						type="button"
						disabled={busy}
						onClick={() => setDeleting(true)}
					>
						Удалить роль
					</Button>
					{deleting && (
						<p>
							Удаление возможно только если роль никому не назначена.{" "}
							<Button
								type="button"
								disabled={busy}
								onClick={() =>
									void onSave({
										action: "role.delete",
										payload: { id: role.id, version: role.version },
									})
								}
							>
								Подтвердить удаление
							</Button>
						</p>
					)}
				</>
			)}
		</form>
	);
}
