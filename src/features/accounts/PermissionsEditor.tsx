import type { Permission } from "./account-types";

export const permissionGroupLabels: Record<string, string> = {
	Knowledge: "Материалы",
	AI: "Искусственный интеллект",
	Team: "Команда",
	QC: "QC",
	Administration: "Администрирование",
};

export const permissionGroup = (id: string) => {
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

export function PermissionsEditor({
	permissions,
	selected,
	onChange,
	disabled,
}: {
	permissions: Permission[];
	selected: string[];
	onChange: (ids: string[]) => void;
	disabled: boolean;
}) {
	return (
		<fieldset disabled={disabled} className="space-y-4">
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
						{permissionGroupLabels[group] ?? group}
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
										onChange(
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
	);
}
