import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ProjectEmailRecord } from "@/entities/project-email";

interface ProjectEmailState {
	records: ProjectEmailRecord[];
	setRecords: (records: ProjectEmailRecord[]) => void;
	upsertRecords: (records: ProjectEmailRecord[]) => void;
	replaceRecords: (records: ProjectEmailRecord[]) => void;
	removeRecord: (id: string) => void;
}

function sortRecords(records: ProjectEmailRecord[]) {
	return [...records].sort((first, second) =>
		first.projectName.localeCompare(second.projectName),
	);
}

export const useProjectEmailStore = create<ProjectEmailState>()(
	persist(
		(set, get) => ({
			records: [],
			setRecords: (records) => set({ records: sortRecords(records) }),
			upsertRecords: (records) => {
				const bySlug = new Map(
					get().records.map((record) => [record.slug, record]),
				);

				for (const record of records) {
					bySlug.set(record.slug, record);
				}

				set({ records: sortRecords(Array.from(bySlug.values())) });
			},
			replaceRecords: (records) => set({ records: sortRecords(records) }),
			removeRecord: (id) =>
				set((state) => ({
					records: state.records.filter((record) => record.id !== id),
				})),
		}),
		{
			name: "supportos:project-emails:v1",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				records: state.records,
			}),
		},
	),
);
