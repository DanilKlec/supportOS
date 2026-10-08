// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Button, EmptyState, ErrorState, LoadingState } from "./index";

afterEach(cleanup);

it("uses a Russian default empty message without inventing actions or alerts", () => {
	render(<EmptyState />);
	expect(screen.getByText("Здесь пока нет данных.")).toBeTruthy();
	expect(screen.queryByRole("button")).toBeNull();
	expect(screen.queryByRole("alert")).toBeNull();
});

it("renders an empty-state description and an explicit action with existing UI classes", () => {
	const add = vi.fn();
	render(
		<EmptyState
			title="Материалов пока нет"
			description="Добавьте первый бинд."
			className="custom-empty"
			action={<Button onClick={add}>Добавить бинд</Button>}
		/>,
	);
	expect(
		screen
			.getByText("Материалов пока нет")
			.parentElement?.classList.contains("custom-empty"),
	).toBe(true);
	expect(screen.getByText("Добавьте первый бинд.")).toBeTruthy();
	const button = screen.getByRole("button", { name: "Добавить бинд" });
	expect(button.classList.contains("ui-button")).toBe(true);
	fireEvent.click(button);
	expect(add).toHaveBeenCalledOnce();
});

it("announces loading as a busy polite status with a Russian default", () => {
	render(<LoadingState />);
	const status = screen.getByRole("status");
	expect(status.textContent).toBe("Загружаем данные…");
	expect(status.getAttribute("aria-live")).toBe("polite");
	expect(status.getAttribute("aria-busy")).toBe("true");
});

it("supports a context-specific loading message and className", () => {
	render(
		<LoadingState message="Загружаем материалы…" className="custom-loading" />,
	);
	expect(screen.getByRole("status").textContent).toBe("Загружаем материалы…");
	expect(screen.getByRole("status").classList.contains("custom-loading")).toBe(
		true,
	);
});

it("renders a Russian alert without a retry button when no callback is supplied", () => {
	render(<ErrorState className="custom-error" />);
	expect(screen.getByRole("alert").textContent).toContain(
		"Не удалось загрузить данные.",
	);
	expect(screen.getByRole("alert").classList.contains("custom-error")).toBe(
		true,
	);
	expect(screen.getByText("Попробуйте ещё раз.")).toBeTruthy();
	expect(screen.queryByRole("button")).toBeNull();
});

it("retries only on an explicit click and disables repeated clicks while retrying", () => {
	const retry = vi.fn();
	const view = render(
		<ErrorState
			title="Материалы недоступны"
			description="Нет подключения."
			onRetry={retry}
		/>,
	);
	expect(retry).not.toHaveBeenCalled();
	const button = screen.getByRole("button", { name: "Повторить" });
	expect(button.classList.contains("ui-button")).toBe(true);
	fireEvent.click(button);
	expect(retry).toHaveBeenCalledOnce();
	view.rerender(<ErrorState onRetry={retry} retrying />);
	const busy = screen.getByRole("button", {
		name: /Повторить/,
	}) as HTMLButtonElement;
	expect(busy.disabled).toBe(true);
	expect(busy.getAttribute("aria-busy")).toBe("true");
	fireEvent.click(busy);
	expect(retry).toHaveBeenCalledOnce();
});
