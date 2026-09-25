// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { useKnowledgeStore } from "@/store";

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
	session: {
		user: {
			id: "11111111-1111-4111-8111-111111111111",
			access: { status: "active", permissions: ["binds.read"] },
		},
	},
}));

vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mocks.fetch,
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { getSession: () => mocks.session },
}));

import { knowledgeService } from "./knowledge.service";

beforeEach(() => {
	mocks.fetch.mockReset();
	useKnowledgeStore.setState({
		categories: [],
		folders: [],
		binds: [],
		tree: [],
		expandedFolders: [],
		favorites: [],
		recent: [],
		favoriteFolders: [],
		recentFolders: [],
		openedTabs: [],
		pinnedTabs: [],
		selectedCategory: undefined,
		selectedFolder: undefined,
		selectedBind: undefined,
		activeTab: undefined,
	});
});

it("hydrates Zustand only from the authenticated server snapshot", async () => {
	mocks.fetch.mockResolvedValue(
		new Response(
			JSON.stringify({
				categories: [
					{ id: "database", name: "Из базы", ownerId: null, order: 1 },
				],
				folders: [],
				binds: [],
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		),
	);

	const database = await knowledgeService.loadKnowledge();

	expect(mocks.fetch).toHaveBeenCalledWith(
		"/api/binds?action=knowledge",
		undefined,
	);
	expect(database.categories.map((category) => category.id)).toEqual([
		"database",
	]);
	expect(useKnowledgeStore.getState().categories).toEqual(database.categories);
});

