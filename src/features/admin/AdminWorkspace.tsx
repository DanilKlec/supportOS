import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { AccountsPanel } from "@/features/accounts/AccountsPanel";
import type { OverviewUser } from "@/features/accounts/AdminOverview";
import { OperationsWorkspace } from "@/features/operations/OperationsWorkspace";
import { adminSections } from "@/features/operations/sections";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
import {
	AccessReviewPage,
	AIOverviewPage,
	BoundaryPage,
	DashboardPage,
	IntegrationsPage,
	ProjectsPage,
	SystemHealthPage,
} from "./pages/PlatformPages";
export function AdminWorkspace() {
	const navigate = useNavigate(),
		hash = useRouterState({ select: (s) => s.location.hash });
	const access = useAuthStore((s) => s.session?.user.access);
	const [selectedUser, setSelectedUser] = useState<OverviewUser>();
	const active =
		hash ||
		adminSections.find((s) => canAccessPage(access, "/admin", s.id))?.id ||
		"overview";
	const select = (id: string) => {
		if (canAccessPage(access, "/admin", id))
			void navigate({ to: "/admin", hash: id });
	};
	const onUser = (user: OverviewUser) => {
		setSelectedUser(user);
		select("users");
	};
	return (
		<OperationsWorkspace
			area="admin"
			sections={adminSections}
			active={active}
			onSelect={select}
		>
			{active === "overview" ? (
				<DashboardPage onUser={onUser} onSection={select} />
			) : ["users", "roles", "audit"].includes(active) ? (
				<AccountsPanel
					key={active}
					standalone
					embedded
					initialTab={active as "users" | "roles" | "audit"}
					initialUser={selectedUser}
				/>
			) : active === "access" ? (
				<AccessReviewPage onUser={onUser} />
			) : active === "platform-projects" ? (
				<ProjectsPage />
			) : active === "system-health" ? (
				<SystemHealthPage />
			) : active === "integrations" ? (
				<IntegrationsPage />
			) : active === "ai" ? (
				<AIOverviewPage />
			) : (
				<BoundaryPage section={active} />
			)}
		</OperationsWorkspace>
	);
}
