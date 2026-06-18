import type {
	BonusProject,
	DepositBonus,
	DepositBonusTranslation,
} from "@/entities/bonus";

export type DepositBonusImportMode = "upsert" | "replace";

export interface DepositBonusImportPreview {
	sourceUrl: string;
	csvUrl: string;
	projects: BonusProject[];
	errors: string[];
	warnings: string[];
}

interface SheetTab {
	gid: string;
	title: string;
}

const COMMON_CURRENCIES = [
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
	"INR",
	"JPY",
];

const BONUS_HEADER_WORDS = [
	"bonus",
	"offer",
	"package",
	"name",
	"\u0431\u043e\u043d\u0443\u0441",
	"\u043f\u0430\u043a\u0435\u0442",
	"\u043d\u0430\u0437\u0432\u0430\u043d",
];
const CONTENT_HEADER_WORDS = [
	"content",
	"text",
	"bind",
	"description",
	"\u0442\u0435\u043a\u0441\u0442",
	"\u043e\u043f\u0438\u0441\u0430\u043d",
];
const DEPOSIT_HEADER_WORDS = [
	"min deposit",
	"minimum deposit",
	"deposit",
	"min",
	"\u0434\u0435\u043f\u043e\u0437\u0438\u0442",
	"\u043c\u0438\u043d",
];
const CURRENCY_HEADER_WORDS = ["currency", "\u0432\u0430\u043b\u044e\u0442"];
const LANGUAGE_HEADER_MAP = new Map(
	Object.entries({
		ru: "ru",
		rus: "ru",
		russian: "ru",
		eng: "en",
		en: "en",
		english: "en",
		de: "de",
		deu: "de",
		german: "de",
		pt: "pt",
		por: "pt",
		portuguese: "pt",
		gr: "el",
		el: "el",
		greek: "el",
	}),
);
const CURRENCY_SYMBOLS = new Map(
	Object.entries({
		"\u20ac": "EUR",
		$: "USD",
		"\u00a3": "GBP",
		"\u20bd": "RUB",
		"\u20b4": "UAH",
		"\u20ba": "TRY",
	}),
);

function createId(prefix: string) {
	const random =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(36).slice(2)}`;

	return `${prefix}-${random}`;
}

function cleanCell(value: string | undefined) {
	const text = (value ?? "").trim();

	if (!text || text === "#NAME?") return "";

	return text;
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

async function hashText(value: string) {
	const bytes = new TextEncoder().encode(value);

	if (crypto.subtle) {
		const digest = await crypto.subtle.digest("SHA-256", bytes);

		return Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
	}

	let hash = 0;

	for (const char of value) {
		hash = (hash << 5) - hash + char.charCodeAt(0);
		hash |= 0;
	}

	return Math.abs(hash).toString(16);
}

function normalizeHeader(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/\u0451/g, "\u0435")
		.replace(/[^a-z\u0430-\u044f0-9]+/g, " ")
		.trim();
}

function extractSpreadsheetId(url: string) {
	try {
		const parsed = new URL(url);
		const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);

		return match?.[1];
	} catch {
		return undefined;
	}
}

function extractGid(url: string) {
	try {
		const parsed = new URL(url);

		return (
			parsed.searchParams.get("gid") ?? parsed.hash.match(/gid=(\d+)/)?.[1]
		);
	} catch {
		return undefined;
	}
}

function decodeHtml(value: string) {
	const textarea = document.createElement("textarea");

	textarea.innerHTML = value;

	return textarea.value.trim();
}

function decodeJsonString(value: string) {
	try {
		return JSON.parse(`"${value}"`) as string;
	} catch {
		return value.replace(/\\"/g, '"').replace(/\\u0026/g, "&");
	}
}

function toGoogleExportUrl(sourceUrl: string, gid?: string) {
	const spreadsheetId = extractSpreadsheetId(sourceUrl);

	if (!spreadsheetId) return sourceUrl;

	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=tsv&gid=${gid ?? extractGid(sourceUrl) ?? "0"}`;
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

function findColumn(headers: string[], candidates: string[]) {
	return headers.findIndex((header) =>
		candidates.some((candidate) => header.includes(candidate)),
	);
}

function hasHeaderWords(headers: string[]) {
	return headers.some((header) =>
		[
			...BONUS_HEADER_WORDS,
			...CONTENT_HEADER_WORDS,
			...DEPOSIT_HEADER_WORDS,
			...CURRENCY_HEADER_WORDS,
		].some((word) => header.includes(word)),
	);
}

