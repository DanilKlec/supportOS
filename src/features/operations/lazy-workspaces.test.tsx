// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const state = vi.hoisted(() => ({ hash: "overview" }));
const mocks = vi.hoisted(() => ({
	accountsLoaded: vi.fn(),
	aiLoaded: vi.fn(),
	bindsLoaded: vi.fn(),
	emailsLoaded: vi.fn(),
	bonusesLoaded: vi.fn(),
	accountsRendered: vi.fn(),
	aiRendered: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouterState: ({
		select,
	}: {
		select: (s: { location: typeof state }) => unknown;
	}) => select({ location: state }),
	Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/features/accounts/AccountsPanel", () => {
	mocks.accountsLoaded();
	return {
		AccountsPanel: (props: {
			initialTab: string;
			embedded: boolean;
			standalone: boolean;
		}) => {
			mocks.accountsRendered(props);
			return <div>accounts:{props.initialTab}</div>;
		},
	};
});
vi.mock("@/features/admin/pages/PlatformPages", () => ({
	DashboardPage: () => <div>admin:overview</div>,
	AccessReviewPage: () => <div>admin:access</div>,
	AIOverviewPage: () => null,
	BoundaryPage: () => null,
	IntegrationsPage: () => <div>admin:integrations</div>,
	ProjectsPage: () => null,
	SystemHealthPage: () => null,
}));
vi.mock("@/features/admin/AIControlCenter", () => {
	mocks.aiLoaded();
	return {
		AIControlCenter: ({ section }: { section: string }) => {
			mocks.aiRendered(section);
			return <div>ai:{section}</div>;
		},
	};
});
vi.mock("@/features/qc/QualityPages", () => ({
	QCOverview: () => <div>qc:overview</div>,
	ReviewInbox: () => <div>qc:inbox</div>,
	AIQuality: () => null,
	DuplicateKnowledge: () => null,
	KnowledgeHistory: () => null,
	LanguageQuality: () => null,
}));
vi.mock("@/features/shared-binds/SharedBindsPage", () => {
	mocks.bindsLoaded();
	return { SharedBindsPage: () => <div>qc:binds</div> };
});
vi.mock("@/features/project-emails/ProjectEmailsPage", () => {
	mocks.emailsLoaded();
	return {
		ProjectEmailsPage: ({ management }: { management: boolean }) => (
			<div>emails:{String(management)}</div>
		),
	};
});
vi.mock("@/features/bonuses/DepositBonusesPage", () => {
	mocks.bonusesLoaded();
	return {
		DepositBonusesPage: ({ management }: { management: boolean }) => (
			<div>bonuses:{String(management)}</div>
		),
	};
});

import { AdminWorkspace } from "@/features/admin/AdminWorkspace";
import { QCWorkspace } from "@/features/qc/QCWorkspace";

function identity(
	permissions = [
		"users.manage",
		"roles.manage",
		"technical",
		"knowledge.write",
		"projects.read",
		"bonuses.read",
		"ai.train",
		"ai.rules",
		"ai.tests",
		"ai.playground",
	],
) {
	useAuthStore.setState({
		session: {
			accessToken: "synthetic-unit-test-only",
			user: {
				id: "fixture",
				email: "fixture@example.test",
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
beforeEach(() => {
	state.hash = "overview";
	vi.clearAllMocks();
	identity();
});
afterEach(() => {
	cleanup();
	useAuthStore.setState({ session: undefined });
});

it("loads the existing AccountsPanel only for users/roles/audit and preserves its tabs/props", async () => {
	const view = render(<AdminWorkspace />);
	expect(screen.getByText("admin:overview")).toBeTruthy();
	expect(mocks.accountsLoaded).not.toHaveBeenCalled();
	state.hash = "users";
	view.rerender(<AdminWorkspace />);
	expect(await screen.findByText("accounts:users")).toBeTruthy();
	expect(mocks.accountsLoaded).toHaveBeenCalledTimes(1);
	expect(mocks.accountsRendered).toHaveBeenLastCalledWith(
		expect.objectContaining({
			initialTab: "users",
			standalone: true,
			embedded: true,
		}),
	);
	state.hash = "roles";
	view.rerender(<AdminWorkspace />);
	expect(await screen.findByText("accounts:roles")).toBeTruthy();
	fireEvent.click(screen.getByRole("tab", { name: "Проверка доступов" }));
	expect(screen.getByText("admin:access")).toBeTruthy();
	fireEvent.click(screen.getByRole("tab", { name: "Аудит прав" }));
	expect(await screen.findByText("accounts:audit")).toBeTruthy();
	expect(mocks.accountsLoaded).toHaveBeenCalledTimes(1);
});

it("loads only the selected QC workflow, reusing management pages and project instructions", async () => {
	const view = render(<QCWorkspace />);
	expect(screen.getByText("qc:overview")).toBeTruthy();
	for (const load of [
		mocks.aiLoaded,
		mocks.bindsLoaded,
		mocks.emailsLoaded,
		mocks.bonusesLoaded,
	])
		expect(load).not.toHaveBeenCalled();
	state.hash = "materials";
	view.rerender(<QCWorkspace />);
	expect(await screen.findByText("qc:binds")).toBeTruthy();
	expect(mocks.bindsLoaded).toHaveBeenCalledTimes(1);
	for (const load of [mocks.aiLoaded, mocks.emailsLoaded, mocks.bonusesLoaded])
		expect(load).not.toHaveBeenCalled();
	state.hash = "emails";
	view.rerender(<QCWorkspace />);
	expect(await screen.findByText("emails:true")).toBeTruthy();
	expect(mocks.bonusesLoaded).not.toHaveBeenCalled();
	expect(mocks.aiLoaded).not.toHaveBeenCalled();
	state.hash = "bonuses";
	view.rerender(<QCWorkspace />);
	expect(await screen.findByText("bonuses:true")).toBeTruthy();
	expect(mocks.aiLoaded).not.toHaveBeenCalled();
	state.hash = "instructions";
	view.rerender(<QCWorkspace />);
	expect(await screen.findByText("ai:projects")).toBeTruthy();
	expect(mocks.aiLoaded).toHaveBeenCalledTimes(1);
});

it("keeps unauthorized direct hashes from rendering protected lazy screens", () => {
	identity(["technical"]);
	state.hash = "users";
	const admin = render(<AdminWorkspace />);
	expect(screen.getByText("admin:integrations")).toBeTruthy();
	expect(mocks.accountsRendered).not.toHaveBeenCalled();
	admin.unmount();
	identity(["knowledge.write"]);
	state.hash = "knowledge";
	render(<QCWorkspace />);
	expect(screen.getByRole("alert").textContent).toBe(
		"Нет доступа к этому инструменту.",
	);
	expect(mocks.aiRendered).not.toHaveBeenCalled();
});
