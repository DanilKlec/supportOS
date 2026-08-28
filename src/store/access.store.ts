import { create } from "zustand";

import type { AuthRole } from "./auth.store";

const SESSION_KEY = "supportos:temporary-access:v1";
const DEFAULT_LOGIN = "admin";
const DEFAULT_PASSWORD = "supportos";

export interface AccessSession {
	username: string;
	role: AuthRole;
}

interface AccessState {
	session?: AccessSession;
	signIn: (login: string, password: string) => boolean;
	signOut: () => void;
}

function getEnv(name: string) {
	return (import.meta.env[name] as string | undefined)?.trim() ?? "";
}

function readSession() {
	if (typeof window === "undefined") return undefined;

	try {
		const raw = window.localStorage.getItem(SESSION_KEY);
		if (!raw) return undefined;

		const session = JSON.parse(raw) as Partial<AccessSession>;
		if (
			typeof session.username !== "string" ||
			(session.role !== "admin" && session.role !== "user")
		) {
			return undefined;
		}

		return session as AccessSession;
	} catch {
		return undefined;
	}
}

export function isTemporaryAccessEnabled() {
	return getEnv("VITE_SUPPORTOS_TEMP_AUTH_ENABLED") !== "false";
}

export const useAccessStore = create<AccessState>((set) => ({
	session: readSession(),
	signIn: (login, password) => {
		const expectedLogin =
			getEnv("VITE_SUPPORTOS_TEMP_AUTH_LOGIN") || DEFAULT_LOGIN;
		const expectedPassword =
			getEnv("VITE_SUPPORTOS_TEMP_AUTH_PASSWORD") || DEFAULT_PASSWORD;

		if (login.trim() !== expectedLogin || password !== expectedPassword) {
			return false;
		}

		const session: AccessSession = {
			username: expectedLogin,
			role: "admin",
		};

		if (typeof window !== "undefined") {
			window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
		}
		set({ session });
		return true;
	},
	signOut: () => {
		if (typeof window !== "undefined") {
			window.localStorage.removeItem(SESSION_KEY);
		}
		set({ session: undefined });
	},
}));
