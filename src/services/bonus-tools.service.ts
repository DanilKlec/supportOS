import { B2C_BONUS_PROJECTS } from "@/entities/bonus/project-aliases";
import {
	fetchGoogleSheetText,
	looksLikeGoogleSheetHtml,
	toGoogleSheetNamedExportUrl,
} from "@/services/google-sheet-fetch.service";

export const DEFAULT_BONUS_TOOLS_SHEET_URL =
	"https://docs.google.com/spreadsheets/d/1AhBX-mv0miFxumbAJODeR4_8PcmUbN5mSMfD4pz5HwY/edit?usp=sharing";

export interface BonusRule {
	id: string;
	group: string;
	site: string;
	welcomeWager: string;
	welcomeMaxWin: string;
	noDeposit: string;
	retentionWager: string;
	retentionMaxWin: string;
	events: string;
	map: string;
	note: string;
	searchText: string;
}

export interface CurrencyRow {
	base: string;
	baseAmount?: number;
	values: Record<string, string>;
}

export interface CurrencyTable {
	name: string;
	currencies: string[];
	rows: CurrencyRow[];
}

export interface BonusToolsData {
	sourceUrl: string;
	rules: BonusRule[];
	currencyTables: CurrencyTable[];
	loadedAt: string;
	warnings: string[];
}

const BONUS_TOOLS_STORAGE_KEY = "supportos:bonus-tools:v1";

const KNOWN_CURRENCY_SHEETS = [
	"Currency GZ, EC",
	"Currency CS",
	"Currency EG",
	"Currency IG",
	"Currency B2C",
];

const B2C_PROJECTS = new Set(B2C_BONUS_PROJECTS.map(normalizeKey));

function isBonusToolsData(value: unknown): value is BonusToolsData {
	if (!value || typeof value !== "object") return false;

	const candidate = value as Partial<BonusToolsData>;

	return (
		typeof candidate.sourceUrl === "string" &&
		Array.isArray(candidate.rules) &&
		Array.isArray(candidate.currencyTables) &&
		typeof candidate.loadedAt === "string" &&
		Array.isArray(candidate.warnings)
	);
}

export function loadStoredBonusToolsData() {
	if (typeof localStorage === "undefined") return undefined;

	try {
		const rawValue = localStorage.getItem(BONUS_TOOLS_STORAGE_KEY);

		if (!rawValue) return undefined;

		const parsed = JSON.parse(rawValue) as unknown;

		return isBonusToolsData(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export function saveStoredBonusToolsData(data: BonusToolsData) {
	if (typeof localStorage === "undefined") return;

	localStorage.setItem(BONUS_TOOLS_STORAGE_KEY, JSON.stringify(data));
}

function cleanCell(value: string | undefined) {
	const text = (value ?? "").trim();

	if (!text || text === "#NAME?") return "";

	return text;
}

export function normalizeBonusToolsSearch(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0451/g, "\u0435")
		.replace(/[^a-z0-9\u0430-\u044f\u0370-\u03ff]+/g, " ")
		.trim();
}

function normalizeKey(value: string) {
	return normalizeBonusToolsSearch(value).replace(/\s+/g, "");
}

function createId(value: string) {
	return normalizeKey(value) || `bonus-tool-${Date.now()}`;
}

function detectDelimiter(text: string) {
	const firstLine = text.split(/\r?\n/, 1)[0] ?? "";

	return firstLine.includes("\t") ? "\t" : ",";
}

function parseDelimited(text: string) {
	const delimiter = detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];

		if (char === '"' && quoted && next === '"') {
			cell += '"';
			index += 1;
			continue;
		}

		if (char === '"') {
			quoted = !quoted;
			continue;
		}

		if (!quoted && char === delimiter) {
			row.push(cell);
			cell = "";
			continue;
		}

		if (!quoted && (char === "\n" || char === "\r")) {
			if (char === "\r" && next === "\n") {
				index += 1;
			}

			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
			continue;
		}

		cell += char;
	}

	row.push(cell);

	if (row.some((item) => item.trim())) {
		rows.push(row);
	}

	return rows;
}

function decodeHtml(value: string) {
	if (typeof document === "undefined") {
		return value
			.replace(/&#(\d+);/g, (_, code) =>
				String.fromCodePoint(Number.parseInt(code, 10)),
			)
			.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
				String.fromCodePoint(Number.parseInt(code, 16)),
			)
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.trim();
	}

	const textarea = document.createElement("textarea");

	textarea.innerHTML = value;

	return textarea.value.trim();
}

