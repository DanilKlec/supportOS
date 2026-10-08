// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	preview: vi.fn(),
	publish: vi.fn(),
}));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: { list: mocks.list },
}));
vi.mock("@/services/google-sheets.service", () => ({
	googleSheetsService: { preview: mocks.preview },
}));
vi.mock("@/services/shared-content.service", () => ({
	contentApi: mocks.publish,
}));

import { CommonBindImport } from "./CommonBindImport";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it("publishes only changed rows with the preview version and keeps unchanged rows out", async () => {
	const translation = {
		language: "ru",
		title: "Ответ",
		content: "Было",
		updatedAt: "old",
	};
	const existing = [
		{
			id: "a",
			slug: "a",
			tags: [],
			translations: [translation],
			updatedAt: "v1",
		},
		{
			id: "b",
			slug: "b",
			tags: [],
			translations: [translation],
			updatedAt: "v2",
		},
	];
	mocks.list.mockResolvedValue(existing);
	mocks.preview.mockResolvedValue({
		errors: [],
		rows: [
			{ ...existing[0], errors: [] },
			{
				...existing[1],
				errors: [],
				translations: [{ ...translation, content: "Стало" }],
			},
		],
	});
	mocks.publish.mockResolvedValue({});
	render(
		<QueryClientProvider client={new QueryClient()}>
			<CommonBindImport />
		</QueryClientProvider>,
	);
	fireEvent.click(screen.getByText("Загрузить базовые бинды для всей команды"));
	fireEvent.change(screen.getByLabelText("Ссылка Google Sheets"), {
		target: { value: "https://docs.google.com/spreadsheets/d/test" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Предпросмотр таблицы" }));
	fireEvent.click(
		await screen.findByRole("button", { name: "Опубликовать 1 изменений" }),
	);
	await waitFor(() => expect(mocks.publish).toHaveBeenCalled());
	expect(mocks.publish.mock.calls[0][1]).toEqual([
		expect.objectContaining({ id: "b", expected: "v2" }),
	]);
});

it("keeps skipping empty translation slots and filters only non-string tags", async () => {
	mocks.list.mockResolvedValue([]);
	mocks.preview.mockResolvedValue({
		errors: [],
		rows: [
			{
				slug: " test ",
				errors: [],
				tags: ["tag", 42],
				translations: [
					null,
					{ language: "ru", title: " Title ", content: " Text " },
					{ language: "en", title: "Unused", content: " " },
				],
			},
			{ errors: [], translations: [] },
		],
	});
	mocks.publish.mockResolvedValue({});
	render(
		<QueryClientProvider client={new QueryClient()}>
			<CommonBindImport />
		</QueryClientProvider>,
	);
	fireEvent.change(screen.getByLabelText("Ссылка Google Sheets"), {
		target: { value: "https://docs.google.com/spreadsheets/d/test" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Предпросмотр таблицы" }));
	await screen.findByText(
		"Пропущено пустых переводов: 2; биндов без переводов: 1.",
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Опубликовать 1 изменений" }),
	);
	await waitFor(() => expect(mocks.publish).toHaveBeenCalled());
	expect(mocks.publish.mock.calls[0][1]).toEqual([
		expect.objectContaining({
			slug: "test",
			expected: null,
			tags: ["tag"],
			translations: [
				expect.objectContaining({
					language: "ru",
					title: "Title",
					content: "Text",
				}),
			],
		}),
	]);
});

it("keeps the existing validation error for non-string translation fields", async () => {
	mocks.list.mockResolvedValue([]);
	mocks.preview.mockResolvedValue({
		errors: [],
		rows: [
			{
				errors: [],
				translations: [{ language: 42, title: "Title", content: "Text" }],
			},
		],
	});
	render(
		<QueryClientProvider client={new QueryClient()}>
			<CommonBindImport />
		</QueryClientProvider>,
	);
	fireEvent.change(screen.getByLabelText("Ссылка Google Sheets"), {
		target: { value: "https://docs.google.com/spreadsheets/d/test" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Предпросмотр таблицы" }));
	expect((await screen.findByRole("alert")).textContent).toBe(
		"Бинд 1: заполните язык и название непустого перевода",
	);
	expect(mocks.publish).not.toHaveBeenCalled();
});
