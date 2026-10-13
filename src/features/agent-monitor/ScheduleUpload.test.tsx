// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScheduleUpload } from "./ScheduleUpload";

const read = vi.hoisted(() => vi.fn());
vi.mock("read-excel-file/browser", () => ({ default: read }));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
const workbook = [
	{
		sheet: "September 26",
		data: [
			[null, null, "Сентябрь", ...Array.from({ length: 30 }, (_, i) => i + 1)],
			[null, null, "Иван Иванов (sup)", 7],
		],
	},
	{
		sheet: "Почты сотр",
		data: [[null, "Иван Иванов", null, null, "work@example.com"]],
	},
];
it("reads locally and only saves on confirmation, then clears the preview", async () => {
	read.mockResolvedValue(workbook);
	const save = vi.fn().mockResolvedValue(undefined);
	render(
		<ScheduleUpload agents={[{ id: "work@example.com" }]} onSave={save} />,
	);
	fireEvent.click(screen.getByText("Загрузить график Excel"));
	fireEvent.change(screen.getByLabelText("Файл графика"), {
		target: { files: [new File(["test"], "schedule.xlsx")] },
	});
	await screen.findByText("work@example.com");
	expect(save).not.toHaveBeenCalled();
	fireEvent.click(screen.getByText("Подтвердить обновление графика"));
	await waitFor(() => expect(save).toHaveBeenCalledOnce());
	await screen.findByText("График за 2026-09 обновлён.");
	expect(screen.queryByText("Подтвердить обновление графика")).toBeNull();
});
it("blocks confirmation for unmatched email", async () => {
	read.mockResolvedValue(workbook);
	const save = vi.fn();
	render(<ScheduleUpload agents={[]} onSave={save} />);
	fireEvent.click(screen.getByText("Загрузить график Excel"));
	fireEvent.change(screen.getByLabelText("Файл графика"), {
		target: { files: [new File(["test"], "schedule.xlsx")] },
	});
	const button = await screen.findByText("Подтвердить обновление графика");
	expect((button as HTMLButtonElement).disabled).toBe(true);
	expect(save).not.toHaveBeenCalled();
});
it("allows confirmation with code 8 and warns about skipped employees", async () => {
	read.mockResolvedValue([
		{
			...workbook[0],
			data: [
				workbook[0].data[0],
				[null, null, "Иван Иванов (sup)", 8, 7],
				[null, null, "Новый Сотрудник (sup)", 7],
			],
		},
		workbook[1],
	]);
	const save = vi.fn().mockResolvedValue(undefined);
	render(
		<ScheduleUpload agents={[{ id: "work@example.com" }]} onSave={save} />,
	);
	fireEvent.click(screen.getByText("Загрузить график Excel"));
	fireEvent.change(screen.getByLabelText("Файл графика"), {
		target: { files: [new File(["test"], "schedule.xlsx")] },
	});
	const button = await screen.findByText("Подтвердить обновление графика");
	expect((button as HTMLButtonElement).disabled).toBe(false);
	expect(
		screen.getByText(/Пропущены сотрудники без корпоративной почты/),
	).toBeTruthy();
	expect(screen.getByText(/Новый Сотрудник \(sup\)/)).toBeTruthy();
	expect(save).not.toHaveBeenCalled();
	fireEvent.click(button);
	await waitFor(() =>
		expect(save).toHaveBeenCalledWith({
			month: "2026-09",
			people: ["work@example.com"],
			records: [{ day: "2026-09-02", email: "work@example.com", shift: "day" }],
		}),
	);
});
