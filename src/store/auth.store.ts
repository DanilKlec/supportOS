import { create } from "zustand";

export type AuthRole =
	| import("../../shared/access.js").Role
	| "user"
	| "supervisor";

export interface AuthUser {
	id: string;
	email: string;
	role: AuthRole;
	access?: import("../../shared/access.js").Access;
}

export interface AuthSession {
	authVerified?: boolean;
	mfaEnabled?: boolean;
	mfaRequired?: boolean;
	sessionId?: string;
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	user: AuthUser;
}

interface AuthState {
	passwordRecovery: boolean;
	configured: boolean;
	loading: boolean;
	session?: AuthSession;
	error?: string;
	setConfigured: (configured: boolean) => void;
	setLoading: (loading: boolean) => void;
	setSession: (session?: AuthSession) => void;
	setError: (error?: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
	passwordRecovery: false,
	configured: false,
	loading: true,
	session: undefined,
	error: undefined,
	setConfigured: (configured) => set({ configured }),
	setLoading: (loading) => set({ loading }),
	setSession: (session) => set({ session }),
	setError: (error) => set({ error }),
}));
