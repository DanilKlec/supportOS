// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.fetch,
}));
vi.mock("@/services/answer-assistant.service", () => ({
	answerAssistantService: { checkAnswer: () => [] },
}));

import { AIControlCenter, type AISection } from "./AIControlCenter";
import { AIFeedback } from "./AIFeedback";

function Harness() {
	const [section, setSection] = useState<AISection>("knowledge");
	return <AIControlCenter section={section} onSection={setSection} />;
}
const mount = () =>
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<Harness />
		</QueryClientProvider>,
	);
function identity(permissions: string[]) {
	useAuthStore.setState({
		session: {
			accessToken: "token",
			user: {
				id: "u",
				email: "u@example.test",
				role: "admin",
				access: {
					status: "active",
					version: 1,
					display_name: "",
					roles: [],
					permissions,
				},
			},
		},
	});
}
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	mock.fetch.mockReset();
	useAuthStore.setState({ session: undefined });
});
it("does not fetch privileged knowledge for Support", () => {
	identity(["work", "tools"]);
	mount();
	expect(mock.fetch).not.toHaveBeenCalled();
});
it("previews a saved draft before enabling explicit publication", async () => {
	identity(["work", "tools", "ai.train", "ai.publish", "ai.playground"]);
	const entry = {
		id: "k",
		kind: "knowledge",
		title: "Finance policy",
		content: "Approved facts",
		project: "",
		language: "ru",
		intent: "general",
		category: "",
		priority: 50,
		enabled: true,
		status: "draft",
		required: [],
		forbidden: [],
		related: [],
		reference: "",
	};
	mock.fetch.mockImplementation(
		async (url, init) =>
			new Response(
				JSON.stringify(
					url === "/api/ai/generate"
						? {
								text: "Verified answer",
								provider: "openai",
								model: "test",
								metadata: {
									knowledgeIds: ["k"],
									appliedDraftIds: ["k"],
									version: 1,
									preview: true,
								},
							}
						: init?.method === "POST"
							? { ok: true }
							: {
									version: 1,
									content: "",
									document: { entries: [entry], feedback: [] },
								},
				),
			),
	);
	vi.spyOn(window, "confirm").mockReturnValue(true);
	mount();
	fireEvent.click(
		await screen.findByRole("button", { name: /Finance policy/ }),
	);
	expect(
		(screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Playground" }));
	fireEvent.change(screen.getByLabelText("Сообщение"), {
		target: { value: "Help with withdrawal" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Подготовить ответ" }));
	await screen.findByText("Verified answer");
	const call = mock.fetch.mock.calls.find(
		([url]) => url === "/api/ai/generate",
	);
	expect(JSON.parse(call?.[1].body)).toMatchObject({
		preview: true,
		draftIds: ["k"],
	});
	fireEvent.click(screen.getByRole("button", { name: /Вернуться/ }));
	fireEvent.click(screen.getByRole("button", { name: "Publish" }));
	await waitFor(() =>
		expect(
			mock.fetch.mock.calls.some(
				([, init]) => init?.body && JSON.parse(init.body).action === "publish",
			),
		).toBe(true),
	);
});
it("sends a selected feedback reason without customer text", async () => {
	mock.fetch.mockResolvedValue(new Response("{}"));
	render(<AIFeedback project="p" language="ru" />);
	fireEvent.click(
		screen.getByRole("button", { name: "Проблема с ответом AI" }),
	);
	fireEvent.change(screen.getByLabelText("Причина оценки AI"), {
		target: { value: "Не тот язык" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
	await screen.findByText("Спасибо, оценка отправлена.");
	expect(JSON.parse(mock.fetch.mock.calls[0][1].body)).toEqual({
		action: "feedback",
		rating: "negative",
		reason: "Не тот язык",
		project: "p",
		language: "ru",
	});
});
