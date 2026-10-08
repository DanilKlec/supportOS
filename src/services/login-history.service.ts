import { authenticatedFetch } from "./authenticated-fetch";

export type LoginEventType =
	| "login_approved"
	| "login_rejected"
	| "password_changed"
	| "sessions_revoked";
export interface LoginEvent {
	id: string;
	user_id: string;
	session_id: string | null;
	event_type: LoginEventType;
	created_at: string;
	ip_hash: string | null;
	browser: string | null;
	os: string | null;
	telegram_result: "approved" | "rejected" | "not_confirmed" | null;
}
export interface LoginHistoryPage {
	events: LoginEvent[];
	nextCursor: string | null;
}
const unavailable = () =>
	new Error("Не удалось загрузить историю входов. Повторите попытку.");

export async function loadLoginHistory(
	target?: string,
	before?: string,
	signal?: AbortSignal,
): Promise<LoginHistoryPage> {
	const params = new URLSearchParams({ action: "login-history" });
	if (target) params.set("target", target);
	if (before) params.set("before", before);
	const response = await authenticatedFetch(`/api/accounts?${params}`, {
		cache: "no-store",
		signal,
	}).catch((error: unknown) => {
		if (signal?.aborted) throw error;
		throw unavailable();
	});
	if (!response.ok)
		throw response.status === 401
			? new Error("Сессия недействительна. Войдите снова.")
			: response.status === 403
				? new Error("Нет доступа к истории входов.")
				: unavailable();
	const data = await response.json().catch(() => {
		throw unavailable();
	});
	if (!Array.isArray(data?.events)) throw unavailable();
	const text = (value: unknown) => (typeof value === "string" ? value : null);
	const events = data.events.map((row: Record<string, unknown>): LoginEvent => {
		if (
			!row ||
			typeof row.id !== "string" ||
			typeof row.user_id !== "string" ||
			typeof row.created_at !== "string" ||
			![
				"login_approved",
				"login_rejected",
				"password_changed",
				"sessions_revoked",
			].includes(String(row.event_type))
		)
			throw unavailable();
		return {
			id: row.id,
			user_id: row.user_id,
			session_id: text(row.session_id),
			event_type: row.event_type as LoginEventType,
			created_at: row.created_at,
			ip_hash:
				typeof row.ip_hash === "string" && /^[a-f0-9]{64}$/.test(row.ip_hash)
					? row.ip_hash
					: null,
			browser: text(row.browser),
			os: text(row.os),
			telegram_result: ["approved", "rejected", "not_confirmed"].includes(
				String(row.telegram_result),
			)
				? (row.telegram_result as LoginEvent["telegram_result"])
				: null,
		};
	});
	return { events, nextCursor: text(data.nextCursor) };
}
