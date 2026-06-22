import type { BonusProject } from "@/entities/bonus";
import { BONUS_PROJECT_ALIASES } from "@/entities/bonus/project-aliases";
import {
	type BonusRule,
	type BonusToolsData,
	type CurrencyTable,
	findCurrencyValue,
	getCurrencyTableNameForRule,
	loadStoredBonusToolsData,
	normalizeBonusToolsSearch,
} from "@/services/bonus-tools.service";

export interface BonusCurrencyContext {
	rule: BonusRule;
	table: CurrencyTable;
	currencies: string[];
}

const EUR_AMOUNT_PATTERN =
	/(^|[^a-zа-яё0-9_])(?:€\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:€|EUR))(?![a-zа-яё0-9_])/giu;

function normalizeCurrency(currency: string) {
	return currency.trim().toUpperCase();
}

function normalizeProjectKey(value: string) {
	return normalizeBonusToolsSearch(value).replace(/\s+/g, "");
}

function getAliasValues(value: string) {
	const upperValue = value.toUpperCase();

	return BONUS_PROJECT_ALIASES[upperValue] ?? [];
}

function getProjectKeys(project: BonusProject) {
	const rawValues = [
		project.name,
		project.slug,
		project.name.replace(/\.(com|co|net|org)$/i, ""),
		project.slug.replace(/\.(com|co|net|org)$/i, ""),
		...getAliasValues(project.name),
		...getAliasValues(project.slug),
	];

	return new Set(
		rawValues.map(normalizeProjectKey).filter((value) => value.length >= 3),
	);
}

function findProjectRule(project: BonusProject, data: BonusToolsData) {
	const projectKeys = getProjectKeys(project);

	for (const rule of data.rules) {
		const ruleKey = normalizeProjectKey(rule.site);

		if (projectKeys.has(ruleKey)) return rule;
	}

	for (const rule of data.rules) {
		const ruleKey = normalizeProjectKey(rule.site);

		if (ruleKey.length < 5) continue;

		for (const projectKey of projectKeys) {
			if (projectKey.includes(ruleKey) || ruleKey.includes(projectKey)) {
				return rule;
			}
		}
	}

	return undefined;
}

function getRuleTable(rule: BonusRule, tables: CurrencyTable[]) {
	const tableName = getCurrencyTableNameForRule(rule, tables);

	return tables.find((table) => table.name === tableName) ?? tables[0];
}

function getCurrencyContext(project: BonusProject, data?: BonusToolsData) {
	const registryData = data ?? loadStoredBonusToolsData();

	if (!registryData) return undefined;

	const rule = findProjectRule(project, registryData);

	if (!rule) return undefined;

	const table = getRuleTable(rule, registryData.currencyTables);

	if (!table) return undefined;

	return {
		rule,
		table,
		currencies: table.currencies,
	};
}

function getDefaultCurrency(context?: BonusCurrencyContext) {
	if (!context) return undefined;

	return context.currencies.includes("EUR") ? "EUR" : context.currencies[0];
}

function replaceEuroAmounts(
	text: string,
	table: CurrencyTable,
	targetCurrency: string,
) {
	const currency = normalizeCurrency(targetCurrency);

	if (!currency || !table.currencies.includes(currency)) return text;

	return text.replace(
		EUR_AMOUNT_PATTERN,
		(match, prefix: string, prefixedAmount: string, suffixedAmount: string) => {
			const amount = prefixedAmount || suffixedAmount;
			const converted = findCurrencyValue(table, amount, currency);

			return converted ? `${prefix}${converted}` : match;
		},
	);
}

class BonusCurrencyRegistryService {
	getProjectContext(project?: BonusProject, data?: BonusToolsData) {
		return project ? getCurrencyContext(project, data) : undefined;
	}

	getCurrencyOptions({
		project,
		data,
		fallback = [],
	}: {
		project?: BonusProject;
		data?: BonusToolsData;
		fallback?: string[];
	}) {
		const context = this.getProjectContext(project, data);
		const values = new Set([
			...(context?.currencies ?? []),
			...fallback.map(normalizeCurrency),
		]);

		return Array.from(values).filter(Boolean).sort();
	}

	getDefaultCurrency(project?: BonusProject, data?: BonusToolsData) {
		return getDefaultCurrency(this.getProjectContext(project, data));
	}

	replaceProjectMoneyText({
		text,
		project,
		targetCurrency,
		data,
	}: {
		text: string;
		project?: BonusProject;
		targetCurrency: string;
		data?: BonusToolsData;
	}) {
		const context = this.getProjectContext(project, data);

		if (!context) return text;

		return replaceEuroAmounts(text, context.table, targetCurrency);
	}
}

export const bonusCurrencyRegistryService = new BonusCurrencyRegistryService();
