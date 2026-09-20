import { createFileRoute } from "@tanstack/react-router";
import { TeamActivity } from "@/features/spaces/TeamActivity";
export const Route = createFileRoute("/team")({ component: TeamPage });
function TeamPage() {
	return (
		<div className="supportos-page-scroll min-h-0 flex-1 overflow-auto py-4 sm:py-6">
			<h1 className="mb-4 text-2xl font-semibold">Активность команды</h1>
			<TeamActivity />
		</div>
	);
}
