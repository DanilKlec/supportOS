// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/services/sports-betting.service", () => ({
	sportsBettingService: {
		loadLiveFeed: async () => ({
			provider: "Test provider",
			loadedAt: "2026-10-08T00:00:00Z",
			pollMs: 7200000,
			config: {
				sports: [],
				regions: "eu",
				markets: "h2h,totals",
				oddsFormat: "decimal",
				includeLay: false,
			},
			warnings: [],
			events: [
				{
					id: "match",
					sportKey: "football",
					sportTitle: "Football",
					matchup: "Alpha — Beta",
					status: "Upcoming",
					commenceTime: "2026-10-09T00:00:00Z",
					bookmakerCount: 1,
					marketCount: 1,
					markets: [{ key: "h2h", label: "Winner", outcomes: [] }],
					bestOdds: [],
				},
			],
		}),
	},
}));

import { SportsBettingPage } from "./SportsBettingPage";

afterEach(cleanup);

it("restores the full event list when switching back to all markets", async () => {
	render(<SportsBettingPage />);
	const all = await screen.findByRole("option", { name: "Все рынки" });
	const select = all.parentElement as HTMLSelectElement;
	expect((all as HTMLOptionElement).value).toBe("All");
	fireEvent.change(select, { target: { value: "h2h" } });
	expect(select.value).toBe("h2h");
	fireEvent.change(select, { target: { value: "All" } });
	expect(select.value).toBe("All");
	expect(screen.getAllByText("Alpha — Beta").length).toBeGreaterThan(0);
});