function parseSheetNames(html: string) {
	return Array.from(
		html.matchAll(
			/<div\b[^>]*class="[^"]*\bdocs-sheet-tab-caption\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
		),
	)
		.map((match) => decodeHtml((match[1] ?? "").replace(/<[^>]*>/g, "")))
		.filter(Boolean);
}

async function discoverSheetNames(sourceUrl: string) {
	const response = await fetchGoogleSheetText(sourceUrl);

	if (!response.ok || !looksLikeGoogleSheetHtml(response.text)) {
		return [];
	}

	return parseSheetNames(response.text);
}

async function readSheetRows(sourceUrl: string, sheetName: string) {
	const csvUrl = toGoogleSheetNamedExportUrl(sourceUrl, sheetName);
	const response = await fetchGoogleSheetText(csvUrl);

	if (!response.ok) {
		throw new Error(`${sheetName}: unable to load sheet (${response.status})`);
	}

	if (looksLikeGoogleSheetHtml(response.text)) {
		throw new Error(`${sheetName}: Google returned a web page instead of data`);
	}

	return parseDelimited(response.text);
}

function buildRuleSearchText(rule: Omit<BonusRule, "searchText">) {
	return normalizeBonusToolsSearch(
		[
			rule.group,
			rule.site,
			rule.welcomeWager,
			rule.welcomeMaxWin,
			rule.noDeposit,
			rule.retentionWager,
			rule.retentionMaxWin,
			rule.events,
			rule.map,
			rule.note,
		].join(" "),
	);
}

function parseBonusRules(rows: string[][]) {
	const rules: BonusRule[] = [];
	let group = "";

	for (const row of rows.slice(1)) {
		const nextGroup = cleanCell(row[0]);
		const site = cleanCell(row[1]);

		if (nextGroup) {
			group = nextGroup;
		}

		if (!site) continue;

		const ruleWithoutSearch = {
			id: createId(`${group}-${site}`),
			group,
			site,
			welcomeWager: cleanCell(row[2]),
			welcomeMaxWin: cleanCell(row[3]),
			noDeposit: cleanCell(row[4]),
			retentionWager: cleanCell(row[5]),
			retentionMaxWin: cleanCell(row[6]),
			events: cleanCell(row[7]),
			map: cleanCell(row[8]),
			note: cleanCell(row[9]),
		};

		rules.push({
			...ruleWithoutSearch,
			searchText: buildRuleSearchText(ruleWithoutSearch),
		});
	}

	return rules;
}

function parseNumber(value: string) {
	const match = value.replace(/\s+/g, "").match(/\d+(?:[.,]\d+)?/);
	const amount = match ? Number(match[0].replace(",", ".")) : undefined;

	return Number.isFinite(amount) ? amount : undefined;
}

function parseCurrencyHeader(value: string) {
	const code = value.match(/[A-Z]{3}/i)?.[0]?.toUpperCase();

	return {
		code,
		value: parseNumber(value),
	};
}

function formatCurrencyCell(value: string, code: string) {
	const text = cleanCell(value);

	if (!text) return "";

	return /[A-Z]{3}/i.test(text) ? text.toUpperCase() : `${text} ${code}`;
}

function parseCurrencyTable(name: string, rows: string[][]): CurrencyTable {
	const [headerRow, ...bodyRows] = rows;
	const headers = (headerRow ?? []).map(parseCurrencyHeader);
	const currencies = headers
		.map((header) => header.code)
		.filter((code): code is string => Boolean(code));
	const hasHeaderValues = headers.some((header) => header.value !== undefined);
	const dataRows = hasHeaderValues
		? [
				headers.map((header) =>
					header.value === undefined ? "" : String(header.value),
				),
				...bodyRows,
			]
		: bodyRows;
	const parsedRows = dataRows
		.map((row) => {
			const values: Record<string, string> = {};
			let base = "";
			let baseAmount: number | undefined;

			for (const [index, cell] of row.entries()) {
				const code = headers[index]?.code;

				if (!code) continue;

				const formatted = formatCurrencyCell(cell, code);

				if (!formatted) continue;

				values[code] = formatted;

				if (code === "EUR") {
					base = formatted;
					baseAmount = parseNumber(formatted);
				}
			}

			if (!base) {
				const firstCode = currencies[0];

				if (firstCode) {
					base = values[firstCode] ?? "";
					baseAmount = parseNumber(base);
				}
			}

			return {
				base,
				baseAmount,
				values,
			};
		})
		.filter((row) => row.base && Object.keys(row.values).length > 0);

	return {
		name,
		currencies,
		rows: parsedRows,
	};
}

