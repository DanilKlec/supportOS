// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.fetch,
}));
import { AccountsPanel } from "./AccountsPanel";
const catalog = {
	roles: [
		{
			id: "support",
			name: "Support",
			description: "",
			is_system: true,
			version: 1,
			permissions: ["work"],
		},
		{
			id: "qc",
			name: "QC",
			description: "",
			is_system: true,
			version: 1,
			permissions: ["work", "monitor.read"],
		},
	],
	permissions: [
		{ id: "work", name: "Вход", description: "", creator_only: false },
		{
			id: "monitor.read",
			name: "Просмотр мониторинга",
			description: "",
			creator_only: false,
		},
	],
};
beforeEach(() => {
	useAuthStore.setState({
		session: {
			accessToken: "token",
			user: {
				id: "admin",
				email: "admin@example.com",
				role: "admin",
				access: {
					status: "active",
					version: 1,
					display_name: "",
					roles: [{ id: "admin", name: "Admin" }],
					permissions: ["work", "monitor.read", "users.manage", "roles.manage"],
				},
			},
		},
	});
	mock.fetch.mockImplementation(async (url, init) => {
		const action = new URL(url, "https://app.test").searchParams.get("action");
		return new Response(
			JSON.stringify(
				init?.method === "POST"
					? { ok: true }
					: action === "catalog"
						? catalog
						: action === "users"
							? {
									total: 1,
									users: [
										{
											id: "user",
											email: "user@example.com",
											display_name: "Employee",
											status: "active",
											roles: ["support"],
											version: 4,
										},
									],
								}
							: { rows: [], hasMore: false },
			),
		);
	});
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	useAuthStore.setState({ session: undefined });
});
it("assigns multiple roles with the profile version and shows success only after saving", async () => {
	render(<AccountsPanel />);
	await screen.findByText("user@example.com");
	fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "QC" }));
	fireEvent.click(screen.getByRole("button", { name: "Сохранить доступ" }));
	await screen.findByText("Изменения сохранены");
	const request = mock.fetch.mock.calls.find(
		([, init]) => init?.method === "POST",
	);
	expect(JSON.parse(request![1].body)).toEqual({
		action: "user.update",
		payload: {
			id: "user",
			version: 4,
			display_name: "Employee",
			roles: ["support", "qc"],
			status: "active",
		},
	});
});
it("creates a custom role from permission checkboxes", async () => {
	render(<AccountsPanel />);
	await screen.findByText("user@example.com");
	fireEvent.click(screen.getByRole("tab", { name: "Роли и разрешения" }));
	await waitFor(() =>
		expect(
			(
				screen.getByRole("button", {
					name: "Создать роль",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false),
	);
	fireEvent.click(screen.getByRole("button", { name: "Создать роль" }));
	fireEvent.change(screen.getByLabelText("Код роли"), {
		target: { value: "reviewer" },
	});
	fireEvent.change(screen.getByLabelText("Название роли"), {
		target: { value: "Reviewer" },
	});
	fireEvent.click(
		screen.getByRole("checkbox", { name: "Просмотр мониторинга" }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Сохранить роль" }));
	await screen.findByText("Изменения сохранены");
	const request = mock.fetch.mock.calls.find(
		([, init]) => init?.method === "POST",
	);
	expect(JSON.parse(request![1].body).payload).toMatchObject({
		id: "reviewer",
		permissions: ["work", "monitor.read"],
		version: 0,
	});
});
