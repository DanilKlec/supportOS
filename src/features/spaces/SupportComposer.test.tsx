// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bind } from "@/entities/bind";
import { clearSessionViews } from "@/shared/hooks/useViewState";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";

const mocks = vi.hoisted(() => ({
	location: { pathname: "/", hash: "" },
	navigate: vi.fn(),
	generate: vi.fn(),
	translate: vi.fn(),
	check: vi.fn(),
	save: vi.fn(),
	status: vi.fn(),
	projects: [] as Array<{ id: string; name: string; slug: string }>,
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouterState: ({ select }: any) => select({ location: mocks.location }),
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/services/answer-assistant.service", () => ({
	answerAssistantService: {
		load: () => ({ settings: { aiEnabled: true }, glossary: [], memory: [] }),
		save: mocks.save,
		generateReadyAnswer: mocks.generate,
		checkAnswer: mocks.check,
	},
}));
vi.mock("@/services/translator.service", () => ({
	translatorService: { translate: mocks.translate },
}));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mocks.status,
}));
vi.mock("@/services/project-catalog.service", () => ({
	useProjectCatalog: () => ({ data: mocks.projects }),
}));
vi.mock("@/services/team-glossary.service", () => ({
	getTeamGlossary: vi.fn(async () => []),
}));

import { ComposerLauncher } from "./ComposerLauncher";
import { SupportComposer } from "./SupportComposer";

function composer() {
	return (
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<ComposerLauncher />
			<SupportComposer />
		</QueryClientProvider>
	);
}

