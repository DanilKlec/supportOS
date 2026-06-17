import type { AuthRole, AuthSession, AuthUser } from "@/store/auth.store";
import { useAuthStore } from "@/store/auth.store";

const SESSION_KEY = "supportos:supabase-session:v1";

interface SupabaseAuthUser {
	id: string;
	email?: string;
}

interface SupabaseAuthResponse {
	access_token?: string;
	refresh_token?: string;
	expires_at?: number;
	user?: SupabaseAuthUser;
	error?: string;
	error_description?: string;
	msg?: string;
}

interface SupabaseProfileRow {
	id: string;
	email: string | null;
	role: AuthRole | null;
}

type QueryValue = string | number | boolean | null | undefined;

function getEnv(name: string) {
	return (import.meta.env[name] as string | undefined)?.trim() ?? "";
}

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeBaseUrl(url: string) {
	return url.replace(/\/+$/, "");
}

function getErrorMessage(payload: unknown, fallback: string) {
	if (!payload || typeof payload !== "object") return fallback;

	const record = payload as Record<string, unknown>;
	const message =
		record.message ?? record.error_description ?? record.error ?? record.msg;

	return typeof message === "string" && message.trim() ? message : fallback;
}

function encodeQuery(query?: Record<string, QueryValue>) {
	if (!query) return "";

	const params = new URLSearchParams();

	for (const [key, value] of Object.entries(query)) {
		if (value === undefined) continue;
		params.set(key, value === null ? "is.null" : String(value));
	}

	const text = params.toString();
	return text ? `?${text}` : "";
}

class SupabaseService {
	private readonly cloudSyncEnabled =
		getEnv("VITE_SUPPORTOS_CLOUD_SYNC") === "true";
	private readonly url = normalizeBaseUrl(getEnv("VITE_SUPABASE_URL"));
	private readonly anonKey = getEnv("VITE_SUPABASE_ANON_KEY");

	isConfigured() {
		return this.cloudSyncEnabled && Boolean(this.url && this.anonKey);
	}

	getSession() {
		return useAuthStore.getState().session;
	}

	async initialize() {
		const configured = this.isConfigured();

		useAuthStore.getState().setConfigured(configured);

		if (!configured) {
			useAuthStore.getState().setLoading(false);
			return undefined;
		}

		const cached = this.readSession();

		if (!cached) {
			useAuthStore.getState().setLoading(false);
			return undefined;
		}

		try {
			const session =
				cached.expiresAt && cached.refreshToken && cached.expiresAt < Date.now()
					? await this.refreshSession(cached.refreshToken)
					: await this.withProfile(cached);

			this.setSession(session);
			return session;
		} catch (error) {
			this.clearSession();
			useAuthStore
				.getState()
				.setError(error instanceof Error ? error.message : "Sign in expired");
			return undefined;
		} finally {
			useAuthStore.getState().setLoading(false);
		}
	}

	async signIn(email: string, password: string) {
		const response = await this.authRequest(
			"/token?grant_type=password",
			"POST",
			{
				email,
				password,
			},
		);

		const session = await this.sessionFromAuthResponse(response);
		this.setSession(session);

		return session;
	}

	async signUp(email: string, password: string) {
		const response = await this.authRequest("/signup", "POST", {
			email,
			password,
		});

		if (!response.access_token) {
			return undefined;
		}

		const session = await this.sessionFromAuthResponse(response);
		this.setSession(session);

		return session;
	}

	async signOut() {
		const session = this.getSession();

		if (session) {
			await this.authRequest("/logout", "POST", undefined, session.accessToken);
		}

		this.clearSession();
	}

	async select<T>(table: string, query?: Record<string, QueryValue>) {
		return this.restRequest<T[]>(
			`/${table}${encodeQuery({ select: "*", ...query })}`,
			{
				method: "GET",
			},
		);
	}

	async upsert<T extends Record<string, unknown>>(table: string, rows: T[]) {
		if (rows.length === 0) return [];

		return this.restRequest<T[]>(`/${table}?on_conflict=id`, {
			method: "POST",
			headers: {
				Prefer: "resolution=merge-duplicates,return=representation",
			},
			body: JSON.stringify(rows),
		});
	}

	async rpc<T>(name: string, body?: Record<string, unknown>) {
		return this.restRequest<T>(`/rpc/${name}`, {
			method: "POST",
			body: JSON.stringify(body ?? {}),
		});
	}

