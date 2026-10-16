import { AuthClient } from "@supabase/auth-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
	import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export const supabase =
	url && key
		? {
				auth: new AuthClient({
					url: `${url.replace(/\/+$/, "")}/auth/v1`,
					headers: { apikey: key, Authorization: `Bearer ${key}` },
					// Preserve the full client's session, PKCE verifier and cross-tab channel.
					storageKey: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
					flowType: "pkce",
					persistSession: true,
					autoRefreshToken: true,
					detectSessionInUrl: true,
				}),
			}
		: undefined;
