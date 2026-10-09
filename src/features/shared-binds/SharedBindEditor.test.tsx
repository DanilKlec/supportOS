// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useKnowledgeStore } from "@/store";
import { SharedBindEditor } from "./SharedBindEditor";

const mock = vi.hoisted(() => ({ save: vi.fn(), list: vi.fn() }));
vi.mock("@/services/shared-binds.service", () => ({
	sharedBindsService: mock,
}));
const original = {
	id: "base",
	slug: "base",
	ownerId: null,
	categoryId: "shared",
	folderId: "folder",
	color: "#3B82F6",
	tags: [],
	translations: [
		{
			language: "ru",
			title: "Ответ",
			content: "Текст ответа",
			updatedAt: "old",
		},
	],
	favorite: false,
	archived: false,
	createdAt: "old",
	updatedAt: "old",
};
beforeEach(() => {
	vi.resetAllMocks();
	localStorage.clear();
	useKnowledgeStore.setState({
		categories: [
			{ id: "shared", name: "Команда", ownerId: null, order: 1 },
			{ id: "another", name: "Другой", ownerId: null, order: 2 },
			{ id: "private", name: "Личный раздел", ownerId: "me", order: 3 },
		],
		folders: [
			{
				id: "folder",
				name: "Папка",
				categoryId: "shared",
				ownerId: null,
				order: 1,
			},
			{
				id: "nested",
				name: "Вложенная",
				parentId: "folder",
				categoryId: "shared",
				ownerId: null,
				order: 2,
			},
			{
				id: "private-folder",
				name: "Личная папка",
				categoryId: "shared",
				ownerId: "me",
				order: 3,
			},
		],
	});
	mock.save.mockResolvedValue(original);
});
afterEach(cleanup);
const show = () =>
	render(
		<SharedBindEditor
			original={original}
			onClose={vi.fn()}
			onSaved={vi.fn()}
		/>,
	);
const review = () =>
	fireEvent.click(screen.getByRole("button", { name: "Проверить изменения" }));
const publish = () =>
	fireEvent.click(
		screen.getByRole("button", { name: "Опубликовать для всех" }),
	);
it("offers only common categories/folders, nested paths and the original color", () => {
	show();
	expect((screen.getByLabelText("Раздел") as HTMLSelectElement).value).toBe(
		"shared",
	);
	expect((screen.getByLabelText("Папка") as HTMLSelectElement).value).toBe(
		"folder",
	);
	expect((screen.getByLabelText("Цвет HEX") as HTMLInputElement).value).toBe(
		"#3B82F6",
	);
	expect(
		screen.getByRole("option", { name: "Папка / Вложенная" }),
	).toBeTruthy();
	expect(screen.queryByRole("option", { name: "Личный раздел" })).toBeNull();
	expect(screen.queryByRole("option", { name: "Личная папка" })).toBeNull();
});
it("persists selected location/color only after explicit review and clears an old folder on category change", async () => {
	show();
	fireEvent.change(screen.getByLabelText("Раздел"), {
		target: { value: "another" },
	});
	expect((screen.getByLabelText("Папка") as HTMLSelectElement).value).toBe("");
	review();
	expect(mock.save).not.toHaveBeenCalled();
	expect(screen.getByText("Общие / Другой / Без папки · #3B82F6")).toBeTruthy();
	publish();
	await waitFor(() =>
		expect(mock.save).toHaveBeenCalledWith(
			expect.objectContaining({
				original,
				categoryId: "another",
				folderId: null,
				color: "#3B82F6",
			}),
		),
	);
});
it("requires a new review after color changes and sends null for inheritance", async () => {
	show();
	review();
	fireEvent.click(
		screen.getByRole("button", { name: "Использовать цвет папки" }),
	);
	expect(
		screen.queryByRole("button", { name: "Опубликовать для всех" }),
	).toBeNull();
	review();
	publish();
	await waitFor(() =>
		expect(mock.save).toHaveBeenCalledWith(
			expect.objectContaining({
				categoryId: "shared",
				folderId: "folder",
				color: null,
			}),
		),
	);
});
it("recovers location and color with the draft and does not publish it automatically", () => {
	const first = show();
	fireEvent.change(screen.getByLabelText("Папка"), {
		target: { value: "nested" },
	});
	fireEvent.change(screen.getByLabelText("Цвет HEX"), {
		target: { value: "#EF4444" },
	});
	first.unmount();
	show();
	fireEvent.click(
		screen.getByRole("button", { name: "Восстановить черновик" }),
	);
	expect((screen.getByLabelText("Папка") as HTMLSelectElement).value).toBe(
		"nested",
	);
	expect((screen.getByLabelText("Цвет HEX") as HTMLInputElement).value).toBe(
		"#EF4444",
	);
	expect(mock.save).not.toHaveBeenCalled();
});
it("keeps the selected metadata on a 409 and retries only after comparing the latest version", async () => {
	mock.save.mockRejectedValueOnce(
		Object.assign(new Error("Конфликт"), { status: 409 }),
	);
	mock.list.mockResolvedValue([{ ...original, updatedAt: "new" }]);
	show();
	fireEvent.change(screen.getByLabelText("Папка"), {
		target: { value: "nested" },
	});
	review();
	publish();
	await screen.findByText("Ответ изменён другим сотрудником");
	expect(mock.save).toHaveBeenCalledTimes(1);
	fireEvent.click(
		screen.getByRole("button", { name: "Продолжить с моими правками" }),
	);
	review();
	publish();
	await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(2));
	expect(mock.save.mock.calls[1][0]).toMatchObject({
		original: { updatedAt: "new" },
		folderId: "nested",
	});
});
