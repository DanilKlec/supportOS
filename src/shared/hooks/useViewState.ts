import { create } from "zustand";
import type { Dispatch, SetStateAction } from "react";
import { useAuthStore } from "@/store/auth.store";
const useViews = create<{
	values: Record<string, unknown>;
	set: (key: string, value: unknown) => void;
}>((set) => ({
	values: {},
	set: (key, value) => set((s) => ({ values: { ...s.values, [key]: value } })),
}));
// UI preferences only; never store catalog data here.
export function useViewState<T>(
	scope: string,
	field: string,
	fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
	const actor = useAuthStore((s) => s.session?.user.id) ?? "guest";
	const key = JSON.stringify([actor, scope, field]);
	const value = useViews((s) =>
		Object.hasOwn(s.values, key) ? (s.values[key] as T) : fallback,
	);
	const update: Dispatch<SetStateAction<T>> = (next) => {
		const state = useViews.getState();
		const old = Object.hasOwn(state.values, key)
			? (state.values[key] as T)
			: fallback;
		state.set(
			key,
			typeof next === "function" ? (next as (v: T) => T)(old) : next,
		);
	};
	return [value, update];
}
