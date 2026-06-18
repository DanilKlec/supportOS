import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/bonuses")({
	component: lazyRouteComponent(
		() => import("@/features/bonuses/DepositBonusesPage"),
		"DepositBonusesPage",
	),
});
