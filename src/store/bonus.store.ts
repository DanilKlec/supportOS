import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { BonusProject } from "@/entities/bonus";

interface BonusState {
	projects: BonusProject[];
	activeProjectId?: string;
	selectedCurrency: string;
	setProjects: (projects: BonusProject[]) => void;
	upsertProjects: (projects: BonusProject[]) => void;
	replaceProjects: (projects: BonusProject[]) => void;
	addProject: (name: string) => BonusProject | undefined;
	renameProject: (id: string, name: string) => void;
	removeProject: (id: string) => void;
	setActiveProject: (id?: string) => void;
	addBonus: (
		projectId: string,
		bonus: Omit<BonusProject["bonuses"][number], "id" | "order">,
	) => void;
	updateBonus: (
		projectId: string,
		bonusId: string,
		patch: Partial<Omit<BonusProject["bonuses"][number], "id">>,
	) => void;
	removeBonus: (projectId: string, bonusId: string) => void;
	setSelectedCurrency: (currency: string) => void;
}

function normalizeCurrency(currency: string) {
	return currency.trim().toUpperCase() || "USD";
}

function createId(prefix: string) {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;

	return `${prefix}-${random}`;
}

function slugify(value: string) {
	const slug = value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || `project-${Date.now()}`;
}

function sortProjects(projects: BonusProject[]) {
	return [...projects].sort((first, second) =>
		first.name.localeCompare(second.name),
	);
}

function touchProject(project: BonusProject) {
	return {
		...project,
		updatedAt: new Date().toISOString(),
	};
}

export const useBonusStore = create<BonusState>()(
	persist(
		(set, get) => ({
			projects: [],
			activeProjectId: undefined,
			selectedCurrency: "USD",
			setProjects: (projects) =>
				set((state) => ({
					projects: sortProjects(projects),
					activeProjectId:
						state.activeProjectId &&
						projects.some((project) => project.id === state.activeProjectId)
							? state.activeProjectId
							: projects[0]?.id,
				})),
			upsertProjects: (projects) => {
				const current = get().projects;
				const bySlug = new Map(
					current.map((project) => [project.slug, project]),
				);

				for (const project of projects) {
					bySlug.set(project.slug, project);
				}

				const nextProjects = sortProjects(Array.from(bySlug.values()));

				set({
					projects: nextProjects,
					activeProjectId: get().activeProjectId ?? nextProjects[0]?.id,
				});
			},
			replaceProjects: (projects) =>
				set({
					projects: sortProjects(projects),
					activeProjectId: projects[0]?.id,
				}),
			addProject: (name) => {
				const trimmedName = name.trim();

				if (!trimmedName) return undefined;

				const project: BonusProject = {
					id: createId("bonus-project"),
					name: trimmedName,
					slug: slugify(trimmedName),
					bonuses: [],
					updatedAt: new Date().toISOString(),
				};

				set((state) => ({
					projects: sortProjects([...state.projects, project]),
					activeProjectId: project.id,
				}));

				return project;
			},
			renameProject: (id, name) => {
				const trimmedName = name.trim();

				if (!trimmedName) return;

				set((state) => ({
					projects: sortProjects(
						state.projects.map((project) =>
							project.id === id
								? touchProject({
										...project,
										name: trimmedName,
										slug: slugify(trimmedName),
									})
								: project,
						),
					),
				}));
			},
			removeProject: (id) =>
				set((state) => ({
					projects: state.projects.filter((project) => project.id !== id),
					activeProjectId:
						state.activeProjectId === id
							? state.projects.find((project) => project.id !== id)?.id
							: state.activeProjectId,
				})),
			setActiveProject: (activeProjectId) => set({ activeProjectId }),
			addBonus: (projectId, bonus) =>
				set((state) => ({
					projects: state.projects.map((project) =>
						project.id === projectId
							? touchProject({
									...project,
									bonuses: [
										...project.bonuses,
										{
											...bonus,
											id: createId("deposit-bonus"),
											order:
												Math.max(
													0,
													...project.bonuses.map((item) => item.order),
												) + 1,
										},
									],
								})
							: project,
					),
				})),
			updateBonus: (projectId, bonusId, patch) =>
				set((state) => ({
					projects: state.projects.map((project) =>
						project.id === projectId
							? touchProject({
									...project,
									bonuses: project.bonuses.map((bonus) =>
										bonus.id === bonusId ? { ...bonus, ...patch } : bonus,
									),
								})
							: project,
					),
				})),
			removeBonus: (projectId, bonusId) =>
				set((state) => ({
					projects: state.projects.map((project) =>
						project.id === projectId
							? touchProject({
									...project,
									bonuses: project.bonuses.filter(
										(bonus) => bonus.id !== bonusId,
									),
								})
							: project,
					),
				})),
			setSelectedCurrency: (currency) =>
				set({ selectedCurrency: normalizeCurrency(currency) }),
		}),
		{
			name: "supportos:deposit-bonuses:v1",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				projects: state.projects,
				activeProjectId: state.activeProjectId,
				selectedCurrency: state.selectedCurrency,
			}),
		},
	),
);
