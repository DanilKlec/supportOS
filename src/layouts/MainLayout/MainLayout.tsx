import { Link, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { isLightweightRoute } from "@/app/route-mode";
import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import { TranslatorWidget } from "@/features/translator/TranslatorWidget";
import { useWorkspaceStore } from "@/store";
import { CommandPalette } from "@/widgets/CommandPalette/CommandPalette";
import { Sidebar } from "@/widgets/Sidebar";
import { Topbar } from "@/widgets/Topbar";

export function MainLayout({ children }: { children: ReactNode }) {
	const layout = useWorkspaceStore((state) => state.layout);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const previousPathnameRef = useRef(pathname);

	useEffect(() => {
		if (!mobileSidebarOpen) return undefined;

		const previousOverflow = document.body.style.overflow;

		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [mobileSidebarOpen]);

	useEffect(() => {
		if (previousPathnameRef.current !== pathname) {
			previousPathnameRef.current = pathname;
			setMobileSidebarOpen(false);
		}
	}, [pathname]);

	if (pathname === "/livechat") {
		return <main className="min-h-screen bg-background">{children}</main>;
	}

	if (isLightweightRoute(pathname)) {
		return (
			<div className="flex h-screen flex-col bg-background">
				<header className="flex h-14 items-center justify-between border-b border-border bg-surface px-5">
					<Link
						to="/"
						className="inline-flex items-center gap-2 font-semibold hover:text-accent"
					>
						<SupportOSLogo className="h-7 w-7" />
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
							to="/ai/assistant"
							className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							Assistant
						</Link>
						<Link
							to="/settings"
							className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							Settings
						</Link>
					</nav>
				</header>

				<main className="flex flex-1 flex-col overflow-hidden bg-background">
					{children}
				</main>

				{layout.showTranslatorWidget && <TranslatorWidget />}
				<CommandPalette />
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col">
			{layout.showTopbar && (
				<Topbar onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
			)}

			<div className="flex flex-1 overflow-hidden">
				{layout.showSidebar && (
					<div className="hidden min-h-0 md:block">
						<Sidebar />
					</div>
				)}

				{mobileSidebarOpen && (
					<div className="fixed inset-0 z-40 md:hidden">
						<button
							type="button"
							aria-label="Close navigation"
							onClick={() => setMobileSidebarOpen(false)}
							className="absolute inset-0 bg-black/45"
						/>
						<div className="absolute inset-y-0 left-0 w-[min(19rem,calc(100vw-2rem))] max-w-full">
							<Sidebar
								mobile
								onRequestClose={() => setMobileSidebarOpen(false)}
								onNavigate={() => setMobileSidebarOpen(false)}
							/>
						</div>
					</div>
				)}

				<main className="flex flex-1 flex-col overflow-hidden bg-background">
					{children}
				</main>
			</div>

			{layout.showTranslatorWidget && <TranslatorWidget />}
			<CommandPalette />
		</div>
	);
}
