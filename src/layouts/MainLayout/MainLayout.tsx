import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { isLightweightRoute } from "@/app/route-mode";
import { Sidebar } from "@/widgets/Sidebar";
import { Topbar } from "@/widgets/Topbar";

export function MainLayout({ children }: { children: ReactNode }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	if (isLightweightRoute(pathname)) {
		return (
			<div className="flex h-screen flex-col bg-background">
				<header className="flex h-14 items-center justify-between border-b border-border bg-surface px-5">
					<Link to="/" className="font-semibold hover:text-accent">
						SupportOS
					</Link>

					<nav className="flex items-center gap-2 text-sm">
						<Link
							to="/"
							className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							Knowledge
						</Link>
						<Link
							to="/translator"
							className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							Translator
						</Link>
						<Link
							to="/settings/translator"
							className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							Settings
						</Link>
					</nav>
				</header>

				<main className="flex flex-1 flex-col overflow-hidden bg-background">
					{children}
				</main>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col">
			<Topbar />

			<div className="flex flex-1 overflow-hidden">
				<Sidebar />

				<main className="flex flex-1 flex-col overflow-hidden bg-background">
					{children}
				</main>
			</div>
		</div>
	);
}
