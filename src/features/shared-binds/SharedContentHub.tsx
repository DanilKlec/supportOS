import { useRouterState } from "@tanstack/react-router";
import { ProposalWorkflow } from "@/features/spaces/ProposalWorkflow";
import { SharedBindsPage } from "./SharedBindsPage";
export function SharedContentHub() {
	const hash = useRouterState({ select: (s) => s.location.hash });
	return hash === "proposals" ? (
		<div className="min-h-0 flex-1 overflow-auto p-4">
			<ProposalWorkflow />
		</div>
	) : (
		<SharedBindsPage />
	);
}
