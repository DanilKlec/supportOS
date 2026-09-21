import { useQuery } from "@tanstack/react-query";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { sharedBindsService } from "@/services/shared-binds.service";
import { useAuthStore } from "@/store/auth.store";
import { can, canTrain } from "../../../shared/access.js";
export async function readOperation<T>(
	path: string,
	signal?: AbortSignal,
): Promise<T> {
	const response = await authenticatedFetch(path, { signal });
	const result = await response.json();
	if (!response.ok) throw new Error(result.error ?? "Источник недоступен");
	return result;
}
export interface Account {
	id: string;
	email: string;
	display_name: string;
	status: string;
	roles: string[];
	version: number;
}
export interface RoleRecord {
	id: string;
	name: string;
	is_system: boolean;
	permissions: string[];
}
export interface Signals {
	feedback: { bind_id: string; kind: string; updated_at: string }[];
	gaps: {
		id: number;
		topic: string;
		project_id: string | null;
		created_at: string;
	}[];
}
export interface AIRuntime {
	version: number;
	document: {
		entries: {
			id: string;
			kind: string;
			status: string;
			project?: string;
			title: string;
			published?: unknown;
		}[];
		feedback: {
			rating: string;
			reason: string;
			project: string;
			language: string;
			createdAt: string;
		}[];
	};
}
export function useAccounts() {
	const user = useAuthStore((s) => s.session?.user);
	return useQuery({
		queryKey: ["ops-accounts", user?.id],
		enabled: can(user?.access, "users.manage"),
		queryFn: async ({ signal }) => {
			const users: Account[] = [];
			let total = 0;
			for (let page = 1; page <= 20; page++) {
				const data = await readOperation<{ users: Account[]; total: number }>(
					`/api/accounts?action=users&page=${page}`,
					signal,
				);
				total = data.total;
				users.push(...data.users);
				if (users.length >= total || !data.users.length) break;
			}
			return {
				users: [...new Map(users.map((u) => [u.id, u])).values()],
				total,
			};
		},
		staleTime: 30000,
	});
}
export function useCatalog() {
	const user = useAuthStore((s) => s.session?.user);
	return useQuery({
		queryKey: ["ops-catalog", user?.id],
		enabled:
			can(user?.access, "users.manage") || can(user?.access, "roles.manage"),
		queryFn: ({ signal }) =>
			readOperation<{ roles: RoleRecord[] }>(
				"/api/accounts?action=catalog",
				signal,
			),
		staleTime: 30000,
	});
}
export function useAIStatus() {
	const user = useAuthStore((s) => s.session?.user);
	return useQuery({
		queryKey: ["admin-overview-ai", user?.id],
		enabled: can(user?.access, "tools"),
		queryFn: ({ signal }) =>
			readOperation<{ configured: boolean; provider: string; model: string }>(
				"/api/ai/status",
				signal,
			),
		staleTime: 30000,
	});
}
export function useAIRuntime() {
	const user = useAuthStore((s) => s.session?.user);
	return useQuery({
		queryKey: ["ai-runtime", user?.id],
		enabled: canTrain(user?.access),
		queryFn: ({ signal }) =>
			readOperation<AIRuntime>("/api/ai/knowledge", signal),
		staleTime: 30000,
	});
}
export function useSignals() {
	const user = useAuthStore((s) => s.session?.user);
	return useQuery({
		queryKey: ["quality-signals", user?.id],
		enabled: can(user?.access, "knowledge.write"),
		queryFn: ({ signal }) =>
			readOperation<Signals>("/api/binds?action=quality-signals", signal),
		staleTime: 30000,
	});
}
export function useMaterials() {
	const user = useAuthStore((s) => s.session?.user);
	return useQuery({
		queryKey: ["shared-binds", user?.id],
		enabled: Boolean(user),
		queryFn: () => sharedBindsService.list(),
		staleTime: 30000,
	});
}
export function useProposals() {
	const user = useAuthStore((s) => s.session?.user);
	return useQuery({
		queryKey: ["bind-proposals", user?.id, undefined],
		enabled: can(user?.access, "knowledge.write"),
		queryFn: () => sharedBindsService.proposals(),
		staleTime: 30000,
	});
}
