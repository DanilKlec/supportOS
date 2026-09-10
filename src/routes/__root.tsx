import { requireAppAuth } from "@/app/auth-guard";
import { can, routePermission } from "../../shared/access.js";
import { supabaseService } from "@/services/supabase.service";
import "#/styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	Outlet,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { ToastContainer } from "#/components/ui/Toast";
import { MainLayout } from "#/layouts/MainLayout/MainLayout";
import { ToastProvider } from "#/shared/hooks/useToast";
import { ModalRoot } from "#/shared/modals/ModalRoot";
import { bootstrapApp, bootstrapAuth } from "@/app/bootstrap";
import { cleanupDevelopmentCaches } from "@/app/dev-cleanup";
import { isLightweightRoute } from "@/app/route-mode";
import {
	applyAppearance,
	getAppearanceSettings,
	onSystemThemeChange,
} from "@/shared/lib/appearance";
import { useAuthStore } from "@/store/auth.store";
import { safeAuthRedirect } from "@/app/auth-redirect";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60,
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

useAuthStore.subscribe((state, previous) => {
	if (state.session?.user.id !== previous.session?.user.id) queryClient.clear();
	if (
		previous.session?.user.access &&
		state.session?.user.id !== previous.session.user.id &&
		typeof window !== "undefined"
	)
		window.location.reload();
});

export const Route = createRootRoute({
	beforeLoad: requireAppAuth,
	component: RootComponent,
	notFoundComponent: NotFoundPage,
});

function RootComponent() {
	useEffect(() => {
		const check = () => void supabaseService.refreshIdentity();
		const timer = setInterval(check, 30000);
		window.addEventListener("focus", check);
		return () => {
			clearInterval(timer);
			window.removeEventListener("focus", check);
		};
	}, []);
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	const lightweight = isLightweightRoute(pathname);
	const session = useAuthStore((state) => state.session);
	const loading = useAuthStore((state) => state.loading);
	const isLoginRoute = pathname.replace(/\/+$/, "") === "/login";
	const accessGranted =
		!loading &&
		Boolean(session) &&
		can(session?.user.access, routePermission(pathname));
	useEffect(() => {
		if (loading) return;
		if (!session && !isLoginRoute) {
			queryClient.clear();
			void navigate({
				to: "/login",
				search: {
					redirect: safeAuthRedirect(
						window.location.pathname +
							window.location.search +
							window.location.hash,
					),
				},
				replace: true,
			});
		}
	}, [session, loading, isLoginRoute, navigate]);
	useEffect(() => {
		const applyStoredAppearance = () =>
			applyAppearance(getAppearanceSettings());

		applyStoredAppearance();

		return onSystemThemeChange(applyStoredAppearance);
	}, []);

	useEffect(() => {
		cleanupDevelopmentCaches();
		if (!accessGranted || isLoginRoute) return;

		const timer = window.setTimeout(() => {
			if (lightweight) {
				void bootstrapAuth();
				return;
			}

			void bootstrapApp();
		}, 50);

		return () => window.clearTimeout(timer);
	}, [lightweight, accessGranted, isLoginRoute]);

	return (
		<QueryClientProvider client={queryClient}>
			<ToastProvider>
				{accessGranted || isLoginRoute ? (
					<MainLayout>
						<Outlet />
					</MainLayout>
				) : (
					<div className="min-h-screen bg-background p-8">
						{!loading && session && (
							<>
								<p>Нет доступа к этому разделу. Обратитесь к администратору.</p>
								<button onClick={() => void navigate({ to: "/settings" })}>
									Мой аккаунт
								</button>
								<button onClick={() => void supabaseService.signOut()}>
									Выйти
								</button>
							</>
						)}
					</div>
				)}

				{accessGranted && <ModalRoot />}

				<ToastContainer />
			</ToastProvider>
		</QueryClientProvider>
	);
}

function NotFoundPage() {
	return (
		<div className="flex min-h-[calc(100vh-56px)] items-center justify-center bg-background text-foreground">
			<div className="rounded-xl border border-border bg-surface p-6 text-center shadow-lg">
				<h1 className="text-xl font-semibold">Страница не найдена</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					TanStack Router не нашёл маршрут для текущего адреса.
				</p>
			</div>
		</div>
	);
}
