import { redirect } from "@tanstack/react-router";
import { can, routePermission } from "../../shared/access.js";
import { bootstrapAuth } from "./bootstrap";
import { safeAuthRedirect } from "./auth-redirect";
import { useAuthStore } from "@/store/auth.store";

export async function requireAppAuth({
	location,
}: {
	location: { pathname: string; href: string };
}) {
	await bootstrapAuth();
	const session = useAuthStore.getState().session;
	if (
		session &&
		location.pathname.replace(/\/+$/, "") !== "/login" &&
		!can(session.user.access, routePermission(location.pathname)) &&
		location.pathname.replace(/\/+$/, "") !== "/settings"
	)
		throw redirect({ to: "/settings", replace: true });
	if (
		location.pathname.replace(/\/+$/, "") !== "/login" &&
		!useAuthStore.getState().session
	) {
		throw redirect({
			to: "/login",
			search: { redirect: safeAuthRedirect(location.href) },
			replace: true,
		});
	}
}
