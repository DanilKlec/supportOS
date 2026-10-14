import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
export const Route = createFileRoute("/settings/ai")({
	beforeLoad: ({ location }) => {
		throw redirect({
			...canonicalPage("/settings/ai", location.hash),
			replace: true,
		});
	},
});
