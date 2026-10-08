import type {
	BonusProject,
	DepositBonus,
	DepositBonusTranslation,
} from "@/entities/bonus";
import { BONUS_PROJECT_ALIASES } from "@/entities/bonus/project-aliases";
import { bonusCurrencyRegistryService } from "@/services/bonus-currency-registry.service";
import {
	type CurrencyRates,
	currencyService,
} from "@/services/currency.service";

export type CurrencyGroupOption = ReturnType<
	typeof bonusCurrencyRegistryService.getCurrencyGroupOptions
>[number];

export interface BonusDraft {
	name: string;
	minDepositAmount: string;
	minDepositCurrency: string;
	contents: Record<string, string>;
}

export const DEFAULT_BONUS_LANGUAGE = "ru";

export const BONUS_LANGUAGES = [
	{ code: "ru", label: "RU" },
	{ code: "en", label: "EN" },
	{ code: "de", label: "DE" },
	{ code: "pt", label: "PT" },
	{ code: "el", label: "GR" },
];

const EMPTY_DRAFT_CONTENT = { [DEFAULT_BONUS_LANGUAGE]: "" };

export function createEmptyBonusDraft(currency = "USD"): BonusDraft {
	return {
		name: "",
		minDepositAmount: "",
		minDepositCurrency: currency,
		contents: { ...EMPTY_DRAFT_CONTENT },
	};
}

export function formatCurrencyGroupLabel(name: string, currencies: string[]) {
	const visibleCurrencies = currencies.slice(0, 5).join(", ");

	return visibleCurrencies ? `${name} (${visibleCurrencies})` : name;
}

export function getCurrencyGroupShortName(name: string) {
	return name.replace(/^Currency\s*/i, "");
}

export function isEmptyBonusDraft(draft: BonusDraft) {
	return (
		!draft.name.trim() &&
		!draft.minDepositAmount.trim() &&
		Object.values(draft.contents).every((content) => !content.trim())
	);
}

export const FALLBACK_CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"RUB",
	"UAH",
	"TRY",
	"BRL",
	"CAD",
	"AUD",
	"PLN",
	"RON",
	"KZT",
];

function normalizeSearchText(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0451/g, "\u0435")
		.replace(/[^a-z0-9\u0430-\u044f\u0370-\u03ff]+/g, " ")
		.trim();
}

