import { authenticatedFetch } from "./authenticated-fetch";
export interface Publication {
	id: string;
	data: any[];
	version: number;
	updated_at: string;
}
export async function contentApi(
	dataset: string,
	data?: unknown[],
	expected?: number,
	scope: 'shared'|'personal' = 'shared',
	action: 'save'|'reset' = 'save',
): Promise<Publication | null> {
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
	const result = await response.json();
	if (!response.ok)
		throw new Error(result.error ?? "Ошибка общего справочника");
	return result;
}
