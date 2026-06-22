import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/bonus-tools")({
	component: lazyRouteComponent(
		() => import("@/features/bonuses/BonusToolsPage"),
		"BonusToolsPage",
	),
});
