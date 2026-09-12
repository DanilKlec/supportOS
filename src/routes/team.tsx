import {
	createFileRoute,
	useRouterState,
	useNavigate,
} from "@tanstack/react-router";
import { AdminOverview } from "@/features/accounts/AdminOverview";
import { TeamActivity } from "@/features/spaces/TeamActivity";
export const Route = createFileRoute("/team")({ component: TeamPage });
function TeamPage() {
	const hash = useRouterState({ select: (s) => s.location.hash });
	const navigate = useNavigate();
	return (
		<div className="supportos-scroll min-h-0 flex-1 overflow-auto p-4 md:p-6">
			{hash === "activity" ? (
				<TeamActivity />
			) : (
				<AdminOverview
					onUser={() => void navigate({ to: "/settings/users" })}
					onAudit={() => void navigate({ to: "/team", hash: "activity" })}
				/>
			)}
		</div>
	);
}
