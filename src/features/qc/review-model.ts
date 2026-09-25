import type { Bind } from "@/entities/bind";
import type { Signals } from "@/features/operations/data";
import type { BindProposal } from "@/services/shared-binds.service";
export interface ReviewItem {
	id: string;
	kind: "proposal" | "gap" | "outdated";
	projectId?: string;
	title: string;
	searchText?: string;
	evidence: string[];
	materialId?: string;
	createdAt: string;
}
export function reviewItems(
	proposals: BindProposal[],
	signals: Signals,
	materials: Bind[],
): ReviewItem[] {
	const items: ReviewItem[] = proposals.map((p) => ({
		id: `proposal:${p.id}`,
		kind: "proposal",
		title: p.translations[0]?.title || "Предложение",
		materialId: p.source_id,
 searchText: p.translations.map(t=>t.content).join(" "),
		evidence: [`Предложение оператора ${p.author}`],
		createdAt: p.created_at,
	}));
	for (const gap of signals.gaps)
		items.push({
			id: `gap:${gap.id}`,
			kind: "gap",
			title: gap.topic,
			projectId: gap.project_id ?? undefined,
			evidence: ["Оператор сообщил об отсутствии ответа"],
			createdAt: gap.created_at,
		});
	const outdated = new Map<string, Signals["feedback"]>();
	for (const row of signals.feedback)
		if (row.kind === "outdated")
			outdated.set(row.bind_id, [...(outdated.get(row.bind_id) ?? []), row]);
	for (const [id, rows] of outdated) {
		const material = materials.find((bind) => bind.id === id);
		const dates = rows.map((r) => r.updated_at).sort();
		items.push({
			id: `outdated:${id}`,
			kind: "outdated",
			title: material?.translations[0]?.title ?? material?.slug ?? id,
			materialId: id,
			searchText: material?.translations
				.map((translation) => translation.content)
				.join(" "),
			evidence: [`${rows.length} отметок «Устарело» в доступной выборке`],
			createdAt: dates.at(-1) ?? "",
		});
	}
	return items.sort((a, b) => {
		const priority = {
			outdated: 0,
			proposal: 1,
			gap: 2,
		};
		return (
			priority[a.kind] - priority[b.kind] ||
			b.createdAt.localeCompare(a.createdAt)
		);
	});
}
export function materialLifecycle(bind: Bind, outdatedIds: Set<string>) {
	return bind.archived
		? "В архиве"
		: outdatedIds.has(bind.id)
			? "Требует проверки"
			: bind.ownerId
				? "Черновик"
				: "Опубликовано";
}
