import type { Bind } from "@/entities/bind";
import type { Signals } from "@/features/operations/data";
import type { BindProposal } from "@/services/shared-binds.service";
export interface ReviewItem {
	id: string;
	source: "agent" | "system" | "ai";
	kind: "proposal" | "candidate" | "conflict" | "gap" | "outdated";
	projectId?: string;
	title: string;
 searchText?: string;
	risk?: "low" | "medium" | "high";
	confidence?: number;
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
		source: "agent",
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
			source: "agent",
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
		const dates = rows.map((r) => r.updated_at).sort();
		items.push({
			id: `outdated:${id}`,
			source: "agent",
			kind: "outdated",
			title: materials.find((b) => b.id === id)?.translations[0]?.title ?? id,
			materialId: id,
 searchText: materials.find(b=>b.id===id)?.translations.map(t=>t.content).join(" "),
			evidence: [`${rows.length} отметок «Устарело» в доступной выборке`],
			createdAt: dates.at(-1) ?? "",
		});
	}
	return items.sort((a, b) => {
		const priority = {
			outdated: 0,
			proposal: 1,
			gap: 2,
			candidate: 3,
			conflict: 0,
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
