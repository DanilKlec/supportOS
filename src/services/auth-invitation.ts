const fragment =
	typeof window === "undefined"
		? null
		: new URLSearchParams(window.location.hash.slice(1));

// Email invitations open in the recipient's browser, without a PKCE verifier.
let inviteToken =
	fragment?.get("type") === "invite" && fragment.has("refresh_token")
		? fragment.get("access_token")
		: null;

export const isInviteCallback = Boolean(inviteToken);

export function takeInviteToken() {
	const token = inviteToken;
	inviteToken = null;
	return token;
}

const inviteSessionKey = "supportos:invite-session";

export function rememberInviteSession(sessionId: string | null) {
	try {
		if (sessionId) sessionStorage.setItem(inviteSessionKey, sessionId);
		else sessionStorage.removeItem(inviteSessionKey);
	} catch {
		// The invitation still works when the browser blocks session storage.
	}
}

export function rememberedInviteSession() {
	try {
		return sessionStorage.getItem(inviteSessionKey);
	} catch {
		return null;
	}
}
