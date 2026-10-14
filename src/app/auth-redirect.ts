// Only allow local app paths; never forward credentials to an external URL.
export function safeAuthRedirect(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value.startsWith("/") ||
		value.startsWith("//") ||
		Array.from(value).some((char) => char === "\\" || char.charCodeAt(0) <= 32)
	)
		return "/";
	try {
		const url = new URL(value, "https://supportos.local");
		if (
			url.origin !== "https://supportos.local" ||
			url.pathname.replace(/\/+$/, "") === "/login"
		)
			return "/";
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return "/";
	}
}
