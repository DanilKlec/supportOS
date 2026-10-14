import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
export const Route = createFileRoute("/shared-binds")({
	beforeLoad: ({ location }) => {
		throw redirect({
			...canonicalPage("/shared-binds", location.hash),
			replace: true,
		});
	},
});
