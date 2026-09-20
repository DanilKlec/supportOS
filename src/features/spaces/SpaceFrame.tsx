import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
import { type SpaceItem, spaceFor } from "./navigation";
import { SectionNavigation } from "./SectionNavigation";
export function SpaceFrame({ children }: { children: ReactNode }) {
	const { pathname: rawPath, hash } = useRouterState({
		select: (s) => s.location,
	});
	const pathname = rawPath.replace(/\/+$/, "") || "/";
	const access = useAuthStore((s) => s.session?.user.access);
	const space = spaceFor(pathname);
	if (
		!space ||
		space.title === "Рабочее пространство" ||
		space.title === "Инструменты"
	)
		return <>{children}</>;
	const items = (space.items as readonly SpaceItem[]).filter((item) =>
		canAccessPage(access, item.to, item.hash),
	);
	const active =
		items.find((item) => pathname === item.to && hash === (item.hash ?? "")) ??
		items.find(
			(item) =>
				pathname === item.to && item.hash && hash.startsWith(`${item.hash}-`),
		) ??
		items.find((item) => pathname === item.to && !item.hash);
	return (
		<>
			<header className="space-header shrink-0 min-w-0 border-b border-border">
				<p className="section-eyebrow">{space.title}</p>
				<SectionNavigation label={space.title} items={items} active={active} />
				{pathname === "/bonuses" && (
					<nav aria-label="Режим бонусов" className="flex gap-1 pb-2">
						<Link
							to="/bonuses"
							hash=""
							className="space-tab"
							aria-current={!hash.startsWith("calculator") ? "page" : undefined}
						>
							Справочник
						</Link>
						<Link
							to="/bonuses"
							hash="calculator"
							className="space-tab"
							aria-current={hash.startsWith("calculator") ? "page" : undefined}
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
