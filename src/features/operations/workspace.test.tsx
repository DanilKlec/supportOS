// @vitest-environment jsdom

import { mkdirSync, writeFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hash: "overview", area: "admin" }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useNavigate: () => () => {},
	useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
		select({ location: { hash: state.hash, pathname: `/${state.area}` } }),
	Link: ({
		to,
		hash,
		children,
		...props
	}: {
		to: string;
		hash?: string;
		children: React.ReactNode;
	}) =>
		createElement(
			"a",
			{ href: to + (hash ? `#${hash}` : ""), ...props },
			children,
		),
}));
vi.mock("@/store/auth.store", () => ({
	useAuthStore: (select: (s: unknown) => unknown) =>
		select({
			configured: true,
			session: {
				user: {
					id: "qa",
					access: {
						status: "active",
						roles: [],
						permissions: [
							"work",
							"users.manage",
							"roles.manage",
							"technical",
							"tools",
							"binds.read",
							"knowledge.write",
							"ai.train",
							"ai.rules",
							"ai.tests",
							"ai.playground",
							"ai.publish",
							"bonuses.read",
							"projects.read",
						],
					},
				},
			},
		}),
}));

import { AdminWorkspace } from "@/features/admin/AdminWorkspace";
import { QCWorkspace } from "@/features/qc/QCWorkspace";
import { ToastProvider } from "@/shared/hooks/useToast";
import { adminSections, qcSections } from "./sections";

it("renders every workspace section with honest empty or disconnected states", () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	client.setQueryData(["ops-accounts", "qa"], { users: [], total: 0 });
	client.setQueryData(["ops-catalog", "qa"], { roles: [] });
	client.setQueryData(["admin-overview-ai", "qa"], {
		configured: false,
		provider: "openai",
		model: "Not configured",
	});
	client.setQueryData(["shared-binds", "qa"], []);
	client.setQueryData(["bind-proposals", "qa", undefined], []);
	client.setQueryData(["quality-signals", "qa"], { feedback: [], gaps: [] });
	client.setQueryData(["ai-runtime", "qa"], {
		version: 1,
		document: { entries: [], feedback: [] },
	});
	for (const [area, sections, Component] of [
		["admin", adminSections, AdminWorkspace],
		["qc", qcSections, QCWorkspace],
	] as const) {
		state.area = area;
		for (const section of sections) {
			state.hash = section.id;
			const html = renderToStaticMarkup(
				createElement(
					QueryClientProvider,
					{ client },
					createElement(ToastProvider, null, createElement(Component)),
				),
			);
			expect(html).toContain(section.label.replaceAll("&", "&amp;"));
			expect(html).not.toContain("8,421");
			expect(html).not.toContain("$412");
			if (process.env.SUPPORTOS_PREVIEW === "1") {
				mkdirSync(".admin-qc-reference", { recursive: true });
				writeFileSync(
					`.admin-qc-reference/${area}-${section.id}.html`,
					`<!doctype html><html lang="ru" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css?direct"></head><body><div class="app-shell" style="height:100dvh;display:flex;flex-direction:column"><header style="height:56px;flex:none;border-bottom:1px solid var(--color-border);padding:16px">SupportOS · ${area === "admin" ? "Admin" : "QC"} · Isolated layout preview</header>${html}</div></body></html>`,
				);
			}
		}
	}
	client.clear();
});
