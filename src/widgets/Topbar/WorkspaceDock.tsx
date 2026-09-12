import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Mail, Gift, Calculator } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { can, routePermission } from "../../../shared/access.js";
const links = [
	{ to: "/", label: "Бинды", short: "Бинды", icon: ArrowLeft },
	{
		to: "/project-emails",
		label: "Email",
		short: "Email",
		icon: Mail,
	},
	{ to: "/bonuses", label: "Бонусы", short: "Бонусы", icon: Gift },
	{
		to: "/bonus-tools",
		label: "Калькулятор",
		short: "Калькулятор",
		icon: Calculator,
	},
] as const;
export function WorkspaceDock() {
	const access = useAuthStore((s) => s.session?.user.access);
	const pathname = useRouterState({
		select: (s) => s.location.pathname.replace(/\/+$/, ""),
	});
	return (
		<footer className="workspace-dock relative z-30 shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
			<div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-center gap-2 px-3 sm:px-5">
				<nav
					aria-label="Рабочие справочники"
					className="flex min-w-0 items-center gap-1 sm:gap-2"
				>
					{links
						.filter((item) => can(access, routePermission(item.to)))
						.map(({ to, label, short, icon: Icon }) => (
							<Link
								key={to}
								to={to}
								aria-label={label}
								aria-current={pathname === to ? "page" : undefined}
								className={`flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-xs font-medium transition sm:px-4 sm:text-sm ${pathname === to ? "bg-accent/10 text-accent ring-1 ring-accent/20" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}
							>
								<Icon size={18} strokeWidth={1.7} />
								<span className="hidden md:inline">{label}</span>
								<span className="md:hidden">{short}</span>
							</Link>
						))}
				</nav>
			</div>
		</footer>
	);
}
