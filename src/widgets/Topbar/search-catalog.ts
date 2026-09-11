import type { Freshness } from "@/features/bonuses/bonus-freshness";
import type { Bind } from "@/entities/bind";
import type { BonusProject } from "@/entities/bonus";
import type { ProjectEmailRecord } from "@/entities/project-email";
export interface CatalogResult extends Bind {
	freshness?: Freshness;
	resultKind?: "email" | "bonus";
	projectId?: string;
	projectName?: string;
}
export function catalogResults(
	emails: ProjectEmailRecord[],
	projects: BonusProject[],
): CatalogResult[] {
	const row = (id: string, title: string, content: string): Bind => ({
		id,
		slug: title,
		categoryId: "",
		tags: [],
		translations: [{ language: "ru", title, content, updatedAt: "" }],
		favorite: false,
		archived: false,
		createdAt: "",
		updatedAt: "",
	});
	return [
		...emails.flatMap((p) =>
			[
				["Support", p.supportEmail],
				["KYC", p.kycEmail],
				["VIP", p.vipEmail],
			]
				.filter(([, email]) => !!email)
				.map(([label, email]) => ({
					...row(
						"email:" + p.id + ":" + label,
						p.projectName + " · " + label,
						email,
					),
					resultKind: "email" as const,
					projectName: p.projectName,
				})),
		),
		...projects.flatMap((p) =>
			p.bonuses.map((b) => ({
				...row(
					"bonus:" + p.id + ":" + b.id,
					p.name + " · " + b.name,
					b.content,
				),
				translations: b.translations?.length
					? b.translations.map((t) => ({
							...t,
							title: p.name + " · " + b.name,
						}))
					: row("", "", "").translations.map((t) => ({
							...t,
							title: p.name + " · " + b.name,
							content: b.content,
						})),
				resultKind: "bonus" as const,
				freshness: {
					validUntil: b.validUntil,
					reviewDue: b.reviewDue,
					checkedAt: b.checkedAt,
					responsible: b.responsible,
				},
				projectId: p.id,
				projectName: p.name,
			})),
		),
	];
}