	async delete(table: string, id: string) {
		await this.restRequest(`/${table}?id=eq.${encodeURIComponent(id)}`, {
			method: "DELETE",
			headers: {
				Prefer: "return=minimal",
			},
		});
	}

	private async sessionFromAuthResponse(response: SupabaseAuthResponse) {
		if (!response.access_token || !response.user?.id) {
			throw new Error(getErrorMessage(response, "Authentication failed"));
		}

		const email = response.user.email ?? "";
		const baseSession: AuthSession = {
			accessToken: response.access_token,
			refreshToken: response.refresh_token,
			expiresAt: response.expires_at ? response.expires_at * 1000 : undefined,
			user: {
				id: response.user.id,
				email,
				role: "user",
			},
		};

		return this.withProfile(baseSession);
	}

	private async withProfile(session: AuthSession) {
		await this.ensureProfile(session);

		let role: AuthRole = "user";

		try {
			const profiles = await this.restRequest<SupabaseProfileRow[]>(
				`/supportos_profiles?select=*&id=eq.${encodeURIComponent(
					session.user.id,
				)}`,
				{
					method: "GET",
				},
				session.accessToken,
			);
			const profile = profiles[0];

			if (profile?.role === "admin" || profile?.role === "user") {
				role = profile.role;
			}
		} catch {
			role = "user";
		}

		const admin = await this.rpc<boolean>("supportos_is_admin", {}).catch(
			() => false,
		);
		const user: AuthUser = {
			...session.user,
			role: admin ? "admin" : role,
		};

		return { ...session, user };
	}

	private async ensureProfile(session: AuthSession) {
		try {
			await this.restRequest(
				"/supportos_profiles?on_conflict=id",
				{
					method: "POST",
					headers: {
						Prefer: "resolution=merge-duplicates,return=minimal",
					},
					body: JSON.stringify([
						{
							id: session.user.id,
							email: session.user.email,
						},
					]),
				},
				session.accessToken,
			);
		} catch {
			// Profiles are a convenience cache; auth can still work without it.
		}
	}

	private async refreshSession(refreshToken: string) {
		const response = await this.authRequest(
			"/token?grant_type=refresh_token",
			"POST",
			{
				refresh_token: refreshToken,
			},
		);

		return this.sessionFromAuthResponse(response);
	}

	private async authRequest(
		path: string,
		method: string,
		body?: unknown,
		accessToken?: string,
	) {
		return this.request<SupabaseAuthResponse>(
			`${this.url}/auth/v1${path}`,
			{
				method,
				headers: {
					"Content-Type": "application/json",
					...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
				},
				body: body ? JSON.stringify(body) : undefined,
			},
			"Authentication request failed",
		);
	}

	private async restRequest<T>(
		path: string,
		init: RequestInit,
		accessToken = this.getSession()?.accessToken,
	) {
		if (!accessToken) {
			throw new Error("Sign in required");
		}

		return this.request<T>(
			`${this.url}/rest/v1${path}`,
			{
				...init,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
					...(init.headers ?? {}),
				},
			},
			"Database request failed",
		);
	}

	private async request<T>(url: string, init: RequestInit, fallback: string) {
		if (!this.isConfigured()) {
			throw new Error("Supabase is not configured");
		}

		const response = await fetch(url, {
			...init,
			headers: {
				apikey: this.anonKey,
				...(init.headers ?? {}),
			},
		});
		const text = await response.text();
		const payload = text ? JSON.parse(text) : null;

		if (!response.ok) {
			throw new Error(getErrorMessage(payload, fallback));
		}

		return payload as T;
	}

	private setSession(session: AuthSession) {
		useAuthStore.getState().setSession(session);
		useAuthStore.getState().setError(undefined);
		this.writeSession(session);
	}

	private clearSession() {
		useAuthStore.getState().setSession(undefined);
		useAuthStore.getState().setError(undefined);

		if (isBrowser()) {
			localStorage.removeItem(SESSION_KEY);
		}
	}

	private readSession() {
		if (!isBrowser()) return undefined;

		try {
			const raw = localStorage.getItem(SESSION_KEY);

			return raw ? (JSON.parse(raw) as AuthSession) : undefined;
		} catch {
			return undefined;
		}
	}

	private writeSession(session: AuthSession) {
		if (!isBrowser()) return;

		localStorage.setItem(SESSION_KEY, JSON.stringify(session));
	}
}

export const supabaseService = new SupabaseService();
