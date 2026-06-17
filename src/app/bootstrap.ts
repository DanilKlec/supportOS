import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";

let authInitialized = false;
let knowledgeInitialized = false;
let authSessionPromise:
	| ReturnType<typeof supabaseService.initialize>
	| undefined;

function shouldAutoSyncCloud() {
	return import.meta.env.VITE_SUPPORTOS_CLOUD_SYNC === "true";
}

export async function bootstrapAuth() {
	if (!authSessionPromise) {
		authSessionPromise = supabaseService.initialize();
	}

	if (authInitialized) return authSessionPromise;

	authInitialized = true;

	return authSessionPromise;
}

export async function bootstrapApp() {
	if (knowledgeInitialized) return;

	knowledgeInitialized = true;

	await knowledgeService.loadKnowledge();
	const session = await bootstrapAuth();

	if (session && shouldAutoSyncCloud()) {
		await knowledgeService.loadCloudKnowledge();
	}
}
