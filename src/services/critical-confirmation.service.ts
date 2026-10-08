import { authenticatedFetch } from "./authenticated-fetch";

export type CriticalProof = { id: string; token: string };
export type CriticalRequest = {
	action: string;
	payload: Record<string, unknown>;
};
export type CriticalState = {
	id: string;
	status:
		| "pending"
		| "approved"
		| "rejected"
		| "expired"
		| "consumed"
		| "completed";
	expiresAt: string;
};
export async function criticalRequest(
	body: Record<string, unknown>,
	signal?: AbortSignal,
) {
	const response = await authenticatedFetch("/api/accounts?action=critical", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	const data = await response.json();
	if (!response.ok)
		throw new Error(data.error ?? "Не удалось получить подтверждение Telegram");
	return data as CriticalState & { token?: string };
}
export async function beginCritical(request: CriticalRequest) {
	// Passwords never enter the generic confirmation request, even transiently.
	const payload =
		request.action === "user.create"
			? {
					email: request.payload.email,
					roles: request.payload.roles,
					display_name: request.payload.display_name ?? "",
				}
			: request.payload;
	return criticalRequest({
		operation: "begin",
		action: request.action,
		payload,
	});
}
export async function confirmedAccountAction(
	action: string,
	confirmation: CriticalProof,
) {
	const response = await authenticatedFetch(`/api/accounts?action=${action}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ confirmation }),
	});
	const data = await response.json();
	if (!response.ok)
		throw new Error(data.error ?? "Не удалось выполнить действие");
	return data;
}
