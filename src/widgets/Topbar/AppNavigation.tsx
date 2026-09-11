import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Users, Bot, Activity, Settings } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { can, routePermission } from "../../../shared/access.js";

const sections = [
	{
		to: "/settings/users",
		label: "Пользователи",
		icon: Users,
		matches: ["/settings/users"],
	},
	{
		to: "/",
		label: "База знаний",
		icon: BookOpen,
		matches: ["/", "/binds", "/favorites", "/recent", "/archive", "/health"],
	},
	{
		to: "/shared-binds",
		label: "Общие бинды",
		icon: Users,
		matches: ["/shared-binds"],
	},
	{
		to: "/ai/assistant",
		label: "AI и перевод",
		icon: Bot,
		matches: [
			"/ai/assistant",
			"/ai/translator",
			"/ai/knowledge",
			"/translator",
		],
	},
	{
		to: "/agent-monitor",
		label: "Мониторинг",
		icon: Activity,
		matches: ["/agent-monitor"],
	},
	{
		to: "/settings",
		label: "Управление",
		icon: Settings,
		matches: ["/settings", "/settings/ai", "/settings/translator"],
	},
] as const;
export function AppNavigation() {
	const access = useAuthStore((s) => s.session?.user.access);
	const pathname = useRouterState({
		select: (s) => s.location.pathname.replace(/\/+$/, "") || "/",
	});
	return (
		<nav
			aria-label="Разделы SupportOS"
			className="supportos-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 md:px-5"
		>
			{sections
				.filter((item) => can(access, routePermission(item.to)))
				.map(({ to, label, icon: Icon, matches }) => (
					<Link
						key={to}
						to={to}
						aria-current={
							(matches as readonly string[]).includes(pathname)
								? "page"
								: undefined
						}
						className="app-nav-link"
					>
						<Icon size={17} strokeWidth={1.7} />
						<span>{label}</span>
					</Link>
				))}
		</nav>
	);
}
