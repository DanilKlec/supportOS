import { create } from "zustand";

import type { ProjectEmailRecord } from "@/entities/project-email";

export const PROJECT_EMAIL_LEGACY_STORAGE_KEY = "supportos:project-emails:v1";

export function clearLegacyProjectEmailRecords() {
	if (typeof window === "undefined") return;

	window.localStorage.removeItem(PROJECT_EMAIL_LEGACY_STORAGE_KEY);
}

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

export const useProjectEmailStore = create<ProjectEmailState>()((set, get) => ({
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
}));
