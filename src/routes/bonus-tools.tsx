import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
export const Route = createFileRoute("/bonus-tools")({
	beforeLoad: ({ location }) => {
		throw redirect({
			...canonicalPage("/bonus-tools", location.hash),
			replace: true,
		});
	},
});
