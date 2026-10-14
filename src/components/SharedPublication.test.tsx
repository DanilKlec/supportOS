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

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/services/shared-content.service", () => ({ contentApi: mock.api }));

import { useSharedPublication } from "./SharedPublication";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	window.localStorage.clear();
});
function renderPublication(node: React.ReactNode) {
	return render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			{node}
		</QueryClientProvider>,
	);
}
function Screen({
	dataset = "emails",
}: {
	dataset?: "emails" | "bonuses" | "bonus-tools";
}) {
	const [data, setData] = useState<any[]>([{ id: "local" }]);
	const p = useSharedPublication(dataset, data, setData);
	return (
		<>
			{p.banner}
			<output>{JSON.stringify(data)}</output>
			<button
				type="button"
				disabled={!p.canEdit}
				onClick={() => setData([{ id: "draft", name: "New" }])}
			>
				Edit
			</button>
		</>
	);
}
function auth(permissions: string[], id = "a") {
	useAuthStore.setState({
		session: {
			accessToken: "token",
			user: {
				id,
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
	renderPublication(<Screen />);
	await waitFor(() =>
		expect(screen.getByRole("status").textContent).toContain("shared"),
	);
	expect((screen.getByText("Edit") as HTMLButtonElement).disabled).toBe(true);
	expect(screen.queryByText("Сохранить для всех")).toBeNull();
});
it("clears legacy email storage only after published data loads", async () => {
	auth(["projects.read"]);
	window.localStorage.setItem("supportos:project-emails:v1", "legacy");
	mock.api.mockResolvedValue({
		data: [{ id: "shared" }],
		version: 1,
		updated_at: "2026-09-11",
	});
	renderPublication(<Screen />);
	await waitFor(() =>
		expect(
			window.localStorage.getItem("supportos:project-emails:v1"),
		).toBeNull(),
	);
});
it("keeps legacy email storage when the server load fails", async () => {
	auth(["projects.read"]);
	window.localStorage.setItem("supportos:project-emails:v1", "legacy");
	mock.api.mockRejectedValue(new Error("offline"));
	renderPublication(<Screen />);
	await screen.findByRole("alert");
	expect(window.localStorage.getItem("supportos:project-emails:v1")).toBe(
		"legacy",
	);
});
it("clears legacy bonus records only after their published data loads", async () => {
	auth(["bonuses.read", "bonuses.write"]);
	window.localStorage.setItem("supportos:deposit-bonuses:v1", "legacy");
	window.localStorage.setItem("supportos:bonus-tools:v1", "legacy");
	mock.api.mockResolvedValue({
		data: [{ id: "shared" }],
		version: 1,
		updated_at: "2026-09-11",
	});
	renderPublication(<Screen dataset="bonuses" />);
	await waitFor(() =>
		expect(
			window.localStorage.getItem("supportos:deposit-bonuses:v1"),
		).toBeNull(),
	);
	expect(window.localStorage.getItem("supportos:bonus-tools:v1")).toBe(
		"legacy",
	);
	cleanup();
	renderPublication(<Screen dataset="bonus-tools" />);
	await waitFor(() =>
		expect(window.localStorage.getItem("supportos:bonus-tools:v1")).toBeNull(),
	);
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
	renderPublication(<Screen />);
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
	renderPublication(<Screen />);
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

it.each([
	"emails",
	"bonuses",
	"bonus-tools",
] as const)("keeps the %s draft after a publication failure and allows retry with the same version", async (dataset) => {
	auth(
		["projects.read", "projects.write", "bonuses.read", "bonuses.write"],
		`retry-${dataset}`,
	);
	mock.api
		.mockResolvedValueOnce({ data: [], version: 3, updated_at: "2026-10-09" })
		.mockRejectedValueOnce(
			new Error("Серверная публикация не настроена: требуется миграция БД."),
		)
		.mockResolvedValueOnce({
			data: [{ id: "draft", name: "New" }],
			version: 4,
			updated_at: "2026-10-09",
		});
	renderPublication(<Screen dataset={dataset} />);
	await waitFor(() =>
		expect((screen.getByText("Edit") as HTMLButtonElement).disabled).toBe(
			false,
		),
	);
	fireEvent.click(screen.getByText("Edit"));
	fireEvent.click(screen.getByText("Сохранить для всех"));
	await screen.findByRole("alert");
	expect(screen.getByRole("status").textContent).toContain("draft");
	expect(
		(screen.getByText("Сохранить для всех") as HTMLButtonElement).disabled,
	).toBe(false);
	fireEvent.click(screen.getByText("Сохранить для всех"));
	await waitFor(() =>
		expect(
			(screen.getByText("Сохранить для всех") as HTMLButtonElement).disabled,
		).toBe(true),
	);
	expect(screen.queryByRole("alert")).toBeNull();
	expect(mock.api.mock.calls.slice(1)).toEqual([
		[dataset, [{ id: "draft", name: "New" }], 3],
		[dataset, [{ id: "draft", name: "New" }], 3],
	]);
});

function PersonalScreen() {
	const [data, setData] = useState<any[]>([]);
	const p = useSharedPublication("bonuses", data, setData, false);
	return (
		<>
			{p.banner}
			<output>{JSON.stringify(data)}</output>
			<button
				type="button"
				disabled={!p.canEdit}
				onClick={() => setData([{ id: "mine" }])}
			>
				Edit personal
			</button>
		</>
	);
}
it("lets Support save only personal bonus data without publishing controls", async () => {
	auth(["bonuses.read"]);
	mock.api.mockImplementation(async (_dataset, data, _version, scope) =>
		data
			? { data, version: 1, updated_at: "2026-09-11" }
			: scope === "personal"
				? null
				: { data: [{ id: "team" }], version: 7, updated_at: "2026-09-11" },
	);
	renderPublication(<PersonalScreen />);
	await waitFor(() =>
		expect(
			(screen.getByText("Edit personal") as HTMLButtonElement).disabled,
		).toBe(false),
	);
	expect(screen.getByRole("status").textContent).toContain("team");
	expect(screen.queryByText("Загрузить общую версию")).toBeNull();
	expect(screen.queryByText("Сохранить для всех")).toBeNull();
	fireEvent.click(screen.getByText("Edit personal"));
	fireEvent.click(screen.getByText("Сохранить для себя"));
	await waitFor(() =>
		expect(mock.api).toHaveBeenCalledWith(
			"bonuses",
			[{ id: "mine" }],
			0,
			"personal",
		),
	);
});
