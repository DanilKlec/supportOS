import { Link, useRouterState } from "@tanstack/react-router";
import { BonusToolsPage } from "@/features/bonuses/BonusToolsPage";
import { DepositBonusesPage } from "@/features/bonuses/DepositBonusesPage";
import { ProjectEmailsPage } from "@/features/project-emails/ProjectEmailsPage";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
export function ReferencePage() {
	const { pathname, hash } = useRouterState({ select: (s) => s.location });
	const access = useAuthStore((s) => s.session?.user.access);
	const allowed = can(
		access,
		pathname === "/project-emails" ? "projects.write" : "bonuses.write",
	);
	const calculator =
		pathname === "/bonus-tools" || hash.startsWith("calculator");
	const management = ["manage", "calculator-manage"].includes(hash) && allowed;
	const Page =
		pathname === "/project-emails"
			? ProjectEmailsPage
			: !calculator
				? DepositBonusesPage
				: BonusToolsPage;
	return (
		<>
			<header className="reference-toolbar">
				<div className="reference-toolbar-main">
					<h1>
						{pathname === "/project-emails" ? "Почты проектов" : "Бонусы"}
					</h1>
					{pathname !== "/project-emails" && (
						<nav aria-label="Режим бонусов" className="reference-modes">
							<Link
								to="/bonuses"
								hash={management ? "manage" : ""}
								className="space-tab"
								aria-current={!calculator ? "page" : undefined}
							>
								Справочник
							</Link>
							<Link
								to="/bonuses"
								hash={management ? "calculator-manage" : "calculator"}
								className="space-tab"
								aria-current={calculator ? "page" : undefined}
							>
								Калькулятор
							</Link>
						</nav>
					)}
				</div>
				{allowed && (
					<Link
						to={pathname}
						hash={
							management
								? calculator
									? "calculator"
									: ""
								: calculator
									? "calculator-manage"
									: "manage"
						}
						className="shell-button"
						aria-label={
							management
								? "Завершить управление общей базой"
								: "Управление общей базой"
						}
					>
						{management ? "Готово" : "Управление базой"}
					</Link>
				)}
			</header>{" "}
			<Page key={pathname + management} management={management} />
		</>
	);
}
