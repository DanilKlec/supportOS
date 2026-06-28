import type { BindTranslation } from "@/entities/bind";
import {
	fetchGoogleSheetText,
	looksLikeGoogleSheetHtml,
	toGoogleSheetExportUrl,
} from "@/services/google-sheet-fetch.service";
import { knowledgeService } from "@/services/knowledge.service";
import { useKnowledgeStore } from "@/store";

export type SheetImportMode = "upsert" | "replace";

export interface SheetPreviewRow {
	rowNumber: number;
	title: string;
	slug: string;
	hash: string;
	translations: BindTranslation[];
	errors: string[];
}

export interface SheetPreview {
	sourceUrl: string;
	csvUrl: string;
	importBatchId: string;
	rows: SheetPreviewRow[];
	errors: string[];
}

const LANGUAGE_COLUMNS = [
	{ language: "ru", index: 1 },
	{ language: "en", index: 2 },
	{ language: "de", index: 3 },
	{ language: "pt", index: 4 },
	{ language: "el", index: 5 },
];

function now() {
	return new Date().toISOString();
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

	return slug || "imported-bind";
}

function normalizeTitle(value: string) {
	return value.trim().toLowerCase();
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

class GoogleSheetsService {
	async preview(url: string): Promise<SheetPreview> {
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
		const previewRows: SheetPreviewRow[] = [];
		const errors: string[] = [];
		const importBatchId = `sheet-${(await hashText(sourceUrl)).slice(0, 16)}`;

		for (const [index, row] of rows.entries()) {
			const title = cleanCell(row[0]);
			const translations = LANGUAGE_COLUMNS.map(({ language, index: col }) => ({
				language,
				title,
				content: cleanCell(row[col]),
				updatedAt: now(),
			})).filter((translation) => translation.content);

			if (!title && translations.length === 0) continue;

			const rowErrors: string[] = [];

			if (!title) {
				rowErrors.push("Title is missing");
			}

			if (translations.length === 0) {
				rowErrors.push("No translation content");
			}

			const hash = await hashText(
				JSON.stringify({
					title,
					translations: translations.map(({ language, content }) => ({
						language,
						content,
					})),
				}),
			);

			previewRows.push({
				rowNumber: index + 1,
				title: title || `Row ${index + 1}`,
				slug: `${slugify(title || `row-${index + 1}`)}-${hash.slice(0, 8)}`,
				hash,
				translations,
				errors: rowErrors,
			});
		}

		if (previewRows.length === 0) {
			errors.push("No importable rows found");
		}

		return {
			sourceUrl,
			csvUrl,
			importBatchId,
			rows: previewRows,
			errors,
		};
	}

	commit({
		preview,
		categoryId,
		folderId,
		mode,
	}: {
		preview: SheetPreview;
		categoryId: string;
		folderId?: string | null;
		mode: SheetImportMode;
	}) {
		if (!categoryId) {
			throw new Error("Category is required");
		}

		const store = useKnowledgeStore.getState();
		const validRows = preview.rows.filter((row) => row.errors.length === 0);
		const hashes = new Set(validRows.map((row) => row.hash));

		for (const row of validRows) {
			const existing = store.binds.find(
				(bind) =>
					bind.importBatchId === preview.importBatchId &&
					(bind.sourceHash === row.hash ||
						bind.translations.some(
							(translation) =>
								normalizeTitle(translation.title) === normalizeTitle(row.title),
						)),
			);

			if (existing) {
				knowledgeService.updateBind(existing.id, {
					categoryId,
					folderId,
					slug: row.slug,
					sourceHash: row.hash,
					importBatchId: preview.importBatchId,
					imported: true,
					translations: row.translations,
				});
				continue;
			}

			knowledgeService.createBind({
				categoryId,
				folderId: folderId || undefined,
				slug: row.slug,
				title: row.title,
				sourceHash: row.hash,
				importBatchId: preview.importBatchId,
				imported: true,
				translations: row.translations,
			});
		}

		if (mode === "replace") {
			for (const bind of useKnowledgeStore.getState().binds) {
				if (
					bind.importBatchId === preview.importBatchId &&
					bind.sourceHash &&
					!hashes.has(bind.sourceHash)
				) {
					knowledgeService.deleteBind(bind.id);
				}
			}
		}

		return validRows.length;
	}
}

export const googleSheetsService = new GoogleSheetsService();