export function getSearchTokens(value: string) {
	return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function getSearchWords(value: string) {
	return getSearchTokens(value);
}

function getCompactSearchText(value: string) {
	return getSearchWords(value).join("");
}

function getInitials(value: string) {
	return getSearchWords(value)
		.map((word) => word[0])
		.filter(Boolean)
		.join("");
}

function matchesToken(value: string, token: string) {
	const words = getSearchWords(value);

	if (token.length <= 2) {
		const compact = words.join("");

		return (
			words.includes(token) ||
			compact === token ||
			words.some((word) => word.length <= 4 && word.startsWith(token))
		);
	}

	return normalizeSearchText(value).includes(token);
}

export function matchesTokens(value: string, tokens: string[]) {
	if (tokens.length === 0) return true;

	return tokens.every((token) => matchesToken(value, token));
}

function getProjectAliases(project: BonusProject) {
	const directAliases = BONUS_PROJECT_ALIASES[project.name.toUpperCase()] ?? [];
	const slugAliases = BONUS_PROJECT_ALIASES[project.slug.toUpperCase()] ?? [];
	const compactName = getCompactSearchText(project.name);
	const compactSlug = getCompactSearchText(project.slug);
	const reverseAliases = Object.entries(BONUS_PROJECT_ALIASES)
		.filter(([, aliases]) =>
			aliases.some((alias) => {
				const compactAlias = getCompactSearchText(alias);

				return compactAlias === compactName || compactAlias === compactSlug;
			}),
		)
		.map(([alias]) => alias.toLowerCase());

	return Array.from(
		new Set(
			[
				...directAliases,
				...slugAliases,
				...reverseAliases,
				getInitials(project.name),
			].filter(Boolean),
		),
	);
}

export function buildBonusSearchText(bonus: DepositBonus) {
	return [
		bonus.name,
		bonus.content,
		bonus.minDepositAmount?.toString() ?? "",
		bonus.minDepositCurrency ?? "",
		...getBonusTranslations(bonus).flatMap((translation) => [
			translation.language,
			translation.content,
		]),
	].join(" ");
}

export function buildProjectSearchText(project: BonusProject) {
	return [
		project.name,
		project.slug,
		project.sheetId ?? "",
		...getProjectAliases(project),
	].join(" ");
}

export function getProjectSearchScore(project: BonusProject, tokens: string[]) {
	if (tokens.length === 0) return 0;

	const projectText = buildProjectSearchText(project);
	const projectWords = new Set(getSearchWords(projectText));
	const projectMatches = matchesTokens(projectText, tokens);
	const bonusMatches = project.bonuses.some((bonus) =>
		matchesTokens(buildBonusSearchText(bonus), tokens),
	);

	if (!projectMatches && !bonusMatches) return -1;

	return tokens.reduce((score, token) => {
		if (projectWords.has(token)) return score + 120;
		if (
			Array.from(projectWords).some(
				(word) => word.length <= 4 && word.startsWith(token),
			)
		) {
			return score + 80;
		}
		if (matchesToken(projectText, token)) return score + 40;

		return score + 8;
	}, 0);
}

function getConvertedDeposit(
	bonus: DepositBonus,
	selectedCurrency: string,
	rates?: CurrencyRates,
) {
	if (!bonus.minDepositAmount || !bonus.minDepositCurrency || !rates) {
		return undefined;
	}

	return currencyService.convert({
		amount: bonus.minDepositAmount,
		from: bonus.minDepositCurrency,
		to: selectedCurrency,
		rates,
	});
}

export function formatDeposit(
	bonus: DepositBonus,
	selectedCurrency: string,
	rates?: CurrencyRates,
) {
	if (!bonus.minDepositAmount || !bonus.minDepositCurrency) {
		return "Минимальный депозит не указан";
	}

	const original = currencyService.format(
		bonus.minDepositAmount,
		bonus.minDepositCurrency,
	);
	const converted = getConvertedDeposit(bonus, selectedCurrency, rates);

	if (
		!converted ||
		bonus.minDepositCurrency.toUpperCase() === selectedCurrency.toUpperCase()
	) {
		return `Минимальный депозит: ${original}`;
	}

	return `Минимальный депозит: ${original} (~${currencyService.format(
		converted,
		selectedCurrency,
	)})`;
}

export function getLanguageLabel(language: string) {
	return (
		BONUS_LANGUAGES.find((item) => item.code === language)?.label ??
		language.toUpperCase()
	);
}

export function getBonusTranslations(
	bonus: DepositBonus,
): DepositBonusTranslation[] {
	const translations = bonus.translations?.filter((item) =>
		item.content?.trim(),
	);
	const content = bonus.content ?? "";

	if (translations?.length) return translations;

	return content.trim()
		? [
				{
					language: DEFAULT_BONUS_LANGUAGE,
					content,
					updatedAt: new Date().toISOString(),
				},
			]
		: [];
}

function getBonusContent(bonus: DepositBonus, language: string) {
	const translations = getBonusTranslations(bonus);

	return (
		translations.find((translation) => translation.language === language)
			?.content ??
		translations.find(
			(translation) => translation.language === DEFAULT_BONUS_LANGUAGE,
		)?.content ??
		translations.find((translation) => translation.language === "en")
			?.content ??
		translations[0]?.content ??
		bonus.content ??
		""
	);
}

function getBonusContentMap(bonus: DepositBonus) {
	const contentMap: Record<string, string> = {};

	for (const translation of getBonusTranslations(bonus)) {
		contentMap[translation.language] = translation.content;
	}

	if (!contentMap[DEFAULT_BONUS_LANGUAGE] && bonus.content?.trim()) {
		contentMap[DEFAULT_BONUS_LANGUAGE] = bonus.content;
	}

	return contentMap;
}

export function getDraftContent(draft: BonusDraft, language: string) {
	return draft.contents[language] ?? "";
}

export function setDraftLanguageContent(
	draft: BonusDraft,
	language: string,
	content: string,
): BonusDraft {
	return {
		...draft,
		contents: {
			...draft.contents,
			[language]: content,
		},
	};
}

export function buildDraftTranslations(
	draft: BonusDraft,
): DepositBonusTranslation[] {
	const updatedAt = new Date().toISOString();

	return Object.entries(draft.contents)
		.map(([language, content]) => ({
			language,
			content: content.trim(),
			updatedAt,
		}))
		.filter((translation) => translation.content);
}

export function pickPrimaryDraftContent(draft: BonusDraft, language: string) {
	const translations = buildDraftTranslations(draft);

	return (
		translations.find((translation) => translation.language === language)
			?.content ??
		translations.find(
			(translation) => translation.language === DEFAULT_BONUS_LANGUAGE,
		)?.content ??
		translations.find((translation) => translation.language === "en")
			?.content ??
		translations[0]?.content ??
		""
	);
}

export function getDisplayBonusContent({
	bonus,
	project,
	language,
	selectedCurrency,
	currencyTableName,
}: {
	bonus: DepositBonus;
	project?: BonusProject;
	language: string;
	selectedCurrency: string;
	currencyTableName?: string;
}) {
	return bonusCurrencyRegistryService.replaceProjectMoneyText({
		text: getBonusContent(bonus, language),
		project,
		targetCurrency: selectedCurrency,
		tableName: currencyTableName,
	});
}

export function buildBonusBind({
	bonus,
	project,
	language,
	selectedCurrency,
	currencyTableName,
}: {
	bonus: DepositBonus;
	project?: BonusProject;
	language: string;
	selectedCurrency: string;
	currencyTableName?: string;
}) {
	return getDisplayBonusContent({
		bonus,
		project,
		language,
		selectedCurrency,
		currencyTableName,
	}).trim();
}

export function buildPackageBind({
	project,
	language,
	selectedCurrency,
	rates,
	currencyTableName,
}: {
	project: BonusProject;
	language: string;
	selectedCurrency: string;
	rates?: CurrencyRates;
	currencyTableName?: string;
}) {
	return [
		`${project.name} welcome package`,
		"",
		...project.bonuses.flatMap((bonus, index) => [
			`${index + 1}. ${bonus.name}`,
			formatDeposit(bonus, selectedCurrency, rates),
			getDisplayBonusContent({
				bonus,
				project,
				language,
				selectedCurrency,
				currencyTableName,
			}),
			"",
		]),
	]
		.join("\n")
		.trim();
}

export function parseAmount(value: string) {
	const normalized = value.trim().replace(",", ".");

	if (!normalized) return undefined;

	const amount = Number(normalized);

	return Number.isFinite(amount) ? amount : undefined;
}

export function toDraft(bonus: DepositBonus): BonusDraft {
	return {
		name: bonus.name,
		minDepositAmount: bonus.minDepositAmount?.toString() ?? "",
		minDepositCurrency: bonus.minDepositCurrency ?? "USD",
		contents: getBonusContentMap(bonus),
	};
}
