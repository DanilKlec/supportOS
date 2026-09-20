import { useRouterState } from "@tanstack/react-router";
import { BonusToolsPage } from "@/features/bonuses/BonusToolsPage";
import { DepositBonusesPage } from "@/features/bonuses/DepositBonusesPage";
import { ProjectEmailsPage } from "@/features/project-emails/ProjectEmailsPage";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { isContentReference } from "./navigation";
export function ReferencePage() {
	const { pathname: rawPath, hash } = useRouterState({
		select: (s) => s.location,
	});
	const pathname = rawPath.replace(/\/+$/, "");
	const access = useAuthStore((s) => s.session?.user.access);
	const calculator = pathname === "/bonus-tools" || hash.includes("calculator");
	const management =
		isContentReference(pathname, hash) &&
		can(
			access,
			pathname === "/project-emails" ? "projects.write" : "bonuses.write",
		);
	const Page =
		pathname === "/project-emails"
			? ProjectEmailsPage
			: calculator
				? BonusToolsPage
				: DepositBonusesPage;
	return (
		<Page
			key={`${pathname}-${calculator}-${management}`}
			management={management}
		/>
	);
}
