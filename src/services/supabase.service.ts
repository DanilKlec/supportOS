import type { Session } from "@supabase/supabase-js";
import { normalizeRole } from "../../shared/access.js";
import { useAuthStore, type AuthSession } from "@/store/auth.store";
import { supabase } from "./supabase-client";

type QueryValue = string | number | boolean | null | undefined;
class SupabaseService {
	private initialized?: Promise<AuthSession | undefined>;
	private revision = 0;
	private accessRevision = 0;
	isConfigured() {
		return Boolean(supabase);
	}
	getSession() {
		return useAuthStore.getState().session;
	}
	private accept(session: Session | null) {
		const previous = this.getSession();
		const next: AuthSession | undefined = session
			? {
					accessToken: session.access_token,
					refreshToken: session.refresh_token,
					expiresAt: session.expires_at ? session.expires_at * 1000 : undefined,
					user: {
						id: session.user.id,
						email: session.user.email ?? "",
						role:
							previous?.user.id === session.user.id
								? previous.user.role
								: "pending",
						access:
							previous?.user.id === session.user.id
								? previous.user.access
								: undefined,
					},
				}
			: undefined;
		useAuthStore.setState({ session: next, error: undefined });
		return next;
	}
	initialize() {
		return (this.initialized ??= this.initializeOnce());
	}
	private async initializeOnce() {
		useAuthStore.setState({ configured: this.isConfigured(), loading: true });
		if (!supabase) {
			useAuthStore.setState({ loading: false });
			return undefined;
		}
		// SDK owns refresh, persistence and cross-tab session events. Never trust the old local access store.
		supabase.auth.onAuthStateChange((_event, session) => {
			this.revision++;
			this.accept(session);
			if (session) queueMicrotask(() => void this.refreshIdentity());
		});
		try {
			const { data, error } = await supabase.auth.getSession();
			if (error) throw error;
			if (!data.session) return this.accept(null);
			const revision = this.revision;
			const verified = await supabase.auth.getUser();
			if (revision !== this.revision) {
				await this.refreshIdentity();
				return this.getSession();
			}
			if (verified.error || !verified.data.user)
				throw verified.error ?? new Error("Session expired");
			this.accept({ ...data.session, user: verified.data.user });
			await this.refreshIdentity();
			return this.getSession();
		} catch (error) {
			this.accept(null);
			useAuthStore.setState({
				error: error instanceof Error ? error.message : "Session expired",
			});
			return undefined;
		} finally {
			useAuthStore.setState({ loading: false });
		}
	}
	async signIn(email: string, password: string) {
		if (!supabase) throw new Error("Supabase is not configured");
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password,
		});
		if (error) throw error;
		this.accept(data.session);
		await this.refreshIdentity();
		return this.getSession();
	}
	async signUp(email: string, password: string) {
		if (!supabase) throw new Error("Supabase is not configured");
		const { data, error } = await supabase.auth.signUp({
			email: email.trim(),
			password,
			options: { emailRedirectTo: `${window.location.origin}/login` },
		});
		if (error) throw error;
		return this.accept(data.session);
	}
	async signOut() {
		if (supabase) {
			const { error } = await supabase.auth.signOut({ scope: "local" });
			if (error) throw error;
		}
		this.accept(null);
		localStorage.removeItem("supportos:temporary-access:v1");
		localStorage.removeItem("supportos:supabase-session:v1");
	}
	async getAccessToken() {
		if (!supabase) throw new Error("Supabase is not configured");
		const { data, error } = await supabase.auth.getSession();
		if (error || !data.session) throw error ?? new Error("Sign in required");
		return data.session.access_token;
	}
	async refreshIdentity() {
		const current = this.getSession();
		if (!current) return;
		const revision = this.revision;
		const accessRevision = ++this.accessRevision;
		try {
			const response = await fetch("/api/accounts?action=me", {
				headers: { Authorization: `Bearer ${current.accessToken}` },
				cache: "no-store",
				signal: AbortSignal.timeout(10000),
			});
			if (
				revision !== this.revision ||
				accessRevision !== this.accessRevision ||
				this.getSession()?.user.id !== current.user.id
			)
				return;
			if (response.status === 401) {
				this.accept(null);
				return;
			}
			const result = await response.json();
			if (!response.ok)
				throw new Error(result.error ?? "Не удалось проверить доступ");
			if (
				revision !== this.revision ||
				accessRevision !== this.accessRevision ||
				this.getSession()?.user.id !== current.user.id
			)
				return;
			const access = result.access as import("../../shared/access.js").Access;
			if (
				!access ||
				!Array.isArray(access.roles) ||
				!Array.isArray(access.permissions)
			)
				throw new Error("Некорректный ответ сервера доступа");
			useAuthStore.setState({
				session: {
					...current,
					user: {
						...current.user,
						access,
						role: normalizeRole(access.roles[0]?.id),
					},
				},
				error: undefined,
			});
		} catch (error) {
			if (
				revision === this.revision &&
				accessRevision === this.accessRevision &&
				this.getSession()?.user.id === current.user.id
			)
				useAuthStore.setState({
					session: {
						...current,
						user: { ...current.user, access: undefined, role: "pending" },
					},
					error:
						error instanceof Error
							? error.message
							: "Не удалось проверить доступ",
				});
		}
	}
	async select<T>(table: string, query?: Record<string, QueryValue>) {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries({ select: "*", ...query })) {
			if (value !== undefined)
				params.set(key, value === null ? "is.null" : String(value));
		}
		return this.rest<T[]>(`/${table}?${params}`, { method: "GET" });
	}
	async upsert<T extends Record<string, unknown>>(table: string, rows: T[]) {
		if (!rows.length) return [];
		return this.rest<T[]>(`/${table}?on_conflict=id`, {
			method: "POST",
			headers: { Prefer: "resolution=merge-duplicates,return=representation" },
			body: JSON.stringify(rows),
		});
	}
	async updateWhere<T>(table: string, query: Record<string, string>, patch: Record<string, unknown>) {
		const params = new URLSearchParams(query);
		return this.rest<T[]>(`/${table}?${params}`, {
			method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
		});
	}
	async insert<T>(table: string, row: Record<string, unknown>) {
		return this.rest<T[]>(`/${table}`, {method:"POST", headers:{Prefer:"return=representation"}, body:JSON.stringify(row)});
	}
	async rpc<T>(name: string, body?: Record<string, unknown>) {
		return this.rest<T>(`/rpc/${name}`, {
			method: "POST",
			body: JSON.stringify(body ?? {}),
		});
	}
	async delete(table: string, id: string) {
		await this.rest(`/${table}?id=eq.${encodeURIComponent(id)}`, {
			method: "DELETE",
			headers: { Prefer: "return=minimal" },
		});
	}
	private async rest<T>(path: string, init: RequestInit) {
		const account = this.getSession()?.user.id;
		const token = await this.getAccessToken();
		if (!account || this.getSession()?.user.id !== account)
			throw new Error("Аккаунт изменился. Повторите действие.");
		const response = await fetch(
			`${import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1${path}`,
			{
				...init,
				headers: {
					"Content-Type": "application/json",
					apikey:
						import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
						import.meta.env.VITE_SUPABASE_ANON_KEY,
					Authorization: `Bearer ${token}`,
					...init.headers,
				},
			},
		);
		const payload = await response.text();
		if (!response.ok) throw new Error("Database request failed");
		return (payload ? JSON.parse(payload) : null) as T;
	}
}
export const supabaseService = new SupabaseService();
