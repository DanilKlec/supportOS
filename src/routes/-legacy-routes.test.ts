import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import { expect, it, vi } from "vitest";
import { Route as Assistant } from "./ai/assistant";
import { Route as Knowledge } from "./ai/knowledge";
import { Route as BonusTools } from "./bonus-tools";
import { Route as Content } from "./content";
import { Route as AISettings } from "./settings/ai";
import { Route as TranslatorSettings } from "./settings/translator";
import { Route as Users } from "./settings/users";
import { Route as SharedBinds } from "./shared-binds";

const bookmarks = [
	{ route: Content, path: "/content", hash: "", to: "/qc", target: "overview" },
	{
		route: Content,
		path: "/content",
		hash: "old",
		to: "/qc",
		target: "overview",
	},
	{
		route: SharedBinds,
		path: "/shared-binds",
		hash: "",
		to: "/qc",
		target: "materials",
	},
	{
		route: SharedBinds,
		path: "/shared-binds",
		hash: "proposals",
		to: "/qc",
		target: "proposals",
	},
	{
		route: Users,
		path: "/settings/users",
		hash: "",
		to: "/admin",
		target: "users",
	},
	{
		route: Users,
		path: "/settings/users",
		hash: "roles",
		to: "/admin",
		target: "roles",
	},
	{
		route: Users,
		path: "/settings/users",
		hash: "audit",
		to: "/admin",
		target: "audit",
	},
	{
		route: Users,
		path: "/settings/users",
		hash: "old",
		to: "/admin",
		target: "users",
	},
	{
		route: AISettings,
		path: "/settings/ai",
		hash: "",
		to: "/settings",
		target: "integrations-ai",
	},
	{
		route: TranslatorSettings,
		path: "/settings/translator",
		hash: "",
		to: "/settings",
		target: "integrations-translator",
	},
	{
		route: Assistant,
		path: "/ai/assistant",
		hash: "",
		to: "/",
		target: "composer-answer",
	},
	{
		route: Knowledge,
		path: "/ai/knowledge",
		hash: "",
		to: "/qc",
		target: "knowledge",
	},
	{
		route: BonusTools,
		path: "/bonus-tools",
		hash: "",
		to: "/bonuses",
		target: "calculator",
	},
	{
		route: BonusTools,
		path: "/bonus-tools",
		hash: "manage",
		to: "/bonuses",
		target: "calculator-manage",
	},
	{
		route: BonusTools,
		path: "/bonus-tools",
		hash: "old",
		to: "/bonuses",
		target: "calculator",
	},
] as const;

it.each(bookmarks)("keeps $path#$hash as a redirect-only bookmark", async ({
	route,
	path,
	hash,
	to,
	target,
}) => {
	expect(route.options.component).toBeUndefined();
	expect(route.options.loader).toBeUndefined();
	const beforeLoad = route.options.beforeLoad!;
	// The redirect-only callbacks read just location, not router/auth context.
	await expect(
		Promise.resolve().then(() =>
			beforeLoad({
				location: { pathname: path, href: `${path}#${hash}`, hash },
			} as never),
		),
	).rejects.toMatchObject({ options: { to, hash: target, replace: true } });
});

it("redirects a real direct link before any legacy page loader runs", async () => {
	const root = createRootRoute();
	const loader = vi.fn();
	const legacy = createRoute({
		getParentRoute: () => root,
		path: "/shared-binds",
		beforeLoad: ({ location }) => {
			SharedBinds.options.beforeLoad!({ location } as never);
		},
		loader,
	});
	const canonical = createRoute({ getParentRoute: () => root, path: "/qc" });
	const router = createRouter({
		routeTree: root.addChildren([legacy, canonical]),
		history: createMemoryHistory({
			initialEntries: ["/shared-binds#proposals"],
		}),
	});
	await router.load();
	expect(loader).not.toHaveBeenCalled();
	expect(router.state.redirect?.options).toMatchObject({
		to: "/qc",
		hash: "proposals",
		replace: true,
	});
});
