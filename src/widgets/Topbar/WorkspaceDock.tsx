import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Calculator, Gift, Mail } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";

const links = [
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
		<footer className="workspace-dock relative z-30 shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
			<div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-center gap-2 px-3 sm:px-5">
				<nav
					aria-label="Рабочие справочники"
					className="flex min-w-0 items-center gap-1 sm:gap-2"
				>
					{visibleLinks.map(
						({ to, hash: targetHash, label, short, icon: Icon }) => (
							<Link
								key={to + targetHash}
								to={to}
								hash={targetHash}
								aria-label={label}
								aria-current={
									pathname === to &&
									(targetHash
										? hash.includes(targetHash)
										: !hash.includes("calculator"))
										? "page"
										: undefined
								}
								className={`flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-xs font-medium transition sm:px-4 sm:text-sm ${pathname === to && (targetHash ? hash.includes(targetHash) : !hash.includes("calculator")) ? "bg-accent/10 text-accent ring-1 ring-accent/20" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}
							>
								<Icon size={18} strokeWidth={1.7} />
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
