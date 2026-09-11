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
): Promise<Publication | null> {
	const response = await authenticatedFetch(
		`/api/content?dataset=${dataset}`,
		data === undefined
			? undefined
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ dataset, data, expected }),
				},
	);
	const result = await response.json();
	if (!response.ok)
		throw new Error(result.error ?? "Ошибка общего справочника");
	return result;
}
