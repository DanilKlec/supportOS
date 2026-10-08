import { useQuery } from "@tanstack/react-query";

import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useAuthStore } from "@/store/auth.store";

export type ProjectCatalogEntry = {
	id: string;
	name: string;
	slug: string;
};

export const projectCatalogQueryKey = (userId?: string) =>
	["project-catalog", userId] as const;

export async function getProjectCatalog(): Promise<ProjectCatalogEntry[]> {
	const response = await authenticatedFetch("/api/projects");
	const body = await response.json();
	if (!response.ok)
		throw new Error(body.error ?? "Не удалось загрузить проекты");
	return Array.isArray(body.projects) ? body.projects : [];
}

export function useProjectCatalog(options: { enabled?: boolean } = {}) {
	const userId = useAuthStore((state) => state.session?.user.id);
	return useQuery({
		queryKey: projectCatalogQueryKey(userId),
		queryFn: getProjectCatalog,
		enabled: Boolean(userId) && (options.enabled ?? true),
		staleTime: 30000,
	});
}
