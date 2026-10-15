// @vitest-environment jsdom

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
	ApplicationBoundary,
	ApplicationError,
	ApplicationStatus,
} from "./ApplicationStatus";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	delete window.supportosRecover;
});

it("shows a loading state immediately and a recovery action for a stalled startup", () => {
	vi.useFakeTimers();
	const recover = vi.fn(async () => undefined);
	window.supportosRecover = recover;
	render(<ApplicationStatus />);
	expect(screen.getByRole("status").textContent).toContain("проверяем доступ");
	expect(screen.queryByRole("button")).toBeNull();
	act(() => vi.advanceTimersByTime(12000));
	fireEvent.click(screen.getByRole("button", { name: "Загрузить заново" }));
	expect(recover).toHaveBeenCalledOnce();
});

it("catches a render failure instead of leaving an empty root and never reloads automatically", () => {
	vi.spyOn(console, "error").mockImplementation(() => undefined);
	window.supportosRecover = vi.fn(async () => undefined);
	function BrokenPage(): never {
		throw new Error("synthetic render failure");
	}
	render(
		<ApplicationBoundary>
			<BrokenPage />
		</ApplicationBoundary>,
	);
	expect(screen.getByRole("alert").textContent).toContain(
		"версия приложения обновилась",
	);
	expect(screen.getByRole("button", { name: "Загрузить заново" })).toBeTruthy();
	expect(window.supportosRecover).not.toHaveBeenCalled();
});

it("provides recovery for a failed route without exposing raw server errors", () => {
	render(<ApplicationError />);
	expect(
		screen.getByRole("heading", { name: "Не удалось открыть страницу" }),
	).toBeTruthy();
	expect(screen.getByRole("button", { name: "Загрузить заново" })).toBeTruthy();
});

it("keeps the router visible while its initial access check is pending", async () => {
	let release!: () => void;
	const accessCheck = new Promise<void>((resolve) => {
		release = resolve;
	});
	const root = createRootRoute({
		beforeLoad: () => accessCheck,
		component: Outlet,
	});
	const home = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => <p>Рабочее пространство готово</p>,
	});
	const router = createRouter({
		routeTree: root.addChildren([home]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
		defaultPendingComponent: ApplicationStatus,
		defaultPendingMs: 150,
		defaultPendingMinMs: 150,
	});
	render(<RouterProvider router={router} />);
	expect(
		await screen.findByRole("heading", { name: "Открываем SupportOS" }),
	).toBeTruthy();
	await act(async () => {
		release();
	});
	expect(await screen.findByText("Рабочее пространство готово")).toBeTruthy();
});
