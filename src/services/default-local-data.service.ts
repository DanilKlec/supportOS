import type { BonusProject, DepositBonus } from "@/entities/bonus";
import defaultDepositBonuses from "@/entities/bonus/mock/defaultDepositBonuses.json";
import type { ProjectEmailRecord } from "@/entities/project-email";
import defaultProjectEmails from "@/entities/project-email/mock/defaultProjectEmails.json";
import { useBonusStore } from "@/store/bonus.store";
import { useProjectEmailStore } from "@/store/project-email.store";

type ProjectEmailConfigRecord = Partial<ProjectEmailRecord> & {
	projectName: string;
};

type DepositBonusConfig = Partial<DepositBonus> & {
	name: string;
};

type BonusProjectConfig = Omit<Partial<BonusProject>, "bonuses"> & {
	name: string;
	bonuses?: DepositBonusConfig[];
};

function now() {
	return new Date().toISOString();
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

	return slug || `item-${Date.now()}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function normalizeEmail(value: unknown) {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeProjectEmails(value: unknown): ProjectEmailRecord[] {
	if (!Array.isArray(value)) return [];

	return value
		.filter(
			(record): record is ProjectEmailConfigRecord =>
				isObjectRecord(record) &&
				typeof record.projectName === "string" &&
				Boolean(record.projectName.trim()),
		)
		.map((record) => {
			const projectName = record.projectName.trim();

			return {
				id: record.id || createId("project-email"),
				projectName,
				slug: record.slug || slugify(projectName),
				supportEmail: normalizeEmail(record.supportEmail),
				kycEmail: normalizeEmail(record.kycEmail),
				vipEmail: normalizeEmail(record.vipEmail),
				sourceHash: record.sourceHash,
				updatedAt: record.updatedAt || now(),
			};
		})
		.filter(
			(record) => record.supportEmail || record.kycEmail || record.vipEmail,
		);
}

function normalizeDepositBonuses(value: unknown): BonusProject[] {
	if (!Array.isArray(value)) return [];

	return value
		.filter(
			(project): project is BonusProjectConfig =>
				isObjectRecord(project) &&
				typeof project.name === "string" &&
				Boolean(project.name.trim()),
		)
		.map((project) => {
			const projectName = project.name.trim();
			const rawBonuses: unknown[] = Array.isArray(project.bonuses)
				? project.bonuses
				: [];
			const bonuses = rawBonuses
				.filter(
					(bonus): bonus is DepositBonusConfig =>
						isObjectRecord(bonus) &&
						typeof bonus.name === "string" &&
						Boolean(bonus.name.trim()),
				)
				.map((bonus, bonusIndex) => ({
					id: bonus.id || createId("deposit-bonus"),
					name: bonus.name.trim(),
					minDepositAmount: bonus.minDepositAmount,
					minDepositCurrency: bonus.minDepositCurrency || "USD",
					content: bonus.content || "",
					translations: Array.isArray(bonus.translations)
						? bonus.translations
						: [],
					order: bonus.order ?? bonusIndex + 1,
				}));

			return {
				id: project.id || createId("bonus-project"),
				name: projectName,
				slug: project.slug || slugify(projectName),
				sheetId: project.sheetId,
				sourceUrl: project.sourceUrl,
				sourceHash: project.sourceHash,
				bonuses,
				updatedAt: project.updatedAt || now(),
			};
		})
		.filter((project) => project.bonuses.length > 0);
}

class DefaultLocalDataService {
	apply() {
		this.applyProjectEmails();
		this.applyDepositBonuses();
	}

	private applyProjectEmails() {
		const records = normalizeProjectEmails(defaultProjectEmails);

		if (records.length === 0) return;
		if (useProjectEmailStore.getState().records.length > 0) return;

		useProjectEmailStore.getState().setRecords(records);
	}

	private applyDepositBonuses() {
		const projects = normalizeDepositBonuses(defaultDepositBonuses);

		if (projects.length === 0) return;
		if (useBonusStore.getState().projects.length > 0) return;

		useBonusStore.getState().setProjects(projects);
	}
}

export const defaultLocalDataService = new DefaultLocalDataService();
