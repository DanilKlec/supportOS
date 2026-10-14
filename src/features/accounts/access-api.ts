import { authenticatedFetch } from "@/services/authenticated-fetch";
import type { AccessMutationResponse, AccessResponses } from "./account-types";

export function accessApi<Action extends keyof AccessResponses>(
	action: Action,
	body?: undefined,
	params?: Record<string, string>,
	signal?: AbortSignal,
): Promise<AccessResponses[Action]>;
export function accessApi(
	action: string,
	body: unknown,
	params?: Record<string, string>,
	signal?: AbortSignal,
): Promise<AccessMutationResponse>;
export async function accessApi(
	action: string,
	body?: unknown,
	params: Record<string, string> = {},
	signal?: AbortSignal,
): Promise<unknown> {
	const response = await authenticatedFetch(
		`/api/accounts?${new URLSearchParams({ action, ...params })}`,
		{
			method: body === undefined ? "GET" : "POST",
			headers: { "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal,
		},
	);
	const data: unknown = await response.json();
	if (!response.ok)
		throw Object.assign(
			new Error(
				(data as { error?: string }).error ?? "Ошибка управления доступами",
			),
			{ status: response.status, code: (data as { code?: string }).code },
		);
	return data;
}
