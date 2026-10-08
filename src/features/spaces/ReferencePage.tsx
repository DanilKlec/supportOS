import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadingState } from "@/components/ui";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";

const BonusToolsPage = lazy(() =>
	import("@/features/bonuses/BonusToolsPage").then((module) => ({
		default: module.BonusToolsPage,
	})),
);
const DepositBonusesPage = lazy(() =>
	import("@/features/bonuses/DepositBonusesPage").then((module) => ({
		default: module.DepositBonusesPage,
	})),
);
const ProjectEmailsPage = lazy(() =>
	import("@/features/project-emails/ProjectEmailsPage").then((module) => ({
		default: module.ProjectEmailsPage,
	})),
);

export function ReferencePage() {
	const { pathname: rawPath, hash } = useRouterState({
		select: (s) => s.location,
	});
	const pathname = rawPath.replace(/\/+$/, "");
	const access = useAuthStore((s) => s.session?.user.access);
	const calculator = pathname === "/bonus-tools" || hash.includes("calculator");
	const writePermission =
		pathname === "/project-emails" ? "projects.write" : "bonuses.write";
	const canManage = can(access, writePermission);
	const managementHref =
		pathname === "/project-emails" ? "/qc#emails" : "/qc#bonuses";
	const Page =
		pathname === "/project-emails"
			? ProjectEmailsPage
			: calculator
				? BonusToolsPage
				: DepositBonusesPage;
	return (
		<div className="ops-stack">
			{canManage && (
				<div className="ops-panel-actions">
					<a className="ui-button ui-button--secondary" href={managementHref}>
						Управлять
					</a>
				</div>
			)}
			<Suspense fallback={<LoadingState message="Загружаем материалы…" />}>
				<Page key={`${pathname}-${calculator}`} management={false} />
			</Suspense>
		</div>
	);
}
