import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./bootstrap", () => ({ bootstrapAuth: vi.fn(async () => {}) }));

import { useAuthStore } from "@/store/auth.store";
import { requireAppAuth } from "./auth-guard";

afterEach(() => useAuthStore.setState({ session: undefined }));
it("blocks protected loaders on direct links and preserves return path", async () => {
	const loader = vi.fn();
	const root = createRootRoute({ beforeLoad: requireAppAuth });
	const protectedRoute = createRoute({
		getParentRoute: () => root,
		path: "/agent-monitor",
		loader,
	});
	const login = createRoute({ getParentRoute: () => root, path: "/login" });
	const router = createRouter({
		routeTree: root.addChildren([protectedRoute, login]),
		history: createMemoryHistory({
			initialEntries: ["/agent-monitor?day=2026-09-08"],
		}),
	});
	await router.load();
	expect(loader).not.toHaveBeenCalled();
	expect(router.state.redirect?.options).toMatchObject({
		to: "/login",
		search: { redirect: "/agent-monitor?day=2026-09-08" },
	});
});
it("permits a signed-in route and the public login", async () => {
	await expect(
		requireAppAuth({ location: { pathname: "/login", href: "/login" } }),
	).resolves.toBeUndefined();
	useAuthStore.setState({
		session: {
			accessToken: "token",
			telegramVerified: true,
			user: {
				id: "u",
				email: "test@example.test",
				role: "support",
				access: {
					status: "active",
					permissions: ["work", "binds.read"],
					roles: [{ id: "support", name: "Support" }],
					version: 1,
					display_name: "",
				},
			},
		},
	});
	await expect(
		requireAppAuth({
			location: { pathname: "/binds", href: "/binds" },
		}),
	).resolves.toBeUndefined();
	await expect(
		requireAppAuth({ location: { pathname: "/admin", href: "/admin" } }),
	).rejects.toMatchObject({ options: { to: "/settings" } });
});
it("checks permissions before redirecting legacy pages and privileged hashes", async () => {
	useAuthStore.setState({
		session: {
			accessToken: "token",
			telegramVerified: true,
			user: {
				id: "u",
				email: "u@example.test",
				role: "support",
				access: {
					status: "active",
					permissions: ["roles.manage"],
					roles: [],
					version: 1,
					display_name: "",
				},
			},
		},
	});
	await expect(
		requireAppAuth({
			location: {
				pathname: "/settings/users",
				href: "/settings/users#roles",
				hash: "roles",
			},
		}),
	).rejects.toMatchObject({ options: { to: "/admin", hash: "roles" } });
	for (const location of [
		{ pathname: "/settings/users", href: "/settings/users" },
		{
			pathname: "/settings",
			href: "/settings#integrations-ai",
			hash: "integrations-ai",
		},
		{ pathname: "/admin", href: "/admin#audit", hash: "audit" },
	])
		await expect(requireAppAuth({ location })).rejects.toMatchObject({
			options: { to: "/settings", hash: "" },
		});
});
