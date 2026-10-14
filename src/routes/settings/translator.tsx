import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
export const Route = createFileRoute("/settings/translator")({
	beforeLoad: ({ location }) => {
		throw redirect({
			...canonicalPage("/settings/translator", location.hash),
			replace: true,
		});
	},
});
