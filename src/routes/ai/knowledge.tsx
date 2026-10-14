import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
export const Route = createFileRoute("/ai/knowledge")({
	beforeLoad: ({ location }) => {
		throw redirect({
			...canonicalPage("/ai/knowledge", location.hash),
			replace: true,
		});
	},
});
