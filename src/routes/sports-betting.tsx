import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/sports-betting")({
	component: lazyRouteComponent(
		() => import("@/features/sports-betting/SportsBettingPage"),
		"SportsBettingPage",
	),
});
