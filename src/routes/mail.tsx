import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/mail")({
	component: lazyRouteComponent(
		() => import("@/features/mail/MailWorkspace"),
		"MailWorkspace",
	),
});
