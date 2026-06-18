import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { BonusProject } from "@/entities/bonus";

interface BonusState {
	projects: BonusProject[];
	selectedCurrency: string;
	setProjects: (projects: BonusProject[]) => void;
	upsertProjects: (projects: BonusProject[]) => void;
	replaceProjects: (projects: BonusProject[]) => void;
	removeProject: (id: string) => void;
	setSelectedCurrency: (currency: string) => void;
}

function normalizeCurrency(currency: string) {
	return currency.trim().toUpperCase() || "USD";
}

export const useBonusStore = create<BonusState>()(
	persist(
		(set, get) => ({
			projects: [],
			selectedCurrency: "USD",
			setProjects: (projects) => set({ projects }),
			upsertProjects: (projects) => {
				const current = get().projects;
				const bySlug = new Map(
					current.map((project) => [project.slug, project]),
				);

				for (const project of projects) {
					bySlug.set(project.slug, project);
				}

				set({
					projects: Array.from(bySlug.values()).sort((first, second) =>
						first.name.localeCompare(second.name),
					),
				});
			},
			replaceProjects: (projects) =>
				set({
					projects: [...projects].sort((first, second) =>
						first.name.localeCompare(second.name),
					),
				}),
			removeProject: (id) =>
				set((state) => ({
					projects: state.projects.filter((project) => project.id !== id),
				})),
			setSelectedCurrency: (currency) =>
				set({ selectedCurrency: normalizeCurrency(currency) }),
		}),
		{
			name: "supportos:deposit-bonuses:v1",
		},
	),
);
