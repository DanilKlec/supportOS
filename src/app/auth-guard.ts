import { redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../shared/access.js";
import { safeAuthRedirect } from "./auth-redirect";
import { bootstrapAuth } from "./bootstrap";

export async function requireAppAuth({
	location,
}: {
	location: { pathname: string; href: string; hash?: string };
}) {
	await bootstrapAuth();
	const session = useAuthStore.getState().session;
	const path = location.pathname.replace(/\/+$/, "") || "/";
	if (path === "/login") return;
	if (!session)
		throw redirect({
			to: "/login",
			search: { redirect: safeAuthRedirect(location.href) },
			replace: true,
		});
	const hash = location.hash ?? location.href.split("#")[1] ?? "";
	const destination = canonicalPage(path, hash);
	if (
		!canAccessPage(session.user.access, destination.to, destination.hash) &&
		!(destination.to === "/settings" && !destination.hash)
	)
		throw redirect({ to: "/settings", hash: "", replace: true });
	if (destination.to !== path || destination.hash !== hash)
		throw redirect({ ...destination, replace: true });
}
