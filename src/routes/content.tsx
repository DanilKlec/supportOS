import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPage } from "@/features/spaces/navigation";
export const Route = createFileRoute("/content")({
	beforeLoad: ({ location }) => {
		throw redirect({
			...canonicalPage("/content", location.hash),
			replace: true,
		});
	},
});
