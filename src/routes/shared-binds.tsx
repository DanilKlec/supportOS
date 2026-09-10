import { createFileRoute } from "@tanstack/react-router";
import { SharedBindsPage } from "@/features/shared-binds/SharedBindsPage";
export const Route = createFileRoute("/shared-binds")({
	component: SharedBindsPage,
});
