import type {
	BonusProject,
	DepositBonus,
	DepositBonusTranslation,
} from "@/entities/bonus";
import {
	extractGoogleSheetGid,
	extractGoogleSpreadsheetId,
	extractPublishedGoogleSpreadsheetId,
	fetchGoogleSheetArrayBuffer,
	fetchGoogleSheetText,
	looksLikeGoogleSheetHtml,
	toGoogleSheetExportUrl,
	toGoogleSheetNamedExportUrl,
	toGoogleSheetXlsxExportUrl,
} from "@/services/google-sheet-fetch.service";

export type DepositBonusImportMode = "upsert" | "replace";

export interface DepositBonusImportPreview {
	sourceUrl: string;
	csvUrl: string;
	projects: BonusProject[];
	errors: string[];
	warnings: string[];
}

interface SheetTab {
	gid?: string;
	sheetName?: string;
	title: string;
}

interface XlsxSheet {
	sheetId: string;
	title: string;
	rows: string[][];
}

interface XlsxWorkbookImport {
	sourceUrl: string;
	projects: BonusProject[];
	warnings: string[];
	sourceLabel: string;
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

const EMOJI_PATTERN =
	/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu;

function cleanImportedText(value: string) {
	return value
		.replace(EMOJI_PATTERN, "")
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.filter(Boolean)
		.join("\n")
		.trim();
}

function cleanCell(value: string | undefined) {
	const text = cleanImportedText(value ?? "");

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

function decodeHtml(value: string) {
	if (typeof document === "undefined") {
		return value
			.replace(/&#(\d+);/g, (_, code) =>
				String.fromCharCode(Number.parseInt(code, 10)),
			)
			.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
				String.fromCharCode(Number.parseInt(code, 16)),
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

function decodeJsonString(value: string) {
	try {
		return JSON.parse(`"${value}"`) as string;
	} catch {
		return value.replace(/\\"/g, '"').replace(/\\u0026/g, "&");
	}
}

function toGoogleTabExportUrl(sourceUrl: string, tab: SheetTab) {
	if (tab.gid) {
		return toGoogleSheetExportUrl(sourceUrl, tab.gid);
	}

	if (tab.sheetName) {
		return toGoogleSheetNamedExportUrl(sourceUrl, tab.sheetName);
	}

	return toGoogleSheetExportUrl(sourceUrl);
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

function readUint16(view: DataView, offset: number) {
	return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
	return view.getUint32(offset, true);
}

function isZipWorkbook(bytes: ArrayBuffer) {
	const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));

	return (
		header[0] === 0x50 &&
		header[1] === 0x4b &&
		header[2] === 0x03 &&
		header[3] === 0x04
	);
}

function findEndOfCentralDirectory(bytes: Uint8Array, view: DataView) {
	const minOffset = Math.max(0, bytes.length - 66000);

	for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
		if (readUint32(view, offset) === 0x06054b50) {
			return offset;
		}
	}

	return -1;
}

async function inflateRawBytes(compressed: Uint8Array) {
	if (typeof DecompressionStream === "undefined") {
		throw new Error("XLSX decompression is not supported in this browser");
	}

	const compressedBuffer = compressed.buffer.slice(
		compressed.byteOffset,
		compressed.byteOffset + compressed.byteLength,
	);
	const stream = new Blob([compressedBuffer])
		.stream()
		.pipeThrough(new DecompressionStream("deflate-raw"));

	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(bytes: ArrayBuffer) {
	const source = new Uint8Array(bytes);
	const view = new DataView(bytes);
	const decoder = new TextDecoder();
	const endOfCentralDirectory = findEndOfCentralDirectory(source, view);
	const entries = new Map<string, string>();

	if (endOfCentralDirectory < 0) {
		throw new Error("Invalid XLSX archive");
	}

	const entryCount = readUint16(view, endOfCentralDirectory + 10);
	let centralDirectoryOffset = readUint32(view, endOfCentralDirectory + 16);

	for (let index = 0; index < entryCount; index += 1) {
		if (readUint32(view, centralDirectoryOffset) !== 0x02014b50) {
			throw new Error("Invalid XLSX central directory");
		}

		const compressionMethod = readUint16(view, centralDirectoryOffset + 10);
		const compressedSize = readUint32(view, centralDirectoryOffset + 20);
		const nameLength = readUint16(view, centralDirectoryOffset + 28);
		const extraLength = readUint16(view, centralDirectoryOffset + 30);
		const commentLength = readUint16(view, centralDirectoryOffset + 32);
		const localHeaderOffset = readUint32(view, centralDirectoryOffset + 42);
		const nameBytes = source.slice(
			centralDirectoryOffset + 46,
			centralDirectoryOffset + 46 + nameLength,
		);
		const name = decoder.decode(nameBytes);

		if (readUint32(view, localHeaderOffset) !== 0x04034b50) {
			throw new Error("Invalid XLSX local header");
		}

		const localNameLength = readUint16(view, localHeaderOffset + 26);
		const localExtraLength = readUint16(view, localHeaderOffset + 28);
		const compressedStart =
			localHeaderOffset + 30 + localNameLength + localExtraLength;
		const compressed = source.slice(
			compressedStart,
			compressedStart + compressedSize,
		);
		const uncompressed =
			compressionMethod === 0
				? compressed
				: compressionMethod === 8
					? await inflateRawBytes(compressed)
					: undefined;

		if (!uncompressed) {
			throw new Error(
				`Unsupported XLSX compression method ${compressionMethod}`,
			);
		}

		entries.set(name, decoder.decode(uncompressed));
		centralDirectoryOffset += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

function decodeXmlText(value: string) {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&#(\d+);/g, (_, code) =>
			String.fromCodePoint(Number.parseInt(code, 10)),
		)
		.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
			String.fromCodePoint(Number.parseInt(code, 16)),
		)
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getXmlAttribute(source: string, name: string) {
	const match = source.match(
		new RegExp(`(?:^|\\s)${escapeRegExp(name)}="([^"]*)"`),
	);

	return match?.[1] ? decodeXmlText(match[1]) : undefined;
}

function normalizeZipPath(path: string) {
	const parts: string[] = [];

	for (const part of path.replace(/\\/g, "/").split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			parts.pop();
			continue;
		}

		parts.push(part);
	}

	return parts.join("/");
}

function resolveWorkbookRelationshipTarget(target: string) {
	if (target.startsWith("/")) {
		return normalizeZipPath(target.slice(1));
	}

	return normalizeZipPath(`xl/${target}`);
}

function parseWorkbookRelationships(xml: string) {
	const relationships = new Map<string, string>();

	for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
		const tag = match[0];
		const id = getXmlAttribute(tag, "Id");
		const target = getXmlAttribute(tag, "Target");
		const type = getXmlAttribute(tag, "Type");

		if (!id || !target || !type?.includes("/worksheet")) continue;

		relationships.set(id, resolveWorkbookRelationshipTarget(target));
	}

	return relationships;
}

function parseWorkbookSheets(xml: string) {
	return Array.from(xml.matchAll(/<sheet\b[^>]*\/?>/g))
		.map((match) => {
			const tag = match[0];

			return {
				title: getXmlAttribute(tag, "name") ?? "Sheet",
				sheetId: getXmlAttribute(tag, "sheetId") ?? "",
				relationshipId: getXmlAttribute(tag, "r:id") ?? "",
				state: getXmlAttribute(tag, "state") ?? "visible",
			};
		})
		.filter((sheet) => sheet.relationshipId && sheet.state !== "hidden");
}

function readTextNodes(xml: string) {
	return Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
		.map((match) => decodeXmlText(match[1] ?? ""))
		.join("");
}

function parseSharedStrings(xml: string | undefined) {
	if (!xml) return [];

	return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((match) =>
		readTextNodes(match[1] ?? ""),
	);
}

function columnNameToIndex(columnName: string) {
	let index = 0;

	for (const letter of columnName) {
		index = index * 26 + letter.charCodeAt(0) - 64;
	}

	return Math.max(index - 1, 0);
}

function getCellColumnIndex(attributes: string, fallbackIndex: number) {
	const reference = getXmlAttribute(attributes, "r");
	const columnName = reference?.match(/^[A-Z]+/)?.[0];

	return columnName ? columnNameToIndex(columnName) : fallbackIndex;
}

function readCellValue(
	attributes: string,
	body: string,
	sharedStrings: string[],
) {
	const type = getXmlAttribute(attributes, "t");
	const value = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";

	if (type === "inlineStr") {
		return readTextNodes(body);
	}

	if (type === "s") {
		const sharedStringIndex = Number.parseInt(decodeXmlText(value), 10);

		return sharedStrings[sharedStringIndex] ?? "";
	}

	if (type === "b") {
		return value === "1" ? "TRUE" : "FALSE";
	}

	return decodeXmlText(value);
}

function trimTrailingEmptyCells(row: string[]) {
	const nextRow = [...row];

	while (nextRow.length > 0 && !cleanCell(nextRow[nextRow.length - 1])) {
		nextRow.pop();
	}

	return nextRow;
}

function parseXlsxSheetRows(xml: string, sharedStrings: string[]) {
	const rows: string[][] = [];
	const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;

	for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
		const rowXml = rowMatch[1] ?? "";
		const row: string[] = [];
		let fallbackColumnIndex = 0;

		for (const cellMatch of rowXml.matchAll(cellPattern)) {
			const attributes = cellMatch[1] ?? cellMatch[3] ?? "";
			const body = cellMatch[2] ?? "";
			const columnIndex = getCellColumnIndex(attributes, fallbackColumnIndex);

			row[columnIndex] = readCellValue(attributes, body, sharedStrings);
			fallbackColumnIndex = Math.max(fallbackColumnIndex, columnIndex + 1);
		}

		const trimmedRow = trimTrailingEmptyCells(row);

		if (trimmedRow.some((cell) => cleanCell(cell))) {
			rows.push(trimmedRow);
		}
	}

	return rows;
}

async function parseXlsxWorkbook(bytes: ArrayBuffer): Promise<XlsxSheet[]> {
	const entries = await unzipEntries(bytes);
	const workbookXml = entries.get("xl/workbook.xml");
	const relationshipsXml = entries.get("xl/_rels/workbook.xml.rels");

	if (!workbookXml || !relationshipsXml) {
		throw new Error("XLSX workbook metadata is missing");
	}

	const relationships = parseWorkbookRelationships(relationshipsXml);
	const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml"));

	return parseWorkbookSheets(workbookXml)
		.map((sheet, index) => {
			const sheetPath = relationships.get(sheet.relationshipId);
			const sheetXml = sheetPath ? entries.get(sheetPath) : undefined;

			if (!sheetXml) return undefined;

			return {
				sheetId: sheet.sheetId || `xlsx-${index + 1}`,
				title: sheet.title || `Sheet ${index + 1}`,
				rows: parseXlsxSheetRows(sheetXml, sharedStrings),
			};
		})
		.filter((sheet): sheet is XlsxSheet => Boolean(sheet));
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
	const setTab = (tab: SheetTab) => {
		const key = tab.gid ? `gid:${tab.gid}` : `name:${tab.title}`;
		const existingWithSameTitle = Array.from(tabs.entries()).find(
			([, existing]) => existing.title === tab.title,
		);

		if (existingWithSameTitle) {
			const [existingKey, existingTab] = existingWithSameTitle;

			if (tab.gid && !existingTab.gid) {
				tabs.delete(existingKey);
			} else {
				return;
			}
		}

		if (tab.title && !tabs.has(key)) {
			tabs.set(key, tab);
		}
	};
	const metadataSources = [
		html,
		html
			.replace(/\\u003d/g, "=")
			.replace(/\\u0026/g, "&")
			.replace(/\\u003c/g, "<")
			.replace(/\\u003e/g, ">")
			.replace(/\\"/g, '"'),
	];
	const sheetIdPatterns = [
		/"sheetId"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"((?:\\"|[^"])*)"/g,
		/"title"\s*:\s*"((?:\\"|[^"])*)"\s*,\s*"sheetId"\s*:\s*(\d+)/g,
	];
	const anchorPattern =
		/<a\b[^>]*(?:gid=|gid%3D|#gid=)(\d+)[^>]*>([\s\S]*?)<\/a>/gi;
	const tabCaptionPattern =
		/<div\b[^>]*class="[^"]*\bdocs-sheet-tab-caption\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

	for (const source of metadataSources) {
		for (const pattern of sheetIdPatterns) {
			for (const match of source.matchAll(pattern)) {
				const first = match[1] ?? "";
				const second = match[2] ?? "";
				const firstIsGid = /^\d+$/.test(first);
				const gid = firstIsGid ? first : second;
				const title = decodeJsonString(firstIsGid ? second : first);

				if (gid && title) {
					setTab({ gid, title });
				}
			}
		}

		for (const match of source.matchAll(anchorPattern)) {
			const gid = match[1] ?? "";
			const title = decodeHtml((match[2] ?? "").replace(/<[^>]*>/g, ""));

			if (gid && title) {
				setTab({ gid, title });
			}
		}

		for (const match of source.matchAll(tabCaptionPattern)) {
			const title = decodeHtml((match[1] ?? "").replace(/<[^>]*>/g, ""));

			if (title) {
				setTab({ sheetName: title, title });
			}
		}
	}

	return Array.from(tabs.values()).filter(
		(tab) => tab.title && !tab.title.toLowerCase().includes("html"),
	);
}

async function discoverSheetTabs(sourceUrl: string) {
	const spreadsheetId = extractGoogleSpreadsheetId(sourceUrl);
	const publishedSpreadsheetId = extractPublishedGoogleSpreadsheetId(sourceUrl);
	const explicitGid = extractGoogleSheetGid(sourceUrl);

	if (!spreadsheetId && !publishedSpreadsheetId) {
		return [{ gid: "0", title: "Imported Project" }];
	}

	const candidates = publishedSpreadsheetId
		? [
				sourceUrl,
				`https://docs.google.com/spreadsheets/d/e/${publishedSpreadsheetId}/pubhtml`,
			]
		: [
				`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`,
				`https://docs.google.com/spreadsheets/d/${spreadsheetId}/pubhtml`,
				sourceUrl,
			];

	for (const candidate of Array.from(new Set(candidates))) {
		try {
			const response = await fetchGoogleSheetText(candidate);

			if (!response.ok) continue;

			const tabs = parseTabsFromHtml(response.text);

			if (tabs.length > 0) {
				return tabs;
			}
		} catch {
			// The CSV export fallback below still handles a single visible sheet.
		}
	}

	if (explicitGid) {
		return [{ gid: explicitGid, title: `Sheet ${explicitGid}` }];
	}

	return [{ gid: "0", title: "Sheet 1" }];
}

async function importXlsxWorkbook(
	sourceUrl: string,
): Promise<XlsxWorkbookImport | undefined> {
	const xlsxUrl = toGoogleSheetXlsxExportUrl(sourceUrl);

	if (!xlsxUrl) return undefined;

	try {
		const response = await fetchGoogleSheetArrayBuffer(xlsxUrl);

		if (!response.ok || !isZipWorkbook(response.bytes)) {
			return undefined;
		}

		const sheets = await parseXlsxWorkbook(response.bytes);

		if (sheets.length === 0) return undefined;

		const projects: BonusProject[] = [];
		const warnings: string[] = [];

		for (const sheet of sheets) {
			const bonuses = parseBonusesFromRows(sheet.rows);

			if (bonuses.length === 0) {
				warnings.push(`${sheet.title}: no bonuses found`);
				continue;
			}

			const project = createProject({
				name: sheet.title,
				bonuses,
				sheetId: sheet.sheetId,
				sourceUrl,
			});

			project.sourceHash = await hashText(JSON.stringify(project));
			projects.push(project);
		}

		return {
			sourceUrl,
			projects,
			warnings,
			sourceLabel: xlsxUrl,
		};
	} catch {
		return undefined;
	}
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
			const tabsAreUnnamedFallback =
				tabs.length === 1 &&
				!tabs[0]?.sheetName &&
				tabs[0]?.title.startsWith("Sheet ");

			if (tabsAreUnnamedFallback) {
				const workbookImport = await importXlsxWorkbook(sourceUrl);

				if (workbookImport) {
					projects.push(...workbookImport.projects);
					warnings.push(...workbookImport.warnings);
					csvUrls.push(workbookImport.sourceLabel);
					continue;
				}

				warnings.push(
					"Sheet names could not be detected. Import used gid as project name.",
				);
			}

			for (const tab of tabs) {
				const csvUrl = toGoogleTabExportUrl(sourceUrl, tab);
				const response = await fetchGoogleSheetText(csvUrl);

				csvUrls.push(csvUrl);

				if (!response.ok) {
					warnings.push(
						`${tab.title}: unable to load sheet (${response.status})`,
					);
					continue;
				}

				if (looksLikeGoogleSheetHtml(response.text)) {
					warnings.push(
						`${tab.title}: Google returned a web page instead of table data. Publish the sheet to the web or share it for anyone with the link.`,
					);
					continue;
				}

				const rows = parseDelimited(response.text);
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

export const __depositBonusImportInternals = {
	discoverSheetTabs,
	importXlsxWorkbook,
	parseXlsxWorkbook,
	parseTabsFromHtml,
};
