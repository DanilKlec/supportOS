import type { Bind } from "@/entities/bind";
export type BindLinks = Record<string, string | null>;
// Explicit links survive renamed slugs and temporarily missing records.
export function reconcileBindLinks(
	common: Bind[],
	locals: Bind[],
	saved: BindLinks,
): BindLinks {
	const next = { ...saved };
	const reserved = new Set(
		Object.values(saved).filter((v): v is string => typeof v === "string"),
	);
	const bases = common.filter((b) => !b.archived);
	const available = locals.filter((b) => !b.archived);
	for (const base of bases) {
		// A self-link belongs to the original common snapshot. Its personal
		// replacement takes over once that snapshot record has been replaced.
		if (
			Object.hasOwn(next, base.id) &&
			!(next[base.id] === base.id && !locals.some((b) => b.id === base.id))
		)
			continue;
		// An archived personal branch still shadows its source until restored.
		const exact = locals.filter(
			(b) => b.id === base.id || b.sourceBindId === base.id,
		);
		if (exact.length === 1 && !reserved.has(exact[0].id)) {
			next[base.id] = exact[0].id;
			reserved.add(exact[0].id);
		}
	}
	for (const base of bases) {
		if (
			Object.hasOwn(next, base.id) ||
			!base.slug ||
			bases.filter((b) => b.slug === base.slug).length !== 1
		)
			continue;
		const candidates = available.filter(
			(b) => !reserved.has(b.id) && !b.sourceBindId && b.slug === base.slug,
		);
		if (candidates.length === 1) {
			next[base.id] = candidates[0].id;
			reserved.add(candidates[0].id);
		}
	}
	return next;
}
export function setBindLink(
	links: BindLinks,
	source: string,
	local: string | null,
): BindLinks {
	if (
		local &&
		Object.entries(links).some(
			([id, value]) => id !== source && value === local,
		)
	)
		throw new Error(
			"Этот личный бинд уже связан с другим общим биндом. Сначала разорвите прежнюю связь.",
		);
	return { ...links, [source]: local };
}
