import { Link, useRouterState } from "@tanstack/react-router";
import {
	Archive,
	ArrowLeft,
	BookOpen,
	Calculator,
	ChartNoAxesCombined,
	Gift,
	Mail,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
import { isContentReference, type SpaceItem, spaceFor } from "./navigation";
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
		pathname === "/qc" ||
		(["/bonuses", "/bonus-tools", "/project-emails"].includes(pathname) &&
			!isContentReference(pathname, hash)) ||
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
	if (space.title === "Контент") {
		const icons = [
			ChartNoAxesCombined,
			BookOpen,
			Mail,
			Gift,
			Calculator,
			RefreshCw,
			ShieldCheck,
			Archive,
		];
		return (
			<div className="context-layout">
				<aside className="context-sidebar">
					<Link to="/" className="context-home">
						<ArrowLeft size={15} />
						Рабочее пространство
					</Link>
					<div className="context-heading">
						<strong>Quality Control</strong>
						<span>Контент и качество</span>
					</div>
					<nav aria-label="Контент">
						{items.map((item) => {
							const Icon =
								icons[(space.items as readonly SpaceItem[]).indexOf(item)] ??
								BookOpen;
							return (
								<Link
									key={`${item.to}#${item.hash ?? ""}`}
									to={item.to}
									hash={item.hash ?? ""}
									className="context-nav-item"
									aria-current={item === active ? "page" : undefined}
								>
									<Icon size={17} />
									<span>{item.label}</span>
								</Link>
							);
						})}
					</nav>
				</aside>
				<div className="context-content">
					<div className="context-mobile">
						<SectionNavigation label="Контент" items={items} active={active} />
					</div>
					{children}
				</div>
			</div>
		);
	}
	return (
		<>
			<header className="space-header shrink-0 min-w-0 border-b border-border">
				<p className="section-eyebrow">{space.title}</p>
				<SectionNavigation label={space.title} items={items} active={active} />
			</header>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
		</>
	);
}
