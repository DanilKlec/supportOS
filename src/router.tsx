import { createRouter } from "@tanstack/react-router";
import { ApplicationError, ApplicationStatus } from "./app/ApplicationStatus";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPendingComponent: ApplicationStatus,
		defaultPendingMs: 150,
		defaultPendingMinMs: 150,
		defaultErrorComponent: ApplicationError,
	});

	return router;
}
