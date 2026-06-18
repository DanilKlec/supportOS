import type { BonusProject, DepositBonus } from "@/entities/bonus";

export type DepositBonusImportMode = "upsert" | "replace";

export interface DepositBonusImportPreview {
	sourceUrl: string;
	csvUrl: string;
	projects: BonusProject[];
	errors: string[];
	warnings: string[];
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
		.replace(/ё/g, "е")
		.replace(/[^a-zа-я0-9]+/g, " ")
		.trim();
}

function toGoogleExportUrl(url: string) {
	const parsed = new URL(url);

	if (parsed.searchParams.get("output") || parsed.pathname.endsWith(".csv")) {
		return url;
	}

	const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);

	if (!match) return url;

	const gid = parsed.searchParams.get("gid") ?? "0";

	return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=tsv&gid=${gid}`;
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

function parseMoney(value: string) {
	const normalized = value.replace(/\s+/g, " ");
	const amountMatch = normalized.match(/(\d+(?:[.,]\d+)?)/);
	const currencyMatch = normalized.match(/\b[A-Z]{3}\b/i);
	const amount = amountMatch
		? Number(amountMatch[1].replace(",", "."))
		: undefined;
	const currency = currencyMatch?.[0]?.toUpperCase();

	return {
		amount: Number.isFinite(amount) ? amount : undefined,
		currency:
			currency && COMMON_CURRENCIES.includes(currency) ? currency : undefined,
	};
}

function getRowValue(row: string[], index: number) {
	return index >= 0 ? cleanCell(row[index]) : "";
}

function collectWideBonusGroups(headers: string[]) {
	const groups = new Map<
		string,
		{
			name?: number;
			content?: number;
			deposit?: number;
			currency?: number;
		}
	>();

	headers.forEach((header, index) => {
		const match = header.match(/(?:bonus|бонус|package|пакет)\s*(\d+)/);
		const reverseMatch = header.match(/(\d+)\s*(?:bonus|бонус|package|пакет)/);
		const number = match?.[1] ?? reverseMatch?.[1];

		if (!number) return;

		const group = groups.get(number) ?? {};

		if (
			header.includes("min") ||
			header.includes("deposit") ||
			header.includes("депозит")
		) {
			group.deposit = index;
		} else if (header.includes("currency") || header.includes("валют")) {
			group.currency = index;
		} else if (
			header.includes("content") ||
			header.includes("text") ||
			header.includes("bind") ||
			header.includes("текст")
		) {
			group.content = index;
		} else {
			group.name = index;
		}

		groups.set(number, group);
	});

	return Array.from(groups.values()).filter(
		(group) => group.name !== undefined || group.content !== undefined,
	);
}

function createProject(name: string, bonuses: DepositBonus[]) {
	return {
		id: createId("bonus-project"),
		name,
		slug: slugify(name),
		bonuses,
		updatedAt: new Date().toISOString(),
	};
}

class DepositBonusImportService {
	async preview(url: string): Promise<DepositBonusImportPreview> {
		const sourceUrl = url.trim();

		if (!sourceUrl) {
			throw new Error("Google Sheets URL is required");
		}

		const csvUrl = toGoogleExportUrl(sourceUrl);
		const response = await fetch(csvUrl);

		if (!response.ok) {
			throw new Error("Unable to load Google Sheet");
		}

		const text = await response.text();
		const rows = parseDelimited(text);
		const [headerRow, ...bodyRows] = rows;
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!headerRow) {
			return {
				sourceUrl,
				csvUrl,
				projects: [],
				errors: ["Sheet is empty"],
				warnings,
			};
		}

		const headers = headerRow.map(normalizeHeader);
		const projectColumn = findColumn(headers, [
			"project",
			"brand",
			"casino",
			"проект",
			"бренд",
			"казино",
		]);
		const rowBonusColumn = findColumn(headers, [
			"bonus",
			"бонус",
			"offer",
			"оффер",
			"package",
			"пакет",
		]);
		const rowContentColumn = findColumn(headers, [
			"content",
			"text",
			"bind",
			"описание",
			"текст",
		]);
		const rowDepositColumn = findColumn(headers, [
			"min deposit",
			"minimum deposit",
			"deposit",
			"депозит",
			"мин депозит",
		]);
		const rowCurrencyColumn = findColumn(headers, ["currency", "валюта"]);
		const wideGroups = collectWideBonusGroups(headers);
		const projectsBySlug = new Map<string, BonusProject>();

		if (projectColumn < 0) {
			errors.push("Project column was not found");
		}

		for (const [rowIndex, row] of bodyRows.entries()) {
			const projectName = getRowValue(row, projectColumn);

			if (!projectName) continue;

			const bonuses = this.parseBonusesFromRow({
				row,
				headers,
				rowBonusColumn,
				rowContentColumn,
				rowDepositColumn,
				rowCurrencyColumn,
				wideGroups,
			});

			if (bonuses.length === 0) {
				warnings.push(`Row ${rowIndex + 2}: no bonuses found`);
				continue;
			}

			const slug = slugify(projectName);
			const existing = projectsBySlug.get(slug);

			if (existing) {
				existing.bonuses.push(
					...bonuses.map((bonus, index) => ({
						...bonus,
						order: existing.bonuses.length + index + 1,
					})),
				);
				existing.updatedAt = new Date().toISOString();
				continue;
			}

			projectsBySlug.set(slug, createProject(projectName, bonuses));
		}

		const projects = await Promise.all(
			Array.from(projectsBySlug.values()).map(async (project) => ({
				...project,
				sourceHash: await hashText(JSON.stringify(project)),
			})),
		);

		if (projects.length === 0 && errors.length === 0) {
			errors.push("No importable bonus projects found");
		}

		return {
			sourceUrl,
			csvUrl,
			projects,
			errors,
			warnings,
		};
	}

	private parseBonusesFromRow({
		row,
		headers,
		rowBonusColumn,
		rowContentColumn,
		rowDepositColumn,
		rowCurrencyColumn,
		wideGroups,
	}: {
		row: string[];
		headers: string[];
		rowBonusColumn: number;
		rowContentColumn: number;
		rowDepositColumn: number;
		rowCurrencyColumn: number;
		wideGroups: ReturnType<typeof collectWideBonusGroups>;
	}) {
		if (wideGroups.length > 0) {
			return wideGroups
				.map((group, index) => {
					const name = getRowValue(row, group.name ?? -1);
					const content = getRowValue(row, group.content ?? group.name ?? -1);
					const depositText = getRowValue(row, group.deposit ?? -1);
					const parsedMoney = parseMoney(`${depositText} ${content}`);
					const currency =
						getRowValue(row, group.currency ?? -1).toUpperCase() ||
						parsedMoney.currency;

					if (!name && !content) return undefined;

					return this.createBonus({
						name: name || `Bonus ${index + 1}`,
						content: content || name,
						order: index + 1,
						amount: parsedMoney.amount,
						currency,
					});
				})
				.filter((bonus): bonus is DepositBonus => Boolean(bonus));
		}

		const rowBonus = getRowValue(row, rowBonusColumn);

		if (rowBonus) {
			const content = getRowValue(row, rowContentColumn) || rowBonus;
			const depositText = getRowValue(row, rowDepositColumn);
			const parsedMoney = parseMoney(`${depositText} ${content}`);
			const currency =
				getRowValue(row, rowCurrencyColumn).toUpperCase() ||
				parsedMoney.currency;

			return [
				this.createBonus({
					name: rowBonus,
					content,
					order: 1,
					amount: parsedMoney.amount,
					currency,
				}),
			];
		}

		return row
			.map((cell, index) => {
				const content = cleanCell(cell);
				const header = headers[index];

				if (!content || !header || header.includes("project")) return undefined;
				if (header.includes("currency") || header.includes("валют")) {
					return undefined;
				}
				if (
					header.includes("deposit") ||
					header.includes("депозит") ||
					header.includes("minimum") ||
					header.includes("min")
				) {
					return undefined;
				}

				const parsedMoney = parseMoney(content);

				return this.createBonus({
					name: header || `Bonus ${index + 1}`,
					content,
					order: index + 1,
					amount: parsedMoney.amount,
					currency: parsedMoney.currency,
				});
			})
			.filter((bonus): bonus is DepositBonus => Boolean(bonus));
	}

	private createBonus({
		name,
		content,
		order,
		amount,
		currency,
	}: {
		name: string;
		content: string;
		order: number;
		amount?: number;
		currency?: string;
	}): DepositBonus {
		return {
			id: createId("deposit-bonus"),
			name,
			content,
			order,
			minDepositAmount: amount,
			minDepositCurrency: currency || "USD",
		};
	}
}

export const depositBonusImportService = new DepositBonusImportService();
