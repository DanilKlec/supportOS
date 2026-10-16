import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, BookOpen, Calculator, Gift, Mail } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
import "./workspace-navigation.css";

const links = [
	{
		to: "/agent-monitor",
		hash: "",
		label: "Мониторинг",
		short: "Монитор",
		icon: Activity,
	},
	{ to: "/", hash: "", label: "Бинды", short: "Бинды", icon: BookOpen },
	{
		to: "/project-emails",
		hash: "",
		label: "Почты",
		short: "Почты",
		icon: Mail,
	},
	{ to: "/bonuses", hash: "", label: "Бонусы", short: "Бонусы", icon: Gift },
	{
		to: "/bonuses",
		hash: "calculator",
		label: "Калькулятор",
		short: "Калькулятор",
		icon: Calculator,
	},
] as const;
export function WorkspaceDock() {
	const access = useAuthStore((s) => s.session?.user.access);
	const hash = useRouterState({ select: (s) => s.location.hash });
	const pathname = useRouterState({
		select: (s) => s.location.pathname.replace(/\/+$/, "") || "/",
	});
	const visibleLinks = links.filter((item) =>
		canAccessPage(access, item.to, item.hash),
	);
	if (!visibleLinks.length) return null;
	return (
		<footer className="workspace-dock">
			<div>
				<nav aria-label="Рабочие справочники">
					{visibleLinks.map(
						({ to, hash: targetHash, label, short, icon: Icon }) => (
							<Link
								key={to + targetHash}
								to={to}
								hash={targetHash}
								aria-label={label}
								title={label}
								aria-current={
									pathname === to &&
									(targetHash
										? hash.includes(targetHash)
										: !hash.includes("calculator"))
										? "page"
										: undefined
								}
								className="workspace-dock-link"
							>
								<Icon size={17} strokeWidth={1.6} aria-hidden="true" />
								<span className="hidden md:inline">{label}</span>
								<span className="md:hidden">{short}</span>
							</Link>
						),
					)}
				</nav>
			</div>
		</footer>
	);
}
