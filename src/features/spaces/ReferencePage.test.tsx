// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const location = vi.hoisted(() => ({ pathname: "/bonuses", hash: "" }));
vi.mock("@tanstack/react-router", () => ({
	useRouterState: ({
		select,
	}: {
		select: (s: { location: typeof location }) => unknown;
	}) => select({ location }),
}));
vi.mock("@/features/bonuses/DepositBonusesPage", () => ({
	DepositBonusesPage: ({ management }: { management: boolean }) => (
		<div>bonus:{String(management)}</div>
	),
}));
vi.mock("@/features/bonuses/BonusToolsPage", () => ({
	BonusToolsPage: ({ management }: { management: boolean }) => (
		<div>calculator:{String(management)}</div>
	),
}));
vi.mock("@/features/project-emails/ProjectEmailsPage", () => ({
	ProjectEmailsPage: ({ management }: { management: boolean }) => (
		<div>emails:{String(management)}</div>
	),
}));

import { isContentReference } from "./navigation";
import { ReferencePage } from "./ReferencePage";

afterEach(() => {
	cleanup();
	useAuthStore.setState({ session: undefined });
});
function identity(permissions: string[]) {
	useAuthStore.setState({
		session: {
			accessToken: "test",
			user: {
				id: "u",
				email: "u@example.test",
				role: "admin",
				access: {
					status: "active",
					permissions,
					roles: [],
					version: 1,
					display_name: "",
				},
			},
		},
	});
}
it.each([
	["/bonuses", "", "bonus"],
	["/bonuses", "calculator", "calculator"],
	["/project-emails", "", "emails"],
])("work page %s#%s has no management even for editors", (pathname, hash, label) => {
	Object.assign(location, { pathname, hash });
	identity(["bonuses.write", "projects.write"]);
	render(<ReferencePage />);
	expect(screen.getByText(`${label}:false`)).toBeTruthy();
	expect(screen.getByRole("link", { name: "Управлять" }).getAttribute("href")).toBe(
		pathname === "/project-emails" ? "/qc#emails" : "/qc#bonuses",
	);
	expect(isContentReference(pathname, hash)).toBe(false);
});
it.each([
	["/bonuses", "content", "bonus", "bonuses.write"],
	["/bonuses", "content-calculator", "calculator", "bonuses.write"],
	["/project-emails", "content", "emails", "projects.write"],
])("content page %s#%s preserves editor access", (pathname, hash, label, permission) => {
	Object.assign(location, { pathname, hash });
	identity([permission]);
	render(<ReferencePage />);
	expect(screen.getByText(`${label}:false`)).toBeTruthy();
	expect(screen.getByRole("link", { name: "Управлять" }).getAttribute("href")).toBe(
		pathname === "/project-emails" ? "/qc#emails" : "/qc#bonuses",
	);
	expect(isContentReference(pathname, hash)).toBe(true);
});
it("content does not grant editing without write permission", () => {
	Object.assign(location, { pathname: "/bonuses", hash: "content" });
	identity(["bonuses.read"]);
	render(<ReferencePage />);
	expect(screen.getByText("bonus:false")).toBeTruthy();
});
