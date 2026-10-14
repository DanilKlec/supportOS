// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ glossary: vi.fn(), fetch: vi.fn() }));
vi.mock("@/services/team-glossary.service", () => ({
	getTeamGlossary: mock.glossary,
}));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.fetch,
}));
vi.mock("@/services/translator.service", () => ({
	translatorService: { detectLanguage: () => "en" },
}));

import { answerAssistantService } from "./answer-assistant.service";

beforeEach(() => {
	localStorage.clear();
	vi.resetAllMocks();
});

it("keeps legacy terms available for explicit import but never loads them as team knowledge", () => {
	const legacy = {
		settings: { aiEnabled: false },
		glossary: [{ id: "old", source: "KYC", target: "Wrong", language: "en" }],
		memory: [{ id: "private", source: "customer", target: "unreviewed" }],
	};
	localStorage.setItem("supportos:answer-assistant:v1", JSON.stringify(legacy));
	const data = answerAssistantService.load();
	expect(data.glossary).toEqual([]);
	expect(data.memory).toEqual([]);
	expect(answerAssistantService.readLegacyGlossary()).toEqual(legacy.glossary);
	answerAssistantService.save({
		...data,
		settings: { ...data.settings, tone: "formal" },
	});
	const stored = JSON.parse(
		localStorage.getItem("supportos:answer-assistant:v1") ?? "{}",
	);
	expect(stored.glossary).toEqual(legacy.glossary);
	expect(stored.memory).toEqual(legacy.memory);
});

it("uses fetched team terms even when a request contains a local glossary", async () => {
	mock.glossary.mockResolvedValue([
		{ id: "db", source: "KYC", target: "Verification", language: "en" },
	]);
	const settings = {
		...answerAssistantService.load().settings,
		aiEnabled: false,
		language: "en",
	};
	const result = await answerAssistantService.generateReadyAnswer({
		customerMessage: "KYC",
		context: "KYC",
		settings,
		glossary: [{ id: "local", source: "KYC", target: "Wrong", language: "en" }],
		memory: [],
	});
	expect(mock.glossary).toHaveBeenCalled();
	expect(result.answer).toContain("Verification");
	expect(result.answer).not.toContain("Wrong");
});

it("reports only check-mode risk categories without changing the answer", () => {
	const answer = "{{name}}, гарантируем возврат до 24 часов.";
	const issues = answerAssistantService.checkAnswer({
		answer,
		customerMessage: "Где KYC?",
		glossary: [
			{ id: "term", source: "KYC", target: "верификация", language: "ru" },
		],
		language: "ru",
	});
	expect(
		issues
			.filter((issue) => issue.severity === "error")
			.map((issue) => issue.id),
	).toEqual(["placeholders"]);
	expect(
		issues
			.filter((issue) => issue.severity === "warning")
			.map((issue) => issue.id),
	).toEqual(expect.arrayContaining(["promise", "exact-timing", "glossary"]));
	expect(answer).toBe("{{name}}, гарантируем возврат до 24 часов.");
});

it("marks clean answers as good and catches empty or too-short answers", () => {
	expect(
		answerAssistantService.checkAnswer({
			answer: "",
			customerMessage: "",
			glossary: [],
			language: "ru",
		})[0],
	).toMatchObject({ id: "empty", severity: "error" });
	expect(
		answerAssistantService
			.checkAnswer({
				answer: "Да.",
				customerMessage: "",
				glossary: [],
				language: "ru",
			})
			.map((issue) => issue.id),
	).toContain("too-short");
	expect(
		answerAssistantService.checkAnswer({
			answer:
				"Здравствуйте! Мы проверим статус обращения и вернёмся с уточнением.",
			customerMessage: "",
			glossary: [],
			language: "ru",
		}),
	).toEqual([expect.objectContaining({ id: "ok", severity: "ok" })]);
});

it("does not let the legacy glossary affect the older generateAnswer API", async () => {
	mock.glossary.mockResolvedValue([
		{ id: "db", source: "KYC", target: "Verification", language: "en" },
	]);
	const answer = await answerAssistantService.generateAnswer({
		customerMessage: "KYC",
		context: "KYC",
		settings: {
			...answerAssistantService.load().settings,
			aiEnabled: false,
			language: "en",
		},
		glossary: [{ id: "local", source: "KYC", target: "Wrong", language: "en" }],
		memory: [],
	});
	expect(answer).toContain("Verification");
	expect(answer).not.toContain("Wrong");
});

function request() {
	return {
		customerMessage: "Подскажите по депозиту",
		context: "Платёж обрабатывается до 24 часов",
		settings: {
			...answerAssistantService.load().settings,
			aiEnabled: true,
			language: "ru",
		},
		glossary: [],
		memory: [],
	};
}

it("uses the provider answer when the provider is online", async () => {
	mock.glossary.mockResolvedValue([]);
	mock.fetch.mockResolvedValue(
		new Response(
			JSON.stringify({ text: "AI готовит ответ", provider: "openai" }),
			{ status: 200 },
		),
	);
	const result = await answerAssistantService.generateReadyAnswer(request());
	expect(result.mode).toBe("openai");
	expect(result.answer).toBe("AI готовит ответ");
});

it("keeps source guard filtering, safe metadata and deduplication unchanged", async () => {
	mock.glossary.mockResolvedValue([]);
	mock.fetch.mockResolvedValue(
		Response.json({
			text: "Ответ по материалу",
			provider: "openai",
			sources: [
				null,
				"not metadata",
				{ id: 42, title: "Invalid", type: "material" },
				{ id: "draft", title: "Unsupported", type: "draft" },
				{
					id: "rule",
					title: "Правило",
					type: "rule",
					project: "project",
					version: "v1",
					ref: "published",
					internalPrompt: "hidden",
				},
				{ id: "rule", title: "Duplicate", type: "rule" },
			],
		}),
	);
	const result = await answerAssistantService.generateReadyAnswer(request());
	expect(result.sources).toEqual([
		{
			id: "rule",
			title: "Правило",
			type: "rule",
			project: "project",
			version: "v1",
			ref: "published",
		},
	]);
	expect(result.answer).toBe("Ответ по материалу");
});

it.each([
	[503, "AI provider is not configured"],
	[502, "Provider unavailable"],
	[500, "Upstream error"],
])("uses a free fallback when the provider is unavailable (%i)", async (status, error) => {
	mock.glossary.mockResolvedValue([]);
	mock.fetch.mockResolvedValue(
		new Response(JSON.stringify({ error }), { status }),
	);

	const result = await answerAssistantService.generateReadyAnswer(request());

	expect(result.mode).toBe("free");
	expect(result.warning).toContain("AI недоступен");
	expect(result.answer).toContain("Платёж обрабатывается до 24 часов");
});

it("uses rule-based answer when the provider request cannot be reached", async () => {
	mock.glossary.mockResolvedValue([]);
	mock.fetch.mockRejectedValue(new TypeError("Network error"));

	const result = await answerAssistantService.generateReadyAnswer(request());

	expect(result.mode).toBe("free");
	expect(result.warning).toContain("AI недоступен");
});

it.each([
	401, 403,
])("does not hide SupportOS access error %i", async (status) => {
	mock.glossary.mockResolvedValue([]);
	mock.fetch.mockResolvedValue(
		new Response(JSON.stringify({ error: "Нет доступа" }), { status }),
	);

	await expect(
		answerAssistantService.generateReadyAnswer(request()),
	).rejects.toThrow("Нет доступа");
});
