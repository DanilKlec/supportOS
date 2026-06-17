import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/translator")({
	component: lazyRouteComponent(
		() => import("@/features/translator/TranslatorSettingsPage"),
		"TranslatorSettingsPage",
	),
});
