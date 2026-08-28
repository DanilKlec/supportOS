import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/livechat")({
	component: lazyRouteComponent(
		() => import("@/features/livechat/LiveChatAssistantPage"),
		"LiveChatAssistantPage",
	),
});
