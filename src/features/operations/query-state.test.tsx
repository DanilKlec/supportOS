// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryState, Unavailable } from "./OperationsWorkspace";

afterEach(cleanup);

it("uses the shared loading state without calling refetch", () => {
	const refetch = vi.fn();
	render(
		<QueryState
			query={{ isPending: true, error: null, refetch }}
			loadingMessage="Загружаем пользователей…"
		/>,
	);
	expect(screen.getByRole("status").textContent).toBe(
		"Загружаем пользователей…",
	);
	expect(refetch).not.toHaveBeenCalled();
});

it("keeps Russian server error explanations and reuses the existing refetch callback", () => {
	const refetch = vi.fn();
	render(
		<QueryState
			query={{
				isPending: false,
				error: new Error("Сессия завершена. Войдите снова."),
				refetch,
			}}
		/>,
	);
	expect(screen.getByRole("alert").textContent).toContain(
		"Сессия завершена. Войдите снова.",
	);
	fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
	expect(refetch).toHaveBeenCalledOnce();
});

it("shows a understandable Russian error instead of an English transport error", () => {
	render(
		<QueryState
			query={{
				isPending: false,
				error: new Error("Failed to fetch"),
				refetch: vi.fn(),
			}}
			errorTitle="Не удалось загрузить пользователей."
		/>,
	);
	expect(screen.getByText("Не удалось загрузить пользователей.")).toBeTruthy();
	expect(screen.queryByText("Failed to fetch")).toBeNull();
});

it("gives errors priority over pending and disables retry during the existing request", () => {
	render(
		<QueryState
			query={{
				isPending: true,
				isFetching: true,
				error: new Error("Источник недоступен"),
				refetch: vi.fn(),
			}}
		/>,
	);
	expect(screen.queryByRole("status")).toBeNull();
	expect(screen.getByRole("alert")).toBeTruthy();
	expect(
		(screen.getByRole("button", { name: /Повторить/ }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});

it("renders nothing for a successful query", () => {
	const view = render(
		<QueryState query={{ isPending: false, error: null, refetch: vi.fn() }} />,
	);
	expect(view.container.childElementCount).toBe(0);
});

it("uses EmptyState for existing Admin and QC empty messages", () => {
	render(<Unavailable message="Сейчас нет материалов, требующих проверки." />);
	expect(
		screen
			.getByText("Сейчас нет материалов, требующих проверки.")
			.parentElement?.classList.contains("ops-empty"),
	).toBe(true);
	expect(screen.queryByRole("alert")).toBeNull();
});
