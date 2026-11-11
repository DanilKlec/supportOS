import { createFileRoute } from "@tanstack/react-router";
import { AgentInboxPage } from "@/features/chatwoot/AgentInboxPage";

export const Route = createFileRoute("/inbox")({
	component: AgentInboxPage,
});
