import { afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ constructor: vi.fn() }));
vi.mock("@supabase/auth-js", () => ({
	AuthClient: class {
		constructor(options: unknown) {
			mock.constructor(options);
		}
	},
}));
afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
	vi.resetModules();
});

it("keeps existing sessions and PKCE keys with the auth-only client", async () => {
	vi.stubEnv("VITE_SUPABASE_URL", "https://project-ref.supabase.co/");
	vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "synthetic-publishable-key");
	const { supabase } = await import("./supabase-client");
	expect(supabase?.auth).toBeTruthy();
	expect(mock.constructor).toHaveBeenCalledWith({
		url: "https://project-ref.supabase.co/auth/v1",
		headers: {
			apikey: "synthetic-publishable-key",
			Authorization: "Bearer synthetic-publishable-key",
		},
		storageKey: "sb-project-ref-auth-token",
		flowType: "pkce",
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
	});
});

it("does not construct an auth client without configuration", async () => {
	vi.stubEnv("VITE_SUPABASE_URL", "");
	expect((await import("./supabase-client")).supabase).toBeUndefined();
	expect(mock.constructor).not.toHaveBeenCalled();
});
