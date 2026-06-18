import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/project-emails")({
	component: lazyRouteComponent(
		() => import("@/features/project-emails/ProjectEmailsPage"),
		"ProjectEmailsPage",
	),
});
