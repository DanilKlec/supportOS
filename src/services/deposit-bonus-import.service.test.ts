import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	fetchGoogleSheetArrayBuffer,
	fetchGoogleSheetText,
} from "@/services/google-sheet-fetch.service";

import {
	__depositBonusImportInternals,
	depositBonusImportService,
} from "./deposit-bonus-import.service";

vi.mock("@/services/google-sheet-fetch.service", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/services/google-sheet-fetch.service")
		>();

	return {
		...actual,
		fetchGoogleSheetArrayBuffer: vi.fn(),
		fetchGoogleSheetText: vi.fn(),
	};
});

const mockedFetchGoogleSheetArrayBuffer = vi.mocked(
	fetchGoogleSheetArrayBuffer,
);
const mockedFetchGoogleSheetText = vi.mocked(fetchGoogleSheetText);

function writeUint16(bytes: Uint8Array, offset: number, value: number) {
	new DataView(bytes.buffer).setUint16(offset, value, true);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
	new DataView(bytes.buffer).setUint32(offset, value, true);
}

function concatBytes(chunks: Uint8Array[]) {
	const output = new Uint8Array(
		chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
	);
	let offset = 0;

	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return output;
}

function createStoredZip(entries: Record<string, string>) {
	const encoder = new TextEncoder();
	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;

	for (const [name, text] of Object.entries(entries)) {
		const nameBytes = encoder.encode(name);
		const dataBytes = encoder.encode(text);
		const localHeader = new Uint8Array(30 + nameBytes.byteLength);

		writeUint32(localHeader, 0, 0x04034b50);
		writeUint16(localHeader, 4, 20);
		writeUint16(localHeader, 26, nameBytes.byteLength);
		writeUint32(localHeader, 18, dataBytes.byteLength);
		writeUint32(localHeader, 22, dataBytes.byteLength);
		localHeader.set(nameBytes, 30);

		const centralHeader = new Uint8Array(46 + nameBytes.byteLength);

		writeUint32(centralHeader, 0, 0x02014b50);
		writeUint16(centralHeader, 4, 20);
		writeUint16(centralHeader, 6, 20);
		writeUint16(centralHeader, 28, nameBytes.byteLength);
		writeUint32(centralHeader, 20, dataBytes.byteLength);
		writeUint32(centralHeader, 24, dataBytes.byteLength);
		writeUint32(centralHeader, 42, offset);
		centralHeader.set(nameBytes, 46);

		localParts.push(localHeader, dataBytes);
		centralParts.push(centralHeader);
		offset += localHeader.byteLength + dataBytes.byteLength;
	}

	const centralDirectory = concatBytes(centralParts);
	const endOfCentralDirectory = new Uint8Array(22);

	writeUint32(endOfCentralDirectory, 0, 0x06054b50);
	writeUint16(endOfCentralDirectory, 8, centralParts.length);
	writeUint16(endOfCentralDirectory, 10, centralParts.length);
	writeUint32(endOfCentralDirectory, 12, centralDirectory.byteLength);
	writeUint32(endOfCentralDirectory, 16, offset);

	const zip = concatBytes([
		...localParts,
		centralDirectory,
		endOfCentralDirectory,
	]);

	return zip.buffer.slice(
		zip.byteOffset,
		zip.byteOffset + zip.byteLength,
	) as ArrayBuffer;
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function inlineCell(reference: string, value: string) {
	return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function sheetXml(rows: string[][]) {
	return `<worksheet><sheetData>${rows
		.map(
			(row, rowIndex) =>
				`<row r="${rowIndex + 1}">${row
					.map((value, columnIndex) =>
						inlineCell(
							`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`,
							value,
						),
					)
					.join("")}</row>`,
		)
		.join("")}</sheetData></worksheet>`;
}

function createXlsxWorkbook() {
	return createStoredZip({
		"xl/workbook.xml": `
			<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
				<sheets>
					<sheet name="Project One" sheetId="1" r:id="rId1"/>
					<sheet name="Project Two" sheetId="2" r:id="rId2"/>
				</sheets>
			</workbook>
		`,
		"xl/_rels/workbook.xml.rels": `
			<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
				<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
				<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
			</Relationships>
		`,
		"xl/worksheets/sheet1.xml": sheetXml([
			["Bonus", "Min Deposit", "Content"],
			["Welcome", "10 USD", "Welcome text"],
		]),
		"xl/worksheets/sheet2.xml": sheetXml([
			["Bonus", "Min Deposit", "Content"],
			["Reload", "20 EUR", "Reload text"],
		]),
	});
}

describe("deposit bonus Google Sheets import", () => {
	beforeEach(() => {
		mockedFetchGoogleSheetArrayBuffer.mockReset();
		mockedFetchGoogleSheetText.mockReset();
	});

	it("imports every sheet by name when Google HTML exposes tab captions only", async () => {
		mockedFetchGoogleSheetText.mockImplementation(async (url) => {
			if (url.includes("/edit?usp=sharing")) {
				return {
					ok: true,
					status: 200,
					text: `
						<div class="docs-sheet-tab-caption">SA</div>
						<div class="docs-sheet-tab-caption">ST</div>
					`,
				};
			}

			if (url.includes("sheet=SA")) {
				return {
					ok: true,
					status: 200,
					text: "Bonus,Min Deposit,Content\nWelcome,10 USD,Welcome text",
				};
			}

			if (url.includes("sheet=ST")) {
				return {
					ok: true,
					status: 200,
					text: "Bonus,Min Deposit,Content\nReload,20 EUR,Reload text",
				};
			}

			return {
				ok: false,
				status: 404,
				text: "",
			};
		});

		const preview = await depositBonusImportService.preview(
			"https://docs.google.com/spreadsheets/d/spreadsheet-id/edit?usp=sharing",
		);

		expect(preview.projects.map((project) => project.name)).toEqual([
			"SA",
			"ST",
		]);
		expect(preview.projects[0]?.bonuses[0]?.content).toBe("Welcome text");
		expect(preview.projects[1]?.bonuses[0]?.minDepositCurrency).toBe("EUR");
		expect(mockedFetchGoogleSheetArrayBuffer).not.toHaveBeenCalled();
	});

	it("imports every XLSX worksheet as a project named after the sheet", async () => {
		mockedFetchGoogleSheetArrayBuffer.mockResolvedValue({
			ok: true,
			status: 200,
			bytes: createXlsxWorkbook(),
			contentType:
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		const preview = await depositBonusImportService.preview(
			"https://docs.google.com/spreadsheets/d/spreadsheet-id/edit?usp=sharing",
		);

		expect(preview.projects.map((project) => project.name)).toEqual([
			"Project One",
			"Project Two",
		]);
		expect(preview.projects.map((project) => project.bonuses.length)).toEqual([
			1, 1,
		]);
		expect(preview.projects[0]?.bonuses[0]?.content).toBe("Welcome text");
		expect(preview.projects[1]?.bonuses[0]?.minDepositCurrency).toBe("EUR");
		expect(mockedFetchGoogleSheetArrayBuffer).toHaveBeenCalledOnce();
	});

	it("discovers every tab when the source URL points to one gid", async () => {
		mockedFetchGoogleSheetText.mockResolvedValue({
			ok: true,
			status: 200,
			text: `
				<script>
					{"sheetId":129807408,"title":"Casino Alpha"},
					{"sheetId":987654321,"title":"Casino Beta"}
				</script>
			`,
		});

		const tabs = await __depositBonusImportInternals.discoverSheetTabs(
			"https://docs.google.com/spreadsheets/d/spreadsheet-id/edit?pli=1&gid=129807408#gid=129807408",
		);

		expect(tabs).toEqual([
			{ gid: "129807408", title: "Casino Alpha" },
			{ gid: "987654321", title: "Casino Beta" },
		]);
	});

	it("reads published tab names from sheet navigation links", () => {
		const tabs = __depositBonusImportInternals.parseTabsFromHtml(`
			<a href="https://docs.google.com/spreadsheets/d/e/pubhtml?gid=11&amp;single=true">First &amp; Main</a>
			<a href="#gid=22"><span>Second Project</span></a>
			<div class="goog-inline-block docs-sheet-tab-caption">Third Project</div>
		`);

		expect(tabs).toEqual([
			{ gid: "11", title: "First & Main" },
			{ gid: "22", title: "Second Project" },
			{ sheetName: "Third Project", title: "Third Project" },
		]);
	});
});
