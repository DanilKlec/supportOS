import type { Dispatch, SetStateAction } from "react";
import { create } from "zustand";
import { useAuthStore } from "@/store/auth.store";

const useViews = create<{
	values: Record<string, unknown>;
	set: (key: string, value: unknown) => void;
}>((set) => ({
	values: {},
	set: (key, value) => set((s) => ({ values: { ...s.values, [key]: value } })),
}));
const prefix = "supportos:session-view:v1:";
const restored = new Map<string, unknown>();
function read<T>(key: string, fallback: T): T {
	if (restored.has(key)) return restored.get(key) as T;
	try {
		const raw = sessionStorage.getItem(prefix + key);
		const value = raw === null ? fallback : JSON.parse(raw);
		restored.set(key, value);
		return value;
	} catch {
		return fallback;
	}
}
export function clearSessionViews() {
	try {
		for (const key of Object.keys(sessionStorage)) {
			if (key.startsWith(prefix)) sessionStorage.removeItem(key);
		}
	} catch {
		/* Storage can be disabled by browser policy. */
	}
	restored.clear();
	useViews.setState({ values: {} });
}
useAuthStore.subscribe((state, previous) => {
	if (previous.session && previous.session.user.id !== state.session?.user.id)
		clearSessionViews();
});
// UI preferences only; never store catalog data here.
export function useViewState<T>(
	scope: string,
	field: string,
	fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
	const actor = useAuthStore((s) => s.session?.user.id) ?? "guest";
	const key = JSON.stringify([actor, scope, field]);
	const value = useViews((s) =>
		Object.hasOwn(s.values, key) ? (s.values[key] as T) : read(key, fallback),
	);
	const update: Dispatch<SetStateAction<T>> = (next) => {
		if (actor !== (useAuthStore.getState().session?.user.id ?? "guest")) return;
		const state = useViews.getState();
		const old = Object.hasOwn(state.values, key)
			? (state.values[key] as T)
			: read(key, fallback);
		const value =
			typeof next === "function" ? (next as (v: T) => T)(old) : next;
		state.set(key, value);
		try {
			sessionStorage.setItem(prefix + key, JSON.stringify(value));
		} catch {
			/* Keep in-memory state if storage is full. */
		}
	};
	return [value, update];
}
