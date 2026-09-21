// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const location = vi.hoisted(() => ({ pathname: "/content", hash: "" }));
vi.mock("@tanstack/react-router", () => ({
	useRouterState: ({
		select,
	}: {
		select: (s: { location: typeof location }) => unknown;
	}) => select({ location }),
	useNavigate: () => vi.fn(),
	Link: ({
		children,
		to,
		hash = "",
		...props
	}: {
		children: ReactNode;
		to: string;
		hash?: string;
	}) => (
		<a href={`${to}#${hash}`} {...props}>
			{children}
		</a>
	),
}));

import { WorkspaceDock } from "@/widgets/Topbar/WorkspaceDock";
import { SpaceFrame } from "./SpaceFrame";

function identity(permissions: string[]) {
	useAuthStore.setState({
		session: {
			accessToken: "test",
			user: {
				id: "test",
				email: "test@example.test",
				role: "support",
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
afterEach(() => {
	cleanup();
	useAuthStore.setState({ session: undefined });
	Object.assign(location, { pathname: "/content", hash: "" });
});
it("QC navigation preserves permission filtering and the proposals destination", () => {
	identity(["binds.read", "knowledge.write"]);
	Object.assign(location, { pathname: "/shared-binds", hash: "proposals" });
	render(
		<SpaceFrame>
			<div>Page content</div>
		</SpaceFrame>,
	);
	const proposals = screen.getAllByRole("link", { name: "Предложения" });
	for (const link of proposals)
		expect(link.getAttribute("href")).toBe("/shared-binds#proposals");
	for (const link of proposals)
		expect(link.getAttribute("aria-current")).toBe("page");
	expect(screen.queryByRole("link", { name: "Бонусы" })).toBeNull();
	expect(screen.getByText("Page content")).toBeTruthy();
});
it("working references remain full width without QC navigation", () => {
	identity(["bonuses.read"]);
	Object.assign(location, { pathname: "/bonuses", hash: "calculator" });
	render(
		<SpaceFrame>
			<div>Calculator</div>
		</SpaceFrame>,
	);
	expect(screen.queryByRole("navigation")).toBeNull();
	expect(screen.getByText("Calculator")).toBeTruthy();
});
it("the monitor shortcut is only offered with monitor access", () => {
	identity(["binds.read"]);
	const view = render(<WorkspaceDock />);
	expect(screen.queryByRole("link", { name: "Мониторинг" })).toBeNull();
	identity(["binds.read", "monitor.read"]);
	view.rerender(<WorkspaceDock />);
	expect(
		screen.getByRole("link", { name: "Мониторинг" }).getAttribute("href"),
	).toBe("/agent-monitor#");
});
