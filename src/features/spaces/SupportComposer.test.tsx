// @vitest-environment jsdom
import {
	cleanup,
	render,
	screen,
	fireEvent,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";
import { useKnowledgeStore } from "@/store";
const mocks = vi.hoisted(() => ({
	location: { pathname: "/", hash: "" },
	navigate: vi.fn(),
	generate: vi.fn(),
	translate: vi.fn(),
	check: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouterState: ({ select }: any) => select({ location: mocks.location }),
}));
vi.mock("@/features/ai/AnswerAssistantPage", () => ({
	AnswerAssistantPage: () => null,
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/services/answer-assistant.service", () => ({
	answerAssistantService: {
		load: () => ({ settings: { aiEnabled: true }, glossary: [], memory: [] }),
		generateReadyAnswer: mocks.generate,
		checkAnswer: mocks.check,
	},
}));
vi.mock("@/services/translator.service", () => ({
	translatorService: { translate: mocks.translate },
}));
import { SupportComposer } from "./SupportComposer";
beforeEach(() => {
	mocks.location = { pathname: "/", hash: "" };
	useAuthStore.setState({
		session: {
			user: {
				id: "u",
				access: { status: "active", permissions: ["tools", "binds.read"] },
			},
		} as any,
	});
	useKnowledgeStore.setState({ binds: [], remoteBinds: [] });
	mocks.generate.mockResolvedValue({ answer: "Готовый ответ", issues: [] });
	mocks.translate.mockResolvedValue({ text: "Translation" });
	mocks.check.mockReturnValue([]);
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
it("keeps the draft when leaving for Email and returning", () => {
	const view = render(<SupportComposer />);
	fireEvent.click(screen.getByRole("button", { name: "Support Composer" }));
	fireEvent.change(screen.getByLabelText("Сообщение клиента"), {
		target: { value: "Вопрос клиента" },
	});
	mocks.location.pathname = "/project-emails";
	view.rerender(<SupportComposer />);
	expect(screen.queryByLabelText("Сообщение клиента")).toBeNull();
	mocks.location.pathname = "/";
	view.rerender(<SupportComposer />);
	expect(
		(screen.getByLabelText("Сообщение клиента") as HTMLTextAreaElement).value,
	).toBe("Вопрос клиента");
});
it("uses existing generation and translation services", async () => {
	render(<SupportComposer />);
	fireEvent.click(screen.getByRole("button", { name: "Support Composer" }));
	fireEvent.change(screen.getByLabelText("Сообщение клиента"), {
		target: { value: "Помогите" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
	await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
	await screen.findByDisplayValue("Готовый ответ");
	fireEvent.click(screen.getByRole("button", { name: "Перевод" }));
	fireEvent.click(screen.getByRole("button", { name: "Перевести" }));
	await waitFor(() =>
		expect(mocks.translate).toHaveBeenCalledWith({
			text: "Помогите",
			fromLanguage: "auto",
			toLanguage: "en",
		}),
	);
});
it("opens a translation deep link and hides tools without permission", () => {
	mocks.location.hash = "composer-translate";
	const view = render(<SupportComposer />);
	expect(screen.getByRole("button", { name: "Перевести" })).toBeTruthy();
	useAuthStore.setState({
		session: {
			user: { access: { status: "active", permissions: ["binds.read"] } },
		} as any,
	});
	view.rerender(<SupportComposer />);
	expect(screen.queryByRole("button", { name: "Перевести" })).toBeNull();
});
