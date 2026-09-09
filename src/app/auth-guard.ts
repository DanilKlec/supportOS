import { redirect } from "@tanstack/react-router";
import { bootstrapAuth } from "./bootstrap";
import { safeAuthRedirect } from "./auth-redirect";
import { useAuthStore } from "@/store/auth.store";

export async function requireAppAuth({
	location,
}: {
	location: { pathname: string; href: string };
}) {
	await bootstrapAuth();
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
