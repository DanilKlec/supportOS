import { createFileRoute } from "@tanstack/react-router";
import { ContentOverview } from "@/features/spaces/ContentOverview";
export const Route = createFileRoute("/content")({
	component: ContentOverview,
});
