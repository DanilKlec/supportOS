import { useRouterState } from "@tanstack/react-router";
import { BonusToolsPage } from "@/features/bonuses/BonusToolsPage";
import { DepositBonusesPage } from "@/features/bonuses/DepositBonusesPage";
import { ProjectEmailsPage } from "@/features/project-emails/ProjectEmailsPage";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
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
			<Page key={`${pathname}-${calculator}`} management={false} />
		</div>
	);
}
