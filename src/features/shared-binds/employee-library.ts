import type { Bind } from "@/entities/bind";
import type { BindEmployee } from "@/services/shared-binds.service";

export const employeeName = (employee: BindEmployee) =>
	employee.display_name.trim() || employee.email;
export function employeeInitials(employee: BindEmployee) {
	const parts = employeeName(employee)
		.split(/[\s.@_-]+/)
		.filter(Boolean);
	return parts
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toLocaleUpperCase();
}
// Each shared original has one effective answer; standalone personal materials remain visible.
export function employeeBinds(rows: Bind[], ownerId: string) {
	const shared = rows.filter((b) => b.ownerId === null && !b.archived);
	const personal = rows.filter((b) => b.ownerId === ownerId && !b.archived);
	const originals = new Set(shared.map((b) => b.id)),
		overrides = new Map<string, Bind>();
	for (const bind of personal) {
		if (!bind.sourceBindId || !originals.has(bind.sourceBindId)) continue;
		const previous = overrides.get(bind.sourceBindId);
		if (!previous || bind.updatedAt > previous.updatedAt)
			overrides.set(bind.sourceBindId, bind);
	}
	return [
		...shared.map((base) => overrides.get(base.id) ?? base),
		...personal.filter(
			(b) => !b.sourceBindId || !originals.has(b.sourceBindId),
		),
	];
}
