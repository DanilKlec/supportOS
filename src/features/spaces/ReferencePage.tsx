import { Link, useRouterState } from "@tanstack/react-router";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { ProjectEmailsPage } from "@/features/project-emails/ProjectEmailsPage";
import { DepositBonusesPage } from "@/features/bonuses/DepositBonusesPage";
import { BonusToolsPage } from "@/features/bonuses/BonusToolsPage";
export function ReferencePage() {
	const { pathname, hash } = useRouterState({ select: (s) => s.location });
	const access = useAuthStore((s) => s.session?.user.access);
	const allowed = can(
		access,
		pathname === "/project-emails" ? "projects.write" : "bonuses.write",
	);
	const management = hash === "manage" && allowed;
	const Page =
		pathname === "/project-emails"
			? ProjectEmailsPage
			: pathname === "/bonuses"
				? DepositBonusesPage
				: BonusToolsPage;
	return (
		<>
			{allowed && (
				<nav aria-label="Управление справочником" className="flex gap-1 px-4">
					<Link
						to={pathname}
						hash=""
						className="space-tab"
						aria-current={!management ? "page" : undefined}
					>
						Рабочий справочник
					</Link>
					<Link
						to={pathname}
						hash="manage"
						className="space-tab"
						aria-current={management ? "page" : undefined}
					>
						Управление общей базой
					</Link>
				</nav>
			)}
			<Page key={pathname + management} management={management} />
		</>
	);
}
