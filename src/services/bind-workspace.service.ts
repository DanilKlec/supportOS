import type { QueryClient } from "@tanstack/react-query";
import { authenticatedFetch } from "./authenticated-fetch";
import type { KnowledgeDatabase } from "./knowledge/knowledge-import-export";
import type { BindBranches } from "./shared-binds.service";
import { supabaseService } from "./supabase.service";

export interface BindWorkspace extends KnowledgeDatabase {
	branches: BindBranches;
}

export const bindWorkspaceKey = (actor: string | undefined) => [
	"bind-workspace",
	actor,
];

// Only the authenticated workspace coordinator polls. Existing feature queries
// keep their own keys so mutation invalidation and optimistic updates still work.
export async function readBindWorkspace(
	client: QueryClient,
	actor: string,
	signal?: AbortSignal,
): Promise<BindWorkspace> {
	if (supabaseService.getSession()?.user.id !== actor)
		throw new Error("Аккаунт изменился");
	const keys = [
		["shared-binds", actor],
		["personal-binds", actor, actor],
		["bind-branches", actor],
	];
	const versions = keys.map(
		(key) => client.getQueryState(key)?.dataUpdateCount ?? 0,
	);
	const response = await authenticatedFetch(
		"/api/binds?action=workspace",
		signal
			? {
					signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
				}
			: undefined,
	);
	const data = await response.json();
	if (!response.ok)
		throw Object.assign(
			new Error(data.error ?? "Не удалось загрузить базу биндов"),
			{ status: response.status },
		);
	if (supabaseService.getSession()?.user.id !== actor)
		throw new Error("Аккаунт изменился");
	signal?.throwIfAborted();
	if (
		!Array.isArray(data.categories) ||
		!Array.isArray(data.folders) ||
		!Array.isArray(data.binds) ||
		!data.branches ||
		!Array.isArray(data.branches.incoming) ||
		!Array.isArray(data.branches.outgoing)
	)
		throw new Error("Сервер не подтвердил загрузку базы биндов");
	const workspace = data as BindWorkspace;
	const values = [
		workspace.binds.filter((bind) => bind.ownerId === null),
		workspace.binds.filter((bind) => bind.ownerId === actor),
		workspace.branches,
	];
	keys.forEach((key, index) => {
		// A move, edit or branch choice made during the read takes precedence.
		if ((client.getQueryState(key)?.dataUpdateCount ?? 0) === versions[index])
			client.setQueryData(key, values[index]);
	});
	return workspace;
}

export function fetchBindWorkspace(client: QueryClient, actor: string) {
	return client.fetchQuery({
		queryKey: bindWorkspaceKey(actor),
		queryFn: ({ signal }) => readBindWorkspace(client, actor, signal),
		staleTime: 30000,
	});
}
