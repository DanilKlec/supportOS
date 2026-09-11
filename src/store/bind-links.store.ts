import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	setBindLink,
	type BindLinks,
} from "@/features/shared-binds/bind-links";
interface State {
	accounts: Record<string, BindLinks>;
	remember: (user: string, links: BindLinks) => void;
	link: (user: string, source: string, local: string | null) => void;
}
export const EMPTY_BIND_LINKS: BindLinks = Object.freeze({});
export const useBindLinksStore = create<State>()(
	persist(
		(set, get) => ({
			accounts: {},
			remember: (user, links) => {
				if (
					JSON.stringify(get().accounts[user] ?? {}) === JSON.stringify(links)
				)
					return;
				set((s) => ({ accounts: { ...s.accounts, [user]: links } }));
			},
			link: (user, source, local) =>
				set((s) => ({
					accounts: {
						...s.accounts,
						[user]: setBindLink(s.accounts[user] ?? {}, source, local),
					},
				})),
		}),
		{
			name: "supportos:bind-links:v1",
			partialize: (s) => ({ accounts: s.accounts }),
		},
	),
);
