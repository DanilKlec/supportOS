import type { ReactNode } from "react";
import { Button, Input, Select } from "@/components/ui";
import type { ManagedRole, User } from "./account-types";

export function UsersTable({
	users,
	roles,
	identityId,
	busy,
	total,
	page,
	search,
	query,
	statusFilter,
	roleFilter,
	roleName,
	isEditDisabled,
	onSearchChange,
	onSearch,
	onStatusFilterChange,
	onRoleFilterChange,
	onReset,
	onCreate,
	onEdit,
	onHistory,
	onPreviousPage,
	onNextPage,
	children,
}: {
	users: User[];
	roles: ManagedRole[];
	identityId?: string;
	busy: boolean;
	total: number;
	page: number;
	search: string;
	query: string;
	statusFilter: string;
	roleFilter: string;
	roleName: (id: string) => string;
	isEditDisabled: (user: User) => boolean;
	onSearchChange: (value: string) => void;
	onSearch: () => void;
	onStatusFilterChange: (value: string) => void;
	onRoleFilterChange: (value: string) => void;
	onReset: () => void;
	onCreate: () => void;
	onEdit: (user: User) => void;
	onHistory: (user: User) => void;
	onPreviousPage: () => void;
	onNextPage: () => void;
	children: ReactNode;
}) {
	return (
		<>
			<header className="user-registry-heading">
				<div>
					<p className="section-eyebrow">Команда</p>
					<h1>Пользователи</h1>
					<p>Управляйте аккаунтами, ролями и доступом сотрудников.</p>
				</div>
				<Button variant="primary" disabled={busy} onClick={onCreate}>
					Создать аккаунт
				</Button>
			</header>
			<form
				className="user-registry-filters"
				onSubmit={(e) => {
					e.preventDefault();
					onSearch();
				}}
			>
				<Input
					aria-label="Поиск пользователя"
					placeholder="Почта или имя"
					value={search}
					maxLength={120}
					onChange={(e) => onSearchChange(e.target.value)}
				/>
				<Button type="submit" disabled={busy}>
					Найти
				</Button>
				<Select
					aria-label="Статус сотрудников"
					value={statusFilter}
					onChange={(e) => onStatusFilterChange(e.target.value)}
				>
					<option value="">Все статусы</option>
					<option value="active">Активные</option>
					<option value="pending">Ожидают доступа</option>
					<option value="disabled">Отключены</option>
				</Select>
				<Select
					aria-label="Роль сотрудников"
					value={roleFilter}
					onChange={(e) => onRoleFilterChange(e.target.value)}
				>
					<option value="">Все роли</option>
					{roles.map((role) => (
						<option key={role.id} value={role.id}>
							{role.name}
						</option>
					))}
				</Select>
				{(query || search || statusFilter || roleFilter) && (
					<Button variant="ghost" onClick={onReset}>
						Сбросить
					</Button>
				)}
			</form>
			<p className="text-sm text-muted">
				Найдено: {total} · Страница {page} из{" "}
				{Math.max(1, Math.ceil(total / 50))}
			</p>
			{children}
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
												{u.id === identityId && (
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
									<Button
										variant="secondary"
										disabled={busy}
										onClick={() => onHistory(u)}
									>
										История входов
									</Button>
									<Button
										disabled={isEditDisabled(u)}
										onClick={() => onEdit(u)}
									>
										Изменить
									</Button>
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
				<Button disabled={busy || page === 1} onClick={onPreviousPage}>
					Назад
				</Button>
				<span>Страница {page}</span>
				<Button disabled={busy || page * 50 >= total} onClick={onNextPage}>
					Далее
				</Button>
			</div>
		</>
	);
}
