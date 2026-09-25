import { defaultLocalDataService } from "@/services/default-local-data.service";
import { knowledgeService } from "@/services/knowledge.service";
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

export async function bootstrapApp() {
	await bootstrapAuth();
	const session = useAuthStore.getState().session;

	if (!session?.user.access) return;
	if (knowledgeInitializedFor === session.user.id) return;
	if (knowledgePromise) return knowledgePromise;

	const accountId = session.user.id;
	knowledgePromise = (async () => {
		await knowledgeService.loadKnowledge();
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
