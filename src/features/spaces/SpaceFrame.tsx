import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/auth.store";
import { can, routePermission } from "../../../shared/access.js";
import { spaceFor, type SpaceItem } from "./navigation";
export function SpaceFrame({ children }: { children: ReactNode }) {
	const { pathname, hash } = useRouterState({ select: (s) => s.location });
	const access = useAuthStore((s) => s.session?.user.access);
	const space = spaceFor(pathname.replace(/\/+$/, "") || "/");
	if (
		!space ||
		space.title === "Рабочее пространство" ||
		space.title === "Инструменты"
	)
		return <>{children}</>;
	return (
		<>
			<header className="shrink-0 min-w-0 border-b border-border px-4 pt-3">
				<h1 className="text-lg font-semibold">{space.title}</h1>
				<nav
					aria-label={space.title}
					className="space-tabs supportos-scroll flex gap-1 overflow-x-auto py-2"
				>
					{(space.items as readonly SpaceItem[])
						.filter((i) => can(access, i.permission ?? routePermission(i.to)))
						.map((i) => (
							<Link
								key={i.to + (i.hash ?? "")}
								to={i.to}
								hash={i.hash ?? ""}
								className="space-tab"
								aria-current={
									pathname === i.to && hash === (i.hash ?? "")
										? "page"
										: undefined
								}
							>
								{i.label}
							</Link>
						))}
				</nav>
				{["/bonuses", "/bonus-tools"].includes(pathname) && (
					<nav aria-label="Режим бонусов" className="flex gap-1 pb-2">
						<Link
							to="/bonuses"
							className="space-tab"
							aria-current={pathname === "/bonuses" ? "page" : undefined}
						>
							Справочник
						</Link>
						<Link
							to="/bonus-tools"
							className="space-tab"
							aria-current={pathname === "/bonus-tools" ? "page" : undefined}
						>
							Калькулятор
						</Link>
					</nav>
				)}
			</header>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
		</>
	);
}
