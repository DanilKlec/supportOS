export function isLightweightRoute(pathname: string) {
	return (
		pathname === "/login" ||
		pathname === "/translator" ||
		pathname.startsWith("/ai/") ||
		(pathname.startsWith("/settings/") && pathname !== "/settings/")
	);
}
