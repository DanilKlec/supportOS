import { useSyncExternalStore } from "react";
import { useAuthStore } from "@/store/auth.store";

const listeners = new Set<() => void>();
const cache = new Map<string, unknown>();
const prefix = "supportos:preferences:v1:";
export function readPreference<T>(actor: string, name: string, fallback: T): T {
	const key = prefix + JSON.stringify([actor, name]);
	if (!cache.has(key)) {
		try {
			cache.set(
				key,
				JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback,
			);
		} catch {
			cache.set(key, fallback);
		}
	}
	return cache.get(key) as T;
}
export function writePreference<T>(actor: string, name: string, value: T) {
	const key = prefix + JSON.stringify([actor, name]);
	cache.set(key, value);
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* In-memory fallback. */
	}
	for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};
/** Only durable UI preferences; customer text belongs in useViewState session storage. */
export function usePreference<T>(
	name: string,
	fallback: T,
): [T, (value: T) => void] {
	const actor = useAuthStore((s) => s.session?.user.id) ?? "guest";
	const value = useSyncExternalStore(
		subscribe,
		() => readPreference(actor, name, fallback),
		() => fallback,
	);
	return [value, (next) => writePreference(actor, name, next)];
}
