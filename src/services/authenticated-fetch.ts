import { supabaseService } from "./supabase.service";

// Attach the token only to this app's API, never to third-party translator/Sheets URLs.
export async function authenticatedFetch(
	input: string | URL,
	init?: RequestInit,
) {
	const url = new URL(input, window.location.origin);
	if (
		url.origin !== window.location.origin ||
		!url.pathname.startsWith("/api/")
	)
		return fetch(input, init);
	const headers = new Headers(init?.headers);
	headers.set(
		"Authorization",
		`Bearer ${await supabaseService.getAccessToken()}`,
	);
	return fetch(input, { ...init, headers });
}
