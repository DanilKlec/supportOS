import { useQuery } from "@tanstack/react-query";

import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useAuthStore } from "@/store/auth.store";
import type { GlossaryTerm } from "./answer-assistant.service";

export async function getTeamGlossary(): Promise<GlossaryTerm[]> {
	const response = await authenticatedFetch("/api/ai/glossary");
	const body = await response.json();
	if (!response.ok)
		throw new Error(body.error ?? "Не удалось загрузить глоссарий");
	return Array.isArray(body.terms)
		? body.terms.map(
				(term: {
					id: string;
					source: string;
					target: string;
					language: string;
					note: string;
					project_id: string;
				}) => ({
					id: term.id,
					source: term.source,
					target: term.target,
					language: term.language || "any",
					note: term.note,
					projectId: term.project_id,
				}),
			)
		: [];
}

export function useTeamGlossary() {
	const userId = useAuthStore((state) => state.session?.user.id);
	return useQuery({
		queryKey: ["team-glossary", userId],
		queryFn: getTeamGlossary,
		enabled: Boolean(userId),
		staleTime: 30000,
	});
}
