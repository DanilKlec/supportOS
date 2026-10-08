import { expect, it, vi } from "vitest";

vi.mock("@/services/google-sheet-fetch.service", () => ({
	fetchGoogleSheetText: vi.fn(async () => ({
		ok: true,
		text: "Project,Support Email,KYC Email,Finance,Complaints\nAlpha,s@example.com,k@example.com,f@example.com,c@example.com",
	})),
	looksLikeGoogleSheetHtml: () => false,
	toGoogleSheetExportUrl: (url: string) => url,
}));

import { projectEmailImportService } from "./project-email-import.service";

it("imports custom address types in column order while adapting fixed legacy types", async () => {
	const preview = await projectEmailImportService.preview(
		"https://example.test/sheet",
	);
	const record = preview.records[0];
	expect(record.addresses.map(({ type, order }) => ({ type, order }))).toEqual([
		{ type: "Support", order: 0 },
		{ type: "KYC", order: 1 },
		{ type: "Finance", order: 2 },
		{ type: "Complaints", order: 3 },
	]);
	expect(record.supportEmail).toBe("s@example.com");
	expect(record.addresses[3].email).toBe("c@example.com");
});
