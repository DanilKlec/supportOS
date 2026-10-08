import { test as base, expect } from "@playwright/test";
import {
	accessToken,
	authSession,
	authUser,
	bindRows,
	fixedTime,
	knowledge,
	permissions,
	roles,
	supportPermissions,
	userId,
	users,
} from "./data";

type VisualAuth = "admin" | "support" | "anonymous" | "invalid";
type Network = { reads: Set<string>; blocked: string[] };

export const test = base.extend<{ network: Network; visualAuth: VisualAuth }>({
	visualAuth: ["admin", { option: true }],
	network: async ({ context, baseURL, visualAuth }, use) => {
		if (baseURL !== "http://127.0.0.1:4173")
			throw new Error("Visual fixture requires its isolated loopback preview");
		const origin = new URL(baseURL).origin;
		const network: Network = { reads: new Set(), blocked: [] };
		const effectivePermissions =
			visualAuth === "support"
				? supportPermissions
				: permissions.map((p) => p.id);
		await context.addInitScript(
			({ session, origin }) => {
				if (location.origin !== origin) return;
				// Only seed the SDK session, not application auth/permission stores.
				if (session)
					localStorage.setItem(
						"sb-supportos-visual-auth-token",
						JSON.stringify(session),
					);
				for (const [key, value] of Object.entries({
					"supportos-theme-mode": "dark",
					"supportos-palette": "slate",
					"supportos-density": "comfortable",
					"supportos-radius": "balanced",
					"supportos-font-scale": "normal",
					"supportos-accent": "#a1a1aa",
				}))
					localStorage.setItem(key, value);
			},
			{ session: visualAuth === "anonymous" ? null : authSession, origin },
		);

		await context.route("**/*", async (route) => {
			const request = route.request();
			const url = new URL(request.url());
			const path = url.pathname;
			const action = url.searchParams.get("action");
			const identity = `${request.method()} ${url.origin}${path}${action ? ` (${action})` : ""}`;
			const json = (body: unknown, status = 200) =>
				route.fulfill({
					status,
					json: body,
					headers: {
						"Access-Control-Allow-Origin": origin,
						"Cache-Control": "no-store",
						"X-Supabase-Api-Version": "2024-01-01",
					},
				});
			const block = async () => {
				network.blocked.push(identity); // Never log headers, tokens or payloads.
				await route.abort("blockedbyclient");
			};
			if (
				url.origin === "https://supportos-visual.invalid" &&
				path === "/auth/v1/user" &&
				request.method() === "GET"
			) {
				if (request.headers().authorization !== `Bearer ${accessToken}`)
					return block();
				network.reads.add("auth/user");
				return visualAuth === "invalid"
					? json({ code: "bad_jwt", message: "Invalid test session" }, 401)
					: json(authUser);
			}
			if (url.origin !== origin || request.method() !== "GET") return block();
			if (!path.startsWith("/api/")) return route.continue();
			if (
				request.headers().authorization !== `Bearer ${accessToken}` ||
				visualAuth === "anonymous"
			)
				return block();
			network.reads.add(`${path}${action ? `?action=${action}` : ""}`);
			if (path === "/api/accounts") {
				switch (action) {
					case "me":
						if (visualAuth === "invalid")
							return json({ error: "Invalid test session" }, 401);
						return json({
							access: {
								userId,
								status: "active",
								roles: [
									roles.find(
										(r) =>
											r.id === (visualAuth === "support" ? "support" : "admin"),
									),
								],
								permissions: effectivePermissions,
							},
						});
					case "catalog":
						return json({ roles, permissions });
					case "users":
						return json({ users, total: users.length, hasMore: false });
					case "telegram-links":
						return json({ requests: [] });
				}
			}
			if (path === "/api/binds") {
				switch (action) {
					case "quality-signals":
						return json({ feedback: [], gaps: [] });
					case "knowledge":
						return json(knowledge);
					case "shared":
						return json({ rows: bindRows });
					case "branches":
						return json({ choices: {}, incoming: [], outgoing: [] });
					case "proposals":
					case "proposal-results":
					case "history":
						return json([]);
					case null:
						if (url.searchParams.get("user_id") === userId)
							return json({ rows: [] });
				}
			}
			if (
				path === "/api/content" &&
				["emails", "bonuses", "bonus-tools"].includes(
					url.searchParams.get("dataset") ?? "",
				)
			) {
				return json({
					id: "visual-publication",
					data: [],
					version: 1,
					updated_at: fixedTime,
				});
			}
			if (path === "/api/projects")
				return json({
					projects: [
						{
							id: "visual-project",
							name: "Тестовый проект",
							slug: "visual-project",
						},
					],
				});
			if (path === "/api/ai/status")
				return json({
					configured: true,
					provider: "openai",
					model: "visual-fixture",
				});
			return block();
		});
		await context.routeWebSocket("**/*", (socket) => {
			const url = new URL(socket.url());
			network.blocked.push(`WEBSOCKET ${url.origin}${url.pathname}`);
			socket.close();
		});
		await use(network);
		expect(
			network.blocked,
			"Unknown API, writes and external requests must not escape the fixture",
		).toEqual([]);
	},
	page: async ({ page, network }, use) => {
		void network; // Install network/auth fixture before navigation.
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.name));
		await page.clock.setFixedTime(new Date(fixedTime));
		await use(page);
		expect(
			errors,
			"Screenshots must not accept an application crash as a baseline",
		).toEqual([]);
	},
});
export { expect };
