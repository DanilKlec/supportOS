import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	events: [] as string[],
	state: { session: undefined as
		| undefined
		| { user: { id: string; access: { status: string; permissions: string[] } } } },
}));

vi.mock("@/store/auth.store", () => ({
	useAuthStore: { getState: () => mocks.state },
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: {
		initialize: vi.fn(async () => {
			mocks.events.push("auth");
			mocks.state.session = {
				user: {
					id: "11111111-1111-4111-8111-111111111111",
					access: { status: "active", permissions: ["binds.read"] },
				},
			};
			return mocks.state.session;
		}),
	},
}));
vi.mock("@/services/knowledge.service", () => ({
	knowledgeService: {
		loadKnowledge: vi.fn(async () => {
			mocks.events.push("knowledge");
		}),
	},
}));
vi.mock("@/services/default-local-data.service", () => ({
	defaultLocalDataService: {
		apply: vi.fn(() => mocks.events.push("other-runtime-data")),
	},
}));

import { bootstrapApp } from "./bootstrap";

it("initializes auth and access before loading database knowledge", async () => {
	await bootstrapApp();

	expect(mocks.events).toEqual([
		"auth",
		"knowledge",
		"other-runtime-data",
	]);
});