function amountMatches(first?: number, second?: number) {
	if (first === undefined || second === undefined) return false;

	return Math.abs(first - second) < 0.001;
}

export function getCurrencyTableNameForRule(
	rule: BonusRule | undefined,
	tables: CurrencyTable[],
) {
	if (!rule) return tables[0]?.name;

	const site = normalizeKey(rule.site);

	if (rule.group.toUpperCase() === "B2C" || B2C_PROJECTS.has(site)) {
		return tables.find((table) => normalizeKey(table.name).includes("b2c"))
			?.name;
	}

	if (site.includes("cosmicslot")) return "Currency CS";
	if (site.includes("egogames")) return "Currency EG";
	if (site.includes("ignibet")) return "Currency IG";
	if (site.includes("gamblezen")) return "Currency GZ, EC";

	return tables.find((table) => table.name !== "Currency B2C")?.name;
}

export function findCurrencyValue(
	table: CurrencyTable | undefined,
	baseValue: string,
	currency: string,
) {
	const baseAmount = parseNumber(baseValue);
	const code = currency.toUpperCase();
	const row =
		table?.rows.find((item) => amountMatches(item.baseAmount, baseAmount)) ??
		table?.rows[0];

	return row?.values[code] ?? "";
}

export function formatRuleCurrencyAmount(
	rule: BonusRule | undefined,
	table: CurrencyTable | undefined,
	currency: string,
	value: string | undefined,
) {
	const amount = cleanCell(value);

	if (!amount || !rule) return amount;

	const baseAmount = parseNumber(amount);

	if (baseAmount === undefined) return amount;

	const converted = findCurrencyValue(table, amount, currency);
	const eur = `${baseAmount} EUR`;

	if (!converted || currency.toUpperCase() === "EUR") {
		return eur;
	}

	return `${eur} / ${converted}`;
}

export function buildBonusRuleBind({
	rule,
	table,
	currency,
}: {
	rule: BonusRule;
	table?: CurrencyTable;
	currency: string;
}) {
	return [
		`${rule.site} bonus rules`,
		`Group: ${rule.group || "-"}`,
		`Welcome wager: ${rule.welcomeWager || "-"}`,
		`Welcome max win / FS release: ${rule.welcomeMaxWin || "-"}`,
		`No deposit: ${
			formatRuleCurrencyAmount(rule, table, currency, rule.noDeposit) || "-"
		}`,
		`Retention wager: ${rule.retentionWager || "-"}`,
		`Retention max win / FS release: ${rule.retentionMaxWin || "-"}`,
		`Events: ${rule.events || "-"}`,
		rule.map ? `Map: ${rule.map}` : "",
		rule.note ? `Note: ${rule.note}` : "",
	]
		.filter(Boolean)
		.join("\n");
}

class BonusToolsService {
	async load(url = DEFAULT_BONUS_TOOLS_SHEET_URL): Promise<BonusToolsData> {
		const sourceUrl = url.trim() || DEFAULT_BONUS_TOOLS_SHEET_URL;
		const sheetNames = await discoverSheetNames(sourceUrl);
		const currencySheetNames =
			sheetNames.filter((sheetName) =>
				normalizeKey(sheetName).startsWith("currency"),
			).length > 0
				? sheetNames.filter((sheetName) =>
						normalizeKey(sheetName).startsWith("currency"),
					)
				: KNOWN_CURRENCY_SHEETS;
		const warnings: string[] = [];
		const [bonusRows, ...currencyRows] = await Promise.all([
			readSheetRows(sourceUrl, "Bonus"),
			...currencySheetNames.map(async (sheetName) => ({
				sheetName,
				rows: await readSheetRows(sourceUrl, sheetName),
			})),
		]);
		const rules = parseBonusRules(bonusRows);
		const currencyTables = currencyRows.map(({ sheetName, rows }) =>
			parseCurrencyTable(sheetName, rows),
		);

		if (rules.length === 0) {
			warnings.push("Bonus sheet has no importable rows");
		}

		if (currencyTables.length === 0) {
			warnings.push("Currency sheets were not found");
		}

		return {
			sourceUrl,
			rules,
			currencyTables,
			loadedAt: new Date().toISOString(),
			warnings,
		};
	}
}

export const bonusToolsService = new BonusToolsService();