function parseMoney(value: string) {
	const normalized = value.replace(/\s+/g, " ");
	const explicitDepositMatch = normalized.match(
		/(?:min(?:imum)?\s*deposit|\u043c\u0438\u043d[^\s:;,.!?-]*\s*\u0434\u0435\u043f[^\s:;,.!?-]*|\u0434\u0435\u043f\u043e\u0437\u0438\u0442)\D{0,30}(\d+(?:[.,]\d+)?)/i,
	);
	const amountMatch =
		explicitDepositMatch ?? normalized.match(/(\d+(?:[.,]\d+)?)/);
	const currencyMatch = normalized.match(/\b[A-Z]{3}\b/i);
	const symbolCurrency = Array.from(CURRENCY_SYMBOLS.entries()).find(
		([symbol]) => normalized.includes(symbol),
	)?.[1];
	const amount = amountMatch
		? Number(amountMatch[1].replace(",", "."))
		: undefined;
	const currency = currencyMatch?.[0]?.toUpperCase();

	return {
		amount: Number.isFinite(amount) ? amount : undefined,
		currency:
			currency && COMMON_CURRENCIES.includes(currency)
				? currency
				: symbolCurrency,
	};
}

function getRowValue(row: string[], index: number) {
	return index >= 0 ? cleanCell(row[index]) : "";
}

function createProject({
	name,
	bonuses,
	sheetId,
	sourceUrl,
}: {
	name: string;
	bonuses: DepositBonus[];
	sheetId?: string;
	sourceUrl: string;
}): BonusProject {
	return {
		id: createId("bonus-project"),
		name,
		slug: slugify(name),
		sheetId,
		sourceUrl,
		bonuses,
		updatedAt: new Date().toISOString(),
	};
}

function createBonus({
	name,
	content,
	translations,
	order,
	amount,
	currency,
}: {
	name: string;
	content: string;
	translations?: DepositBonusTranslation[];
	order: number;
	amount?: number;
	currency?: string;
}): DepositBonus {
	return {
		id: createId("deposit-bonus"),
		name,
		content,
		translations,
		order,
		minDepositAmount: amount,
		minDepositCurrency: currency || "USD",
	};
}

function getLanguageColumns(headers: string[]) {
	return headers
		.map((header, index) => ({
			index,
			language: LANGUAGE_HEADER_MAP.get(normalizeHeader(header)),
		}))
		.filter((item): item is { index: number; language: string } =>
			Boolean(item.language),
		);
}

function parseLanguageTableRows(rows: string[][]) {
	const [headerRow, ...bodyRows] = rows;

	if (!headerRow) return undefined;

	const languageColumns = getLanguageColumns(headerRow);

	if (languageColumns.length < 2) return undefined;

	const nameColumn =
		headerRow.findIndex((header) => {
			const normalized = normalizeHeader(header);

			return (
				normalized.includes("bonus") ||
				normalized.includes("deposit") ||
				normalized.includes("\u0431\u043e\u043d\u0443\u0441") ||
				normalized.includes("\u0434\u0435\u043f")
			);
		}) >= 0
			? headerRow.findIndex((header) => {
					const normalized = normalizeHeader(header);

					return (
						normalized.includes("bonus") ||
						normalized.includes("deposit") ||
						normalized.includes("\u0431\u043e\u043d\u0443\u0441") ||
						normalized.includes("\u0434\u0435\u043f")
					);
				})
			: 0;
	const bonuses: DepositBonus[] = [];

	for (const row of bodyRows) {
		const name = cleanCell(row[nameColumn]) || `Bonus ${bonuses.length + 1}`;
		const translations = languageColumns
			.map(({ index, language }) => ({
				language,
				content: cleanCell(row[index]),
				updatedAt: new Date().toISOString(),
			}))
			.filter((translation) => translation.content);

		if (translations.length === 0) continue;

		const primaryTranslation =
			translations.find((translation) => translation.language === "ru") ??
			translations.find((translation) => translation.language === "en") ??
			translations[0];
		const money = parseMoney(
			translations.map((translation) => translation.content).join("\n"),
		);

		bonuses.push(
			createBonus({
				name,
				content: primaryTranslation?.content ?? "",
				translations,
				order: bonuses.length + 1,
				amount: money.amount,
				currency: money.currency,
			}),
		);
	}

	return bonuses;
}

function parseBonusesFromRows(rows: string[][]) {
	const [firstRow, ...restRows] = rows;

	if (!firstRow) return [];

	const languageTableBonuses = parseLanguageTableRows(rows);

	if (languageTableBonuses) return languageTableBonuses;

	const normalizedFirstRow = firstRow.map(normalizeHeader);
	const hasHeaders = hasHeaderWords(normalizedFirstRow);
	const headers = hasHeaders ? normalizedFirstRow : [];
	const bodyRows = hasHeaders ? restRows : rows;
	const bonusColumn = hasHeaders ? findColumn(headers, BONUS_HEADER_WORDS) : 0;
	const contentColumn = hasHeaders
		? findColumn(headers, CONTENT_HEADER_WORDS)
		: 2;
	const depositColumn = hasHeaders
		? findColumn(headers, DEPOSIT_HEADER_WORDS)
		: 1;
	const currencyColumn = hasHeaders
		? findColumn(headers, CURRENCY_HEADER_WORDS)
		: 3;
	const bonuses: DepositBonus[] = [];

	for (const row of bodyRows) {
		const fallbackName = cleanCell(row[0]);
		const fallbackDeposit = cleanCell(row[1]);
		const fallbackContent = cleanCell(row[2]);
		const name = getRowValue(row, bonusColumn) || fallbackName;
		const depositText = getRowValue(row, depositColumn) || fallbackDeposit;
		const content =
			getRowValue(row, contentColumn) ||
			(hasHeaders ? name : fallbackContent || name);
		const parsedMoney = parseMoney(`${depositText} ${content}`);
		const currency =
			getRowValue(row, currencyColumn).toUpperCase() || parsedMoney.currency;

		if (!name && !content) continue;

		bonuses.push(
			createBonus({
				name: name || `Bonus ${bonuses.length + 1}`,
				content: content || name,
				translations: [
					{
						language: "ru",
						content: content || name,
						updatedAt: new Date().toISOString(),
					},
				],
				order: bonuses.length + 1,
				amount: parsedMoney.amount,
				currency,
			}),
		);
	}

	return bonuses;
}