const sourceBind: Bind = {
	id: "deposit-delay",
	slug: "deposit-delay",
	categoryId: "payments",
	tags: ["deposit"],
	translations: [
		{
			language: "ru",
			title: "Срок зачисления депозита",
			content: "Депозит может обрабатываться до 24 часов.",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	],
	favorite: false,
	archived: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
	clearSessionViews();
	sessionStorage.clear();
	localStorage.clear();
	mocks.location = { pathname: "/", hash: "" };
	mocks.projects = [];
	useBonusStore.setState({ activeProjectId: undefined });
	useAuthStore.setState({
		session: {
			user: {
				id: "u",
				access: {
					status: "active",
					permissions: [
						"tools",
						"composer.use",
						"translator.use",
						"binds.read",
					],
				},
			},
		} as any,
	});
	useKnowledgeStore.setState({
		binds: [],
		remoteBinds: [],
		activeTab: undefined,
	});
	mocks.generate.mockResolvedValue({ answer: "Готовый ответ", issues: [] });
	mocks.translate.mockResolvedValue({ text: "Translation" });
	mocks.check.mockReturnValue([]);
	mocks.status.mockResolvedValue(
		new Response(JSON.stringify({ configured: true, provider: "openai" })),
	);
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
it("keeps the draft when leaving for Email and returning", () => {
	const view = render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	fireEvent.change(screen.getByLabelText("Сообщение клиента"), {
		target: { value: "Вопрос клиента" },
	});
	mocks.location.pathname = "/project-emails";
	view.rerender(composer());
	expect(screen.queryByLabelText("Сообщение клиента")).toBeNull();
	mocks.location.pathname = "/";
	view.rerender(composer());
	expect(
		(screen.getByLabelText("Сообщение клиента") as HTMLTextAreaElement).value,
	).toBe("Вопрос клиента");
});
it("shows the local how-it-works popover without leaving the Composer", () => {
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	fireEvent.click(screen.getByRole("button", { name: "Как это работает" }));
	expect(
		screen.getByRole("dialog", { name: "Как работает Помощник" }).textContent,
	).toContain("Помощник применит подтверждённые правила и источники.");
	expect(mocks.navigate).not.toHaveBeenCalled();
});
it("uses existing generation and translation services", async () => {
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	fireEvent.change(screen.getByLabelText("Сообщение клиента"), {
		target: { value: "Помогите" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
	await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
	await screen.findByDisplayValue("Готовый ответ");
	fireEvent.click(screen.getByRole("button", { name: "Перевод" }));
	fireEvent.change(screen.getByLabelText("Язык ответа"), {
		target: { value: "en" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
	await waitFor(() =>
		expect(mocks.translate).toHaveBeenCalledWith({
			text: "Помогите",
			fromLanguage: "auto",
			toLanguage: "en",
		}),
	);
});
it("sends the selected canonical catalog ID to AI generation", async () => {
	mocks.projects = [{ id: "project-a", name: "Project A", slug: "project-a" }];
	useBonusStore.setState({ activeProjectId: "project-a" });
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	fireEvent.click(screen.getByRole("button", { name: "Ответ" }));
	fireEvent.change(screen.getByLabelText("Сообщение клиента"), {
		target: { value: "Вопрос" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
	await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
	expect(mocks.generate.mock.calls[0][0].project).toBe("project-a");
});
it("shows only safe answer-source metadata after generation", async () => {
	mocks.generate.mockResolvedValue({
		answer: "Готовый ответ",
		issues: [],
		sources: [
			{
				id: "rule-deposits",
				title: "Правила по депозитам",
				type: "rule",
				project: "Acme",
				version: "published-42",
				content: "Скрытый текст правила",
				agentInstructions: "Не показывать сотруднику",
			},
		],
	});
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	fireEvent.click(screen.getByRole("button", { name: "Ответ" }));
	fireEvent.change(screen.getByLabelText("Сообщение клиента"), {
		target: { value: "Вопрос" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));

	expect(
		await screen.findByRole("region", { name: "Источники ответа" }),
	).toBeTruthy();
	expect(screen.getByText("Правила по депозитам")).toBeTruthy();
	expect(
		screen.getByText(/Правило · Acme · Версия публикации: published-42/),
	).toBeTruthy();
	expect(screen.queryByText("Скрытый текст правила")).toBeNull();
	expect(screen.queryByText("Не показывать сотруднику")).toBeNull();
});
it("includes a selected source in context and excludes an unselected suggestion", async () => {
	useKnowledgeStore.setState({
		binds: [sourceBind],
		categories: [{ id: "payments", name: "Платежи", order: 0 }],
		activeTab: sourceBind.id,
	});
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	fireEvent.click(screen.getByRole("button", { name: "Ответ" }));
	fireEvent.change(screen.getByLabelText("Сообщение клиента"), {
		target: { value: "Депозит" },
	});

	// Открытый материал и рекомендация не становятся контекстом, пока их не выберут.
	fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
	await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
	expect(mocks.generate.mock.calls[0][0].context).not.toContain(
		"Депозит может обрабатываться до 24 часов.",
	);

	fireEvent.click(screen.getByRole("button", { name: "Источники" }));
	expect(screen.getByText("Срок зачисления депозита")).toBeTruthy();
	expect(screen.getByText("Платежи")).toBeTruthy();
	expect(
		screen.getByRole("button", { name: "Использовать открытый материал" }),
	).toBeTruthy();
	fireEvent.click(
		screen.getByRole("button", { name: "Использовать открытый материал" }),
	);
	expect(screen.getByText("Выбранные материалы (1/5)")).toBeTruthy();
	expect(
		screen.getAllByText("Срок зачисления депозита").length,
	).toBeGreaterThan(0);

	fireEvent.click(screen.getByRole("button", { name: "Ответ" }));
	fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
	await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
	expect(mocks.generate.mock.calls[1][0].context).toContain(
		"Депозит может обрабатываться до 24 часов.",
	);
});
it("removes and clears selected materials", () => {
	useKnowledgeStore.setState({ binds: [sourceBind], activeTab: sourceBind.id });
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	fireEvent.click(screen.getByRole("button", { name: "Источники" }));
	fireEvent.click(
		screen.getByRole("button", { name: "Использовать открытый материал" }),
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Убрать Срок зачисления депозита" }),
	);
	expect(screen.getByText("Выбранные материалы (0/5)")).toBeTruthy();

	fireEvent.click(
		screen.getByRole("button", { name: "Использовать открытый материал" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Очистить" }));
	expect(screen.getByText("Выбранные материалы (0/5)")).toBeTruthy();
});
it.each([
	[{ configured: true, provider: "openai" }, "AI · OpenAI"],
	[{ configured: true, provider: "gemini" }, "AI · Gemini"],
	[{ configured: false }, "Локальный режим"],
])("shows %s next to the composer heading", async (status, label) => {
	mocks.status.mockResolvedValue(new Response(JSON.stringify(status)));
	render(composer());
	expect(mocks.status).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
	expect(mocks.status).toHaveBeenCalledTimes(1);
});
it("shows AI unavailable when the status request fails", async () => {
	mocks.status.mockRejectedValue(new Error("offline"));
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));
	expect((await screen.findAllByText("AI недоступен")).length).toBeGreaterThan(
		0,
	);
});
it("keeps assistant settings inside the compact composer panel", () => {
	render(composer());
	fireEvent.click(screen.getByRole("button", { name: "Помощник ответа" }));

	expect(screen.getByLabelText("Язык ответа")).toBeTruthy();
	expect(screen.getByLabelText("Тон")).toBeTruthy();
	expect(screen.getByLabelText("Тема обращения")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "AI включён" }));
	expect(mocks.save).toHaveBeenCalledWith(
		expect.objectContaining({
			settings: expect.objectContaining({ aiEnabled: false }),
		}),
	);
});
it("opens a translation deep link and hides tools without permission", () => {
	mocks.location.hash = "composer-translate";
	const view = render(composer());
	expect(screen.getByRole("button", { name: "Перевести" })).toBeTruthy();
	useAuthStore.setState({
		session: {
			user: { access: { status: "active", permissions: ["binds.read"] } },
		} as any,
	});
	view.rerender(composer());
	expect(screen.queryByRole("button", { name: "Перевести" })).toBeNull();
});
