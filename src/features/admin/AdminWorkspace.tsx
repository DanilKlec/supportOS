import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountsPanel } from "@/features/accounts/AccountsPanel";
import type { OverviewUser } from "@/features/accounts/AdminOverview";
import { OperationsWorkspace } from "@/features/operations/OperationsWorkspace";
import { adminHashRedirects, adminSections } from "@/features/operations/sections";
import { useAuthStore } from "@/store/auth.store";
import { Tabs } from "@/components/ui";
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

type RolesTab = "roles" | "access" | "audit";

function RolesAndAccess({
	onUser,
}: {
	onUser: (user: OverviewUser) => void;
}) {
	const access = useAuthStore((s) => s.session?.user.access);
	const tabs = [
		{ value: "roles", label: "Роли" },
		{ value: "access", label: "Проверка доступов" },
		{ value: "audit", label: "Аудит прав" },
	].filter((tab) => canAccessPage(access, "/admin", tab.value));
	const [selected, setSelected] = useState<RolesTab>("roles");
	const current = tabs.some((tab) => tab.value === selected)
		? selected
		: (tabs[0]?.value as RolesTab | undefined);

	if (!current) return null;

	return (
		<div className="ops-stack">
			<Tabs
				ariaLabel="Роли и доступы"
				value={current}
				items={tabs}
				onValueChange={(value) => setSelected(value as RolesTab)}
			/>
			{current === "access" ? (
				<AccessReviewPage onUser={onUser} />
			) : (
				<AccountsPanel
					key={current}
					standalone
					embedded
					initialTab={current}
				/>
			)}
		</div>
	);
}

export function AdminWorkspace() {
	const navigate = useNavigate(),
		hash = useRouterState({ select: (s) => s.location.hash });
	const access = useAuthStore((s) => s.session?.user.access);
	const [selectedUser, setSelectedUser] = useState<OverviewUser>();
	const fallbackSection =
		adminSections.find(
			(s) =>
				!s.hiddenFromNavigation && canAccessPage(access, "/admin", s.id),
		)?.id || "overview";
	const redirectedHash = hash ? adminHashRedirects[hash] : undefined;
	const requestedSection = redirectedHash ?? hash ?? fallbackSection;
	const active = canAccessPage(access, "/admin", requestedSection)
		? requestedSection
		: fallbackSection;

	useEffect(() => {
		if (!hash || !redirectedHash) return;
		void navigate({ to: "/admin", hash: active, replace: true });
	}, [active, hash, navigate, redirectedHash]);
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
			) : active === "roles" ? (
				<RolesAndAccess onUser={onUser} />
			) : ["users", "audit"].includes(active) ? (
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
