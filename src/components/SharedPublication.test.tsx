// @vitest-environment jsdom
import { useState } from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";
const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/services/shared-content.service", () => ({ contentApi: mock.api }));
import { useSharedPublication } from "./SharedPublication";
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
function Screen() {
	const [data, setData] = useState<any[]>([{ id: "local" }]);
	const p = useSharedPublication("emails", data, setData);
	return (
		<>
			{p.banner}
			<output>{JSON.stringify(data)}</output>
			<button
				disabled={!p.canEdit}
				onClick={() => setData([{ id: "draft", name: "New" }])}
			>
				Edit
			</button>
		</>
	);
}
function auth(permissions: string[]) {
	useAuthStore.setState({
		session: {
			accessToken: "token",
			user: {
				id: "a",
				email: "a@b.com",
				role: "admin",
				access: {
					status: "active",
					roles: [],
					permissions,
					version: 1,
					display_name: "",
				},
			},
		} as any,
	});
}
it("loads published data for support and disables editing", async () => {
	auth(["projects.read"]);
	mock.api.mockResolvedValue({
		data: [{ id: "shared" }],
		version: 1,
		updated_at: "2026-09-11",
	});
	render(<Screen />);
	await waitFor(() =>
		expect(screen.getByRole("status").textContent).toContain("shared"),
	);
	expect((screen.getByText("Edit") as HTMLButtonElement).disabled).toBe(true);
	expect(screen.queryByText("Сохранить для всех")).toBeNull();
});
it("publishes a draft with expected version and ignores JSON property ordering", async () => {
	auth(["projects.read", "projects.write"]);
	mock.api
		.mockResolvedValueOnce({ data: [], version: 3, updated_at: "2026-09-11" })
		.mockResolvedValueOnce({
			data: [{ name: "New", id: "draft" }],
			version: 4,
			updated_at: "2026-09-11",
		});
	render(<Screen />);
	await waitFor(() =>
		expect((screen.getByText("Edit") as HTMLButtonElement).disabled).toBe(
			false,
		),
	);
	fireEvent.click(screen.getByText("Edit"));
	fireEvent.click(screen.getByText("Сохранить для всех"));
	await waitFor(() =>
		expect(mock.api).toHaveBeenCalledWith(
			"emails",
			[{ id: "draft", name: "New" }],
			3,
		),
	);
	await waitFor(() =>
		expect(
			(screen.getByText("Сохранить для всех") as HTMLButtonElement).disabled,
		).toBe(true),
	);
});
it("keeps drafts when the server reports a conflict", async () => {
	auth(["projects.read", "projects.write"]);
	mock.api
		.mockResolvedValueOnce({ data: [], version: 3, updated_at: "2026-09-11" })
		.mockRejectedValueOnce(new Error("Версия уже изменена"));
	render(<Screen />);
	await waitFor(() =>
		expect((screen.getByText("Edit") as HTMLButtonElement).disabled).toBe(
			false,
		),
	);
	fireEvent.click(screen.getByText("Edit"));
	fireEvent.click(screen.getByText("Сохранить для всех"));
	await screen.findByRole("alert");
	expect(screen.getByRole("status").textContent).toContain("draft");
});
