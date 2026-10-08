import { Button } from "@/components/ui";
import type { Audit, AuditSnapshot, Permission } from "./account-types";

export function AuditPanel({
	audit,
	busy,
	moreAudit,
	roleName,
	permissions,
	onLoadMore,
}: {
	audit: Audit[];
	busy: boolean;
	moreAudit: boolean;
	roleName: (id: string) => string;
	permissions: Permission[];
	onLoadMore: () => Promise<void>;
}) {
	return (
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
				<Button disabled={busy} onClick={onLoadMore}>
					Показать ещё
				</Button>
			)}
		</>
	);
}

function AuditState({
	title,
	value,
	roleName,
	permissions,
}: {
	title: string;
	value: AuditSnapshot | null;
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
								.map((r) => roleName(typeof r === "string" ? r : r.id))
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
