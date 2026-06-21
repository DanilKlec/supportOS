import { describe, expect, it, vi } from "vitest";

import { fetchGoogleSheetText } from "@/services/google-sheet-fetch.service";

import { __depositBonusImportInternals } from "./deposit-bonus-import.service";

vi.mock("@/services/google-sheet-fetch.service", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/services/google-sheet-fetch.service")
		>();

	return {
		...actual,
		fetchGoogleSheetText: vi.fn(),
	};
});

const mockedFetchGoogleSheetText = vi.mocked(fetchGoogleSheetText);

describe("deposit bonus Google Sheets import", () => {
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
		`);

		expect(tabs).toEqual([
			{ gid: "11", title: "First & Main" },
			{ gid: "22", title: "Second Project" },
		]);
	});
});
