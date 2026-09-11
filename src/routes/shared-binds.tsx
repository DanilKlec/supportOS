import { createFileRoute } from "@tanstack/react-router";
import { SharedContentHub } from "@/features/shared-binds/SharedContentHub";
export const Route = createFileRoute("/shared-binds")({
	component: SharedContentHub,
});