function parseTabsFromHtml(html: string) {
	const tabs = new Map<string, SheetTab>();
	const sheetIdPatterns = [
		/"sheetId"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"((?:\\"|[^"])*)"/g,
		/"title"\s*:\s*"((?:\\"|[^"])*)"\s*,\s*"sheetId"\s*:\s*(\d+)/g,
	];
	const anchorPattern = /gid=(\d+)[^>]*>([^<]+)</g;

	for (const pattern of sheetIdPatterns) {
		for (const match of html.matchAll(pattern)) {
			const first = match[1] ?? "";
			const second = match[2] ?? "";
			const firstIsGid = /^\d+$/.test(first);
			const gid = firstIsGid ? first : second;
			const title = decodeJsonString(firstIsGid ? second : first);

			if (gid && title && !tabs.has(gid)) {
				tabs.set(gid, { gid, title });
			}
		}
	}

	for (const match of html.matchAll(anchorPattern)) {
		const gid = match[1] ?? "";
		const title = decodeHtml(match[2] ?? "");

		if (gid && title && !tabs.has(gid)) {
			tabs.set(gid, { gid, title });
		}
	}

	return Array.from(tabs.values()).filter(
		(tab) => tab.title && !tab.title.toLowerCase().includes("html"),
	);
}

async function discoverSheetTabs(sourceUrl: string) {
	const spreadsheetId = extractSpreadsheetId(sourceUrl);
	const explicitGid = extractGid(sourceUrl);

	if (!spreadsheetId) {
		return [{ gid: "0", title: "Imported Project" }];
	}

	if (explicitGid) {
		return [{ gid: explicitGid, title: `Sheet ${explicitGid}` }];
	}

	const candidates = [
		`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`,
		`https://docs.google.com/spreadsheets/d/${spreadsheetId}/pubhtml`,
		sourceUrl,
	];

	for (const candidate of candidates) {
		try {
			const response = await fetch(candidate);

			if (!response.ok) continue;

			const tabs = parseTabsFromHtml(await response.text());

			if (tabs.length > 0) {
				return tabs;
			}
		} catch {
			// The CSV export fallback below still handles the first visible sheet.
		}
	}

	return [{ gid: "0", title: "Sheet 1" }];
}

function splitSourceUrls(value: string) {
	return value
		.split(/\r?\n/)
		.map((item) => item.trim())
		.filter(Boolean);
}

class DepositBonusImportService {
	async preview(input: string): Promise<DepositBonusImportPreview> {
		const sourceUrls = splitSourceUrls(input);

		if (sourceUrls.length === 0) {
			throw new Error("Google Sheets URL is required");
		}

		const projects: BonusProject[] = [];
		const errors: string[] = [];
		const warnings: string[] = [];
		const csvUrls: string[] = [];

		for (const sourceUrl of sourceUrls) {
			const tabs = await discoverSheetTabs(sourceUrl);

			if (tabs.length === 1 && tabs[0]?.title.startsWith("Sheet ")) {
				warnings.push(
					"Sheet names could not be detected. Import used gid as project name.",
				);
			}

			for (const tab of tabs) {
				const csvUrl = toGoogleExportUrl(sourceUrl, tab.gid);
				const response = await fetch(csvUrl);

				csvUrls.push(csvUrl);

				if (!response.ok) {
					warnings.push(`${tab.title}: unable to load sheet`);
					continue;
				}

				const rows = parseDelimited(await response.text());
				const bonuses = parseBonusesFromRows(rows);

				if (bonuses.length === 0) {
					warnings.push(`${tab.title}: no bonuses found`);
					continue;
				}

				const project = createProject({
					name: tab.title,
					bonuses,
					sheetId: tab.gid,
					sourceUrl,
				});

				project.sourceHash = await hashText(JSON.stringify(project));
				projects.push(project);
			}
		}

		if (projects.length === 0) {
			errors.push("No importable bonus sheets found");
		}

		return {
			sourceUrl: sourceUrls.join("\n"),
			csvUrl: csvUrls.join("\n"),
			projects,
			errors,
			warnings,
		};
	}
}

export const depositBonusImportService = new DepositBonusImportService();
