export interface TelegramChallenge {
	login: string;
	browserToken: string;
	telegramUrl: string;
	expiresAt: string;
}
const storageKey = "supportos:telegram-registration";
export function readTelegramChallenge(): TelegramChallenge | undefined {
	try {
		const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
		if (
			value &&
			/^[A-Za-z0-9_-]{43}$/.test(value.browserToken) &&
			/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=[A-Za-z0-9_-]{43}$/.test(
				value.telegramUrl,
			) &&
			typeof value.login === "string" &&
			Date.parse(value.expiresAt) > Date.now()
		)
			return value;
	} catch {
		/* Storage is optional; the current tab can still finish. */
	}
	return undefined;
}
export function saveTelegramChallenge(value?: TelegramChallenge) {
	try {
		if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
		else sessionStorage.removeItem(storageKey);
	} catch {
		/* No passwords are stored. */
	}
}
export async function registrationRequest<T>(
	action: "begin" | "status" | "complete",
	body: Record<string, unknown>,
): Promise<T> {
	const response = await fetch(`/api/registration?action=${action}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20000),
	});
	const result = await response.json();
	if (!response.ok)
		throw new Error(
			result.error || "Не удалось связаться с сервисом регистрации",
		);
	return result;
}
