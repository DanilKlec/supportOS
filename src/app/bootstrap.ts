import type { QueryClient } from "@tanstack/react-query";
import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";

let authInitialized = false;
let knowledgeInitializedFor: string | undefined;
let knowledgePromise: Promise<void> | undefined;
let authSessionPromise:
	| ReturnType<typeof supabaseService.initialize>
	| undefined;

export async function bootstrapAuth() {
	if (!authSessionPromise) {
		authSessionPromise = supabaseService.initialize();
	}

	if (authInitialized) return authSessionPromise;

	authInitialized = true;

	return authSessionPromise;
}

export async function bootstrapApp(client?: QueryClient) {
	await bootstrapAuth();
	const session = useAuthStore.getState().session;

	if (!session?.user.access) return;
	if (knowledgeInitializedFor === session.user.id) return;
	if (knowledgePromise) return knowledgePromise;

	const accountId = session.user.id;
	knowledgePromise = (async () => {
		const [{ knowledgeService }, { defaultLocalDataService }] =
			await Promise.all([
				import("@/services/knowledge.service"),
				import("@/services/default-local-data.service"),
			]);
		await knowledgeService.loadKnowledge(client);
		if (useAuthStore.getState().session?.user.id !== accountId) return;
		knowledgeInitializedFor = accountId;
		defaultLocalDataService.apply();
	})();

	try {
		await knowledgePromise;
	} finally {
		knowledgePromise = undefined;
	}
}
