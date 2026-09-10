import { createFileRoute } from "@tanstack/react-router";
import { AIKnowledgePage } from "@/features/accounts/AIKnowledgePage";
export const Route = createFileRoute("/ai/knowledge")({
	component: AIKnowledgePage,
});
