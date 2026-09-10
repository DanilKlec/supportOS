import { WorkspaceDock } from "@/widgets/Topbar/WorkspaceDock";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

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
	const knowledgeRoute = [
		"/",
		"/binds",
		"/favorites",
		"/recent",
		"/archive",
		"/health",
	].includes(pathname.replace(/\/+$/, "") || "/");

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

	if (pathname === "/login") {
		return <main className="min-h-screen bg-background">{children}</main>;
	}

	return (
		<div className="app-shell flex h-dvh flex-col">
			{
				<Topbar
					showKnowledgeControls={knowledgeRoute}
					onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
				/>
			}

			<div className="flex min-h-0 flex-1 overflow-hidden">
				{knowledgeRoute && layout.showSidebar && (
					<div className="hidden min-h-0 md:block">
						<Sidebar />
					</div>
				)}

				{knowledgeRoute && mobileSidebarOpen && (
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

				<main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
					{children}
				</main>
			</div>

			<WorkspaceDock />
			{layout.showTranslatorWidget && <TranslatorWidget />}
			<CommandPalette />
		</div>
	);
}
