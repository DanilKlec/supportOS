import { authenticatedFetch } from "./authenticated-fetch";

export interface ActiveSession {
	id: string;
	created_at: string | null;
	updated_at: string | null;
	refreshed_at: string | null;
	user_agent: string | null;
	is_current: boolean;
}

export async function loadActiveSessions(
	signal?: AbortSignal,
): Promise<ActiveSession[]> {
	const response = await authenticatedFetch("/api/accounts?action=sessions", {
		cache: "no-store",
		signal,
	}).catch((error: unknown) => {
		if (signal?.aborted) throw error;
		throw new Error("Не удалось загрузить активные сессии. Повторите попытку.");
	});
	if (!response.ok) {
		throw new Error(
			response.status === 401
				? "Сессия недействительна. Войдите снова."
				: response.status === 403
					? "Нет доступа к активным сессиям."
					: "Не удалось загрузить активные сессии. Повторите попытку.",
		);
	}
	const payload = await response.json().catch(() => {
		throw new Error("Не удалось загрузить активные сессии. Повторите попытку.");
	});
	if (!Array.isArray(payload?.sessions)) {
		throw new Error("Не удалось загрузить активные сессии. Повторите попытку.");
	}
	const text = (value: unknown) => (typeof value === "string" ? value : null);
	return payload.sessions.map((row: Record<string, unknown>) => {
		if (!row || typeof row.id !== "string") {
			throw new Error(
				"Не удалось загрузить активные сессии. Повторите попытку.",
			);
		}
		// Keep only display metadata in the in-memory query cache.
		return {
			id: row.id,
			created_at: text(row.created_at),
			updated_at: text(row.updated_at),
			refreshed_at: text(row.refreshed_at),
			user_agent: text(row.user_agent),
			is_current: row.is_current === true,
		};
	});
}
