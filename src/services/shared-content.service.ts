import type { BonusProject } from "@/entities/bonus";
import type { ProjectEmailRecord } from "@/entities/project-email";
import {
	type LegacyProjectEmailRecord,
	normalizeProjectEmail,
} from "../../shared/project-emails.js";
import { authenticatedFetch } from "./authenticated-fetch";
import type { BonusToolsData } from "./bonus-tools.service";
export interface Publication<Row = unknown> {
	id: string;
	data: Row[];
	version: number;
	updated_at: string;
}
type ContentRecords = {
	emails: ProjectEmailRecord;
	bonuses: BonusProject;
	"bonus-tools": BonusToolsData;
};
type ContentRecord<Dataset extends string> =
	Dataset extends keyof ContentRecords ? ContentRecords[Dataset] : unknown;

export async function contentApi<
	Dataset extends string,
	Row = ContentRecord<Dataset>,
>(
	dataset: Dataset,
	data?: unknown[],
	expected?: number,
	scope: "shared" | "personal" = "shared",
	action: "save" | "reset" = "save",
): Promise<Publication<Row> | null> {
	const response = await authenticatedFetch(
		`/api/content?dataset=${dataset}&scope=${scope}`,
		data === undefined
			? undefined
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ dataset, data, expected, scope, action }),
				},
	);
	const result: unknown = await response.json();
	if (!response.ok)
		throw new Error(
			(result as { error?: string }).error ?? "Ошибка общего справочника",
		);
	const publication = result as Publication<Row> | null;
	return dataset === "emails" && publication
		? {
				...publication,
				data: (publication.data as LegacyProjectEmailRecord[]).map(
					normalizeProjectEmail,
				) as Row[],
			}
		: publication;
}
