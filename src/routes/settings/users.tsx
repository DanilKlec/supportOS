import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
export const Route = createFileRoute("/settings/users")({
	beforeLoad: ({ location }) => {
		throw redirect({
			...canonicalPage("/settings/users", location.hash),
			replace: true,
		});
	},
});
