// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ChatClockProvider, WaitingTime } from "./ChatClock";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

test("marks the first reply overdue at twenty seconds only", () => {
	vi.useFakeTimers();
	const startedAt = 1_795_000_000;
	vi.setSystemTime(startedAt * 1000 + 14_000);
	vi.spyOn(document, "hidden", "get").mockReturnValue(false);
	render(
		<ChatClockProvider>
			<WaitingTime timestamp={startedAt} className="label" firstReply />
		</ChatClockProvider>,
	);
	const timer = screen.getByTitle("Первый ответ за 20 с");
	act(() => vi.advanceTimersByTime(1000));
	expect(timer.classList.contains("chat-reply-overdue")).toBe(false);
	act(() => vi.advanceTimersByTime(5000));
	expect(timer.classList.contains("chat-reply-overdue")).toBe(true);
	expect(timer.textContent).toBe("Ждёт 20 с / 20 с");
});

test("ticks each second across a minute and synchronizes on return to the tab", () => {
	vi.useFakeTimers();
	const startedAt = 1_795_000_000;
	vi.setSystemTime(startedAt * 1000 + 59_350);
	const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
	render(
		<ChatClockProvider>
			<WaitingTime timestamp={startedAt} className="label" />
			<WaitingTime timestamp={startedAt * 1000} className="label" />
		</ChatClockProvider>,
	);
	expect(screen.getAllByText("Ждёт 59 с")).toHaveLength(2);
	act(() => vi.advanceTimersByTime(650));
	expect(screen.getAllByText("Ждёт 1 мин 00 с")).toHaveLength(2);
	act(() => vi.advanceTimersByTime(1000));
	expect(screen.getAllByText("Ждёт 1 мин 01 с")).toHaveLength(2);

	hidden.mockReturnValue(true);
	act(() => {
		document.dispatchEvent(new Event("visibilitychange"));
	});
	vi.setSystemTime(startedAt * 1000 + 95_500);
	hidden.mockReturnValue(false);
	act(() => {
		document.dispatchEvent(new Event("visibilitychange"));
	});
	expect(screen.getAllByText("Ждёт 1 мин 35 с")).toHaveLength(2);
	act(() => vi.advanceTimersByTime(500));
	expect(screen.getAllByText("Ждёт 1 мин 36 с")).toHaveLength(2);
});
