import { SupportComposer } from "@/features/spaces/SupportComposer";
import { SpaceFrame } from "@/features/spaces/SpaceFrame";
import { useScrollContext } from "@/shared/hooks/useScrollContext";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { WorkspaceDock } from "@/widgets/Topbar/WorkspaceDock";
import { WorkspaceSharedBindsSync } from "@/features/shared-binds/WorkspaceSharedBinds";
import { AmbientBackground } from "@/components/brand/AmbientBackground";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useWorkspaceStore } from "@/store";

import { Sidebar } from "@/widgets/Sidebar";
import { Topbar } from "@/widgets/Topbar";

export function MainLayout({ children }: { children: ReactNode }) {
	const layout = useWorkspaceStore((state) => state.layout);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const scrollRoot = useRef<HTMLElement>(null);
	const actor = useAuthStore((s) => s.session?.user.id);
	const activeBind = useKnowledgeStore((s) => s.activeTab);
	const activeProject = useBonusStore((s) => s.activeProjectId);
	useScrollContext(
		scrollRoot,
		JSON.stringify([
			actor,
			pathname,
			pathname === "/"
				? activeBind
				: pathname === "/bonuses"
					? activeProject
					: "",
		]),
	);
	const previousPathnameRef = useRef(pathname);
	const knowledgeRoute = ["/", "/binds", "/favorites", "/recent"].includes(
		pathname.replace(/\/+$/, "") || "/",
	);

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
			<WorkspaceSharedBindsSync />
			<AmbientBackground />
			{
				<Topbar
					showKnowledgeControls={knowledgeRoute}
					onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
				/>
			}

			<div className="relative flex min-h-0 flex-1 overflow-hidden">
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

				<main
					ref={scrollRoot}
					className="workspace-main flex min-w-0 flex-1 flex-col overflow-hidden"
				>
					<SpaceFrame>{children}</SpaceFrame>
				</main>
				<SupportComposer />
			</div>

			<WorkspaceDock />
		</div>
	);
}
