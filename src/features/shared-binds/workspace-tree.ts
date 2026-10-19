import type { Bind } from "@/entities/bind";
import type { BindLinks } from "./bind-links";

// One visible material per linked branch. Keep each record's real owner and
// location so tree actions still target the employee's own version.
export function workspaceTreeBinds(
	common: Bind[],
	personal: Bind[],
	locals: Bind[],
	links: BindLinks,
	actor: string | undefined,
): Bind[] {
	const bases = new Map(
		[...locals, ...common]
			.filter((bind) => bind.ownerId === null)
			.map((bind) => [bind.id, bind]),
	);
	const own = new Map(
		[...personal, ...locals]
			.filter((bind) => Boolean(actor) && bind.ownerId === actor)
			.map((bind) => [bind.id, bind]),
	);
	const represented = new Set<string>();
	const visible: Bind[] = [];
	for (const base of bases.values()) {
		const branch = own.get(links[base.id] ?? "");
		if (branch) represented.add(branch.id);
		const bind = branch ?? base;
		if (!bind.archived) visible.push(bind);
	}
	for (const bind of own.values()) {
		if (!represented.has(bind.id) && !bind.archived) visible.push(bind);
	}
	return visible;
}
