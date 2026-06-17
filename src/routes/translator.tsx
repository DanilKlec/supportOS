import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/translator")({
	component: lazyRouteComponent(
		() => import("@/features/translator/TranslatorPage"),
		"TranslatorPage",
	),
});
