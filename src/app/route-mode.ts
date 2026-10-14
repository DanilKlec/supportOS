export function isLightweightRoute(pathname: string) {
	return (
		pathname === "/login" ||
		pathname === "/shared-binds" ||
		pathname === "/translator" ||
		pathname.startsWith("/ai/") ||
		(pathname.startsWith("/settings/") && pathname !== "/settings/")
	);
}
