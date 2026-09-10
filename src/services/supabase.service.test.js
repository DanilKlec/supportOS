import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
	auth: {
		getSession: vi.fn(),
		getUser: vi.fn(),
		onAuthStateChange: vi.fn(),
		signInWithPassword: vi.fn(),
		signOut: vi.fn(),
	},
	callback: undefined,
}));
vi.mock("./supabase-client", () => ({ supabase: { auth: fixture.auth } }));
let service, store;
const session = {
	access_token: "initial",
	refresh_token: "refresh",
	expires_at: 2000000000,
	user: {
		id: "user-a",
		email: "a@example.test",
		app_metadata: { role: "user" },
	},
};
beforeEach(async () => {
	vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({access:{status:'active',roles:[{id:'support',name:'Support'}],permissions:['work','binds.read'],version:1,display_name:''}}))));
	vi.resetModules();
	vi.resetAllMocks();
	fixture.auth.onAuthStateChange.mockImplementation((callback) => {
		fixture.callback = callback;
		return { data: { subscription: { unsubscribe: vi.fn() } } };
	});
	fixture.auth.getSession.mockResolvedValue({ data: { session }, error: null });
	fixture.auth.getUser.mockResolvedValue({
		data: { user: session.user },
		error: null,
	});
	service = (await import("./supabase.service")).supabaseService;
	store = (await import("@/store/auth.store")).useAuthStore;
});
afterEach(() => vi.unstubAllGlobals());
it('does not restore permissions from an older concurrent access response',async()=>{
 await service.initialize();
 let resolveOld;const oldResponse=new Promise(resolve=>{resolveOld=resolve;});
 vi.stubGlobal('fetch',vi.fn().mockReturnValueOnce(oldResponse).mockResolvedValueOnce(new Response(JSON.stringify({access:{status:'disabled',roles:[],permissions:[],version:2,display_name:''}}))));
 const old=service.refreshIdentity();await service.refreshIdentity();
 resolveOld(new Response(JSON.stringify({access:{status:'active',roles:[],permissions:['technical'],version:1,display_name:''}})));await old;
 expect(service.getSession().user.access.status).toBe('disabled');
 expect(service.getSession().user.access.permissions).toEqual([]);
});
it("verifies restored identity, initializes once and receives refresh/signout events", async () => {
	await Promise.all([service.initialize(), service.initialize()]);
	expect(fixture.auth.getUser).toHaveBeenCalledOnce();
	expect(store.getState().loading).toBe(false);
	fixture.callback("TOKEN_REFRESHED", { ...session, access_token: "renewed" });
	expect(service.getSession().accessToken).toBe("renewed");
	fixture.callback("SIGNED_OUT", null);
	expect(service.getSession()).toBeUndefined();
});
it("rejects an unverified cached identity", async () => {
	fixture.auth.getUser.mockResolvedValue({
		data: { user: null },
		error: new Error("Expired"),
	});
	await service.initialize();
	expect(store.getState().session).toBeUndefined();
	expect(store.getState().loading).toBe(false);
});
it("does not claim successful logout after a network failure", async () => {
	await service.initialize();
	fixture.auth.signOut.mockResolvedValue({ error: new Error("Offline") });
	await expect(service.signOut()).rejects.toThrow("Offline");
	expect(service.getSession().user.id).toBe("user-a");
});
it("uses the SDK refreshed access token for API requests", async () => {
	fixture.auth.getSession.mockResolvedValue({
		data: { session: { ...session, access_token: "fresh" } },
		error: null,
	});
	expect(await service.getAccessToken()).toBe("fresh");
});
