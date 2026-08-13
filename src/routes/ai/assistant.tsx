import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/ai/assistant")({
	component: lazyRouteComponent(
		() => import("@/features/ai/AnswerAssistantPage"),
		"AnswerAssistantPage",
	),
});
