import type { BonusProject } from "@/entities/bonus";
import type { ProjectEmailRecord } from "@/entities/project-email";
import {
	type KnowledgeDatabase,
	knowledgeService,
} from "@/services/knowledge.service";
import { useBonusStore } from "@/store/bonus.store";
import { useProjectEmailStore } from "@/store/project-email.store";

interface SupportOSExport {
	app: "SupportOS";
	version: 2;
	exportedAt: string;
	knowledge: KnowledgeDatabase;
	projectEmails: {
		records: ProjectEmailRecord[];
	};
	depositBonuses: {
		projects: BonusProject[];
		activeProjectId?: string;
		selectedCurrency: string;
	};
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isKnowledgeDatabase(value: unknown): value is KnowledgeDatabase {
	if (!value || typeof value !== "object") return false;

	const candidate = value as Partial<KnowledgeDatabase>;

	return (
		Array.isArray(candidate.categories) &&
		Array.isArray(candidate.folders) &&
		Array.isArray(candidate.binds)
	);
}

function parseJson(payload: string) {
	try {
		return JSON.parse(payload) as unknown;
	} catch {
		throw new Error("Invalid JSON file");
	}
}

class SupportOSExportService {
	exportJson() {
		const bonusState = useBonusStore.getState();
		const projectEmailState = useProjectEmailStore.getState();
		const knowledge = JSON.parse(
			knowledgeService.exportJson(),
		) as KnowledgeDatabase;
		const payload: SupportOSExport = {
			app: "SupportOS",
			version: 2,
			exportedAt: new Date().toISOString(),
			knowledge,
			projectEmails: {
				records: clone(projectEmailState.records),
			},
			depositBonuses: {
				projects: clone(bonusState.projects),
				activeProjectId: bonusState.activeProjectId,
				selectedCurrency: bonusState.selectedCurrency,
			},
		};

		return JSON.stringify(payload, null, 2);
	}

	importJson(payload: string) {
		const parsed = parseJson(payload);

		if (isKnowledgeDatabase(parsed)) {
			knowledgeService.importKnowledge(parsed);
			return;
		}

		if (!parsed || typeof parsed !== "object") {
			throw new Error("Invalid SupportOS export");
		}

		const candidate = parsed as Partial<SupportOSExport>;

		if (!isKnowledgeDatabase(candidate.knowledge)) {
			throw new Error("Invalid SupportOS export");
		}

		knowledgeService.importKnowledge(candidate.knowledge);

		if (Array.isArray(candidate.projectEmails?.records)) {
			useProjectEmailStore
				.getState()
				.setRecords(candidate.projectEmails.records);
		}

		if (Array.isArray(candidate.depositBonuses?.projects)) {
			const bonusState = useBonusStore.getState();

			bonusState.replaceProjects(candidate.depositBonuses.projects);

			if (candidate.depositBonuses.activeProjectId) {
				useBonusStore
					.getState()
					.setActiveProject(candidate.depositBonuses.activeProjectId);
			}

			if (candidate.depositBonuses.selectedCurrency) {
				useBonusStore
					.getState()
					.setSelectedCurrency(candidate.depositBonuses.selectedCurrency);
			}
		}
	}
}

export const supportOSExportService = new SupportOSExportService();
