import type { ProjectEmailRecord } from "@/entities/project-email";
import {
	fetchGoogleSheetText,
	looksLikeGoogleSheetHtml,
	toGoogleSheetExportUrl,
} from "@/services/google-sheet-fetch.service";

export type ProjectEmailImportMode = "upsert" | "replace";

export interface ProjectEmailImportPreview {
	sourceUrl: string;
	csvUrl: string;
	records: ProjectEmailRecord[];
	errors: string[];
	warnings: string[];
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

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
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
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

function extractEmail(value: string) {
	return value.match(EMAIL_PATTERN)?.[0]?.toLowerCase() ?? "";
}

function hasAnyEmail(
	record: Pick<ProjectEmailRecord, "supportEmail" | "kycEmail" | "vipEmail">,
) {
	return Boolean(record.supportEmail || record.kycEmail || record.vipEmail);
}

class ProjectEmailImportService {
	async preview(url: string): Promise<ProjectEmailImportPreview> {
		const sourceUrl = url.trim();

		if (!sourceUrl) {
			throw new Error("Google Sheets URL is required");
		}

		const csvUrl = toGoogleSheetExportUrl(sourceUrl);
		const response = await fetchGoogleSheetText(csvUrl);

		if (!response.ok) {
			throw new Error(`Unable to load Google Sheet (${response.status})`);
		}

		if (looksLikeGoogleSheetHtml(response.text)) {
			throw new Error(
				"Google returned a web page instead of table data. Publish the sheet to the web or share it for anyone with the link.",
			);
		}

		const text = response.text;
		const rows = parseDelimited(text);
		const [headerRow, ...bodyRows] = rows;
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!headerRow) {
			return {
				sourceUrl,
				csvUrl,
				records: [],
				errors: ["Sheet is empty"],
				warnings,
			};
		}

		const headers = headerRow.map(normalizeHeader);
		const projectColumn = findColumn(headers, [
			"project",
			"brand",
			"casino",
			"site",
		]);
		const supportColumn = findColumn(headers, ["support", "help"]);
		const kycColumn = findColumn(headers, ["kyc", "verification", "verify"]);
		const vipColumn = findColumn(headers, ["vip", "manager"]);

		if (projectColumn < 0) {
			errors.push("Project column was not found");
		}

		for (const [name, index] of [
			["Support", supportColumn],
			["KYC", kycColumn],
			["VIP", vipColumn],
		] as const) {
			if (index < 0) {
				warnings.push(`${name} email column was not found`);
			}
		}

		const records: ProjectEmailRecord[] = [];

		for (const [rowIndex, row] of bodyRows.entries()) {
			const projectName = cleanCell(row[projectColumn]);

			if (!projectName) continue;

			const record: ProjectEmailRecord = {
				id: createId("project-email"),
				projectName,
				slug: slugify(projectName),
				supportEmail: extractEmail(cleanCell(row[supportColumn])),
				kycEmail: extractEmail(cleanCell(row[kycColumn])),
				vipEmail: extractEmail(cleanCell(row[vipColumn])),
				updatedAt: new Date().toISOString(),
			};

			if (!hasAnyEmail(record)) {
				warnings.push(`Row ${rowIndex + 2}: no emails found`);
				continue;
			}

			record.sourceHash = await hashText(JSON.stringify(record));
			records.push(record);
		}

		if (records.length === 0 && errors.length === 0) {
			errors.push("No importable project emails found");
		}

		return {
			sourceUrl,
			csvUrl,
			records,
			errors,
			warnings,
		};
	}
}

export const projectEmailImportService = new ProjectEmailImportService();
