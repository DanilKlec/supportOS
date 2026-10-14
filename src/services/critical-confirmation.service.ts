import { authenticatedFetch } from "./authenticated-fetch";

export type CriticalProof = { id: string; token: string };
export type CriticalRequest = {
	action: string;
	payload: Record<string, unknown>;
	summary?: string;
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
		throw new Error(data.error ?? "Не удалось получить подтверждение действия");
	return data as CriticalState & { token?: string };
}
export async function beginCritical(request: CriticalRequest) {
	// Passwords never enter the generic confirmation request, even transiently.
	let payload =
		request.action === "user.create"
			? {
					email: request.payload.email,
					roles: request.payload.roles,
					display_name: request.payload.display_name ?? "",
				}
			: request.payload;
	if (request.action === "user.password") {
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(String(request.payload.password ?? "")),
		);
		payload = {
			id: request.payload.id,
			version: request.payload.version,
			password_digest: Array.from(new Uint8Array(digest), (byte) =>
				byte.toString(16).padStart(2, "0"),
			).join(""),
		};
	}
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
