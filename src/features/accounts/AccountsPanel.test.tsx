// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/auth.store";

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/services/authenticated-fetch", () => ({
	authenticatedFetch: mock.fetch,
}));

import { AccountsPanel } from "./AccountsPanel";
import { PermissionsEditor } from "./PermissionsEditor";

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
it("shows Russian permission groups without changing permission ids", () => {
	const onChange = vi.fn();
	render(
		<PermissionsEditor
			permissions={catalog.permissions}
			selected={["work"]}
			onChange={onChange}
			disabled={false}
		/>,
	);
	expect(
		screen.getByRole("heading", { name: "Администрирование" }),
	).toBeTruthy();
	expect(screen.getByRole("heading", { name: "Команда" })).toBeTruthy();
	expect(screen.queryByRole("heading", { name: "Administration" })).toBeNull();
	expect(screen.queryByRole("heading", { name: "Team" })).toBeNull();
	fireEvent.click(
		screen.getByRole("checkbox", { name: "Просмотр мониторинга" }),
	);
	expect(onChange).toHaveBeenCalledWith(["work", "monitor.read"]);
});

it("approves a pending registration and assigns selected roles in one request", async () => {
	render(
		<AccountsPanel
			initialUser={{
				id: "new",
				email: "new@example.com",
				display_name: "",
				status: "pending",
				roles: [],
				version: 1,
			}}
		/>,
	);
	const approve = await screen.findByRole("button", {
		name: "Подтвердить и выдать роли",
	});
	expect((approve as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(await screen.findByRole("checkbox", { name: "Support" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "QC" }));
	fireEvent.click(approve);
	fireEvent.click(
		screen.getByRole("button", { name: "Подтвердить изменения" }),
	);
	await screen.findByText("Изменения сохранены");
	const requests = mock.fetch.mock.calls.filter(
		([, init]) => init?.method === "POST",
	);
	expect(requests).toHaveLength(1);
	expect(JSON.parse(requests[0][1].body)).toEqual({
		action: "user.update",
		payload: {
			id: "new",
			display_name: "",
			status: "active",
			roles: ["support", "qc"],
			version: 1,
		},
	});
});
it("keeps the exact edited payload through the Telegram gate and executes only after explicit approval", async () => {
	const original = mock.fetch.getMockImplementation()!;
	const proof = { id: "request-id", token: "one-time-permit" };
	mock.fetch.mockImplementation(async (url, init) => {
		const action = new URL(url, "https://app.test").searchParams.get("action");
		if (init?.method !== "POST") return original(url, init);
		const body = JSON.parse(init.body);
		if (action === "critical")
			return Response.json({
				...proof,
				status: body.operation === "begin" ? "pending" : "approved",
				expiresAt: new Date(Date.now() + 300000).toISOString(),
			});
		if (!body.confirmation)
			return Response.json(
				{
					error: "Подтвердите в Telegram",
					code: "critical_confirmation_required",
				},
				{ status: 428 },
			);
		return Response.json({ ok: true });
	});
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<AccountsPanel
				initialUser={{
					id: "new",
					email: "new@example.com",
					display_name: "",
					status: "pending",
					roles: [],
					version: 1,
				}}
			/>
		</QueryClientProvider>,
	);
	fireEvent.click(await screen.findByRole("checkbox", { name: "Support" }));
	fireEvent.click(
		screen.getByRole("button", { name: "Подтвердить и выдать роли" }),
	);
	fireEvent.click(
		screen.getByRole("button", { name: "Подтвердить изменения" }),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "Отправить подтверждение" }),
	);
	await screen.findByText("Подтверждено в Telegram. Можно выполнить действие.");
	expect(
		mock.fetch.mock.calls.filter(
			([, init]) =>
				init?.method === "POST" && JSON.parse(init.body).confirmation,
		),
	).toHaveLength(0);
	fireEvent.click(screen.getByRole("button", { name: "Выполнить действие" }));
	await screen.findByText("Изменения сохранены");
	const changes = mock.fetch.mock.calls
		.filter(
			([url, init]) =>
				String(url).includes("action=users") && init?.method === "POST",
		)
		.map(([, init]) => JSON.parse(init.body));
	expect(changes).toHaveLength(2);
	expect(changes[1]).toEqual({ ...changes[0], confirmation: proof });
	client.clear();
});

it("preserves unsaved profile fields when switching the employee drawer tabs", async () => {
	render(<AccountsPanel />);
	await screen.findByText("user@example.com");
	fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
	fireEvent.change(screen.getByLabelText("Имя сотрудника"), {
		target: { value: "Updated employee" },
	});
	fireEvent.click(screen.getByRole("checkbox", { name: "QC" }));
	fireEvent.click(screen.getByRole("tab", { name: "Активность" }));
	await screen.findByText("Изменений доступа пока нет.");
	expect(
		mock.fetch.mock.calls.some(([url]) =>
			String(url).includes("action=audit&target=user"),
		),
	).toBe(true);
	fireEvent.click(screen.getByRole("tab", { name: "Профиль, роли и доступ" }));
	expect(
		(screen.getByLabelText("Имя сотрудника") as HTMLInputElement).value,
	).toBe("Updated employee");
	expect(
		(screen.getByRole("checkbox", { name: "QC" }) as HTMLInputElement).checked,
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Сохранить доступ" }));
	fireEvent.click(
		screen.getByRole("button", { name: "Подтвердить изменения" }),
	);
	await screen.findByText("Изменения сохранены");
	const request = mock.fetch.mock.calls.find(
		([, init]) => init?.method === "POST",
	);
	expect(JSON.parse(request![1].body)).toEqual({
		action: "user.update",
		payload: {
			id: "user",
			version: 4,
			display_name: "Updated employee",
			roles: ["support", "qc"],
			status: "active",
		},
	});
});

it("keeps self, creator and out-of-scope users read-only in the extracted table", async () => {
	const previous = mock.fetch.getMockImplementation()!;
	mock.fetch.mockImplementation(async (url, init) => {
		const action = new URL(url, "https://app.test").searchParams.get("action");
		if (action !== "users" || init?.method === "POST")
			return previous(url, init);
		return Response.json({
			total: 4,
			users: [
				{ id: "admin", roles: ["support"] },
				{ id: "owner", roles: ["creator"] },
				{ id: "restricted", roles: ["technical"] },
				{ id: "employee", roles: ["support"] },
			].map((user) => ({
				...user,
				email: `${user.id}@example.com`,
				display_name: user.id,
				status: "active",
				version: 1,
			})),
		});
	});
	render(<AccountsPanel />);
	await screen.findByText("employee@example.com");
	await waitFor(() =>
		expect(
			(
				within(
					screen.getByText("employee@example.com").closest("tr")!,
				).getByRole("button", { name: "Изменить" }) as HTMLButtonElement
			).disabled,
		).toBe(false),
	);
	for (const id of ["admin", "owner", "restricted", "employee"]) {
		const row = screen.getByText(`${id}@example.com`).closest("tr")!;
		expect(
			(
				within(row).getByRole("button", {
					name: "Изменить",
				}) as HTMLButtonElement
			).disabled,
		).toBe(id !== "employee");
		expect(
			(
				within(row).getByRole("button", {
					name: "История входов",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false);
	}
});

it("keeps the role matrix guards and hides permissions outside the actor scope", async () => {
	const previous = mock.fetch.getMockImplementation()!;
	mock.fetch.mockImplementation(async (url, init) => {
		const action = new URL(url, "https://app.test").searchParams.get("action");
		if (action !== "catalog") return previous(url, init);
		return Response.json({
			roles: [
				...catalog.roles,
				...[
					{ id: "admin", name: "Admin", permissions: ["work"] },
					{ id: "creator", name: "Creator", permissions: ["technical"] },
					{ id: "restricted", name: "Restricted", permissions: ["technical"] },
				].map((role) => ({
					...role,
					description: "",
					is_system: false,
					version: 1,
				})),
			],
			permissions: [
				...catalog.permissions,
				{
					id: "technical",
					name: "Технический доступ",
					description: "",
					creator_only: true,
				},
				{
					id: "settings.manage",
					name: "Управление настройками",
					description: "",
					creator_only: false,
				},
			],
		});
	});
	render(<AccountsPanel standalone embedded initialTab="roles" />);
	await screen.findByText("Матрица разрешений");
	await waitFor(() =>
		expect(
			(screen.getByRole("button", { name: "Support" }) as HTMLButtonElement)
				.disabled,
		).toBe(false),
	);
	for (const name of ["Admin", "Creator", "Restricted"])
		expect(
			(screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
		).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Создать роль" }));
	expect(screen.getByRole("checkbox", { name: "Вход" })).toBeTruthy();
	expect(
		screen.queryByRole("checkbox", { name: "Технический доступ" }),
	).toBeNull();
	expect(
		screen.queryByRole("checkbox", { name: "Управление настройками" }),
	).toBeNull();
});

it("appends audit pages using the last row cursor and keeps before/after snapshots", async () => {
	const previous = mock.fetch.getMockImplementation()!;
	mock.fetch.mockImplementation(async (url, init) => {
		const params = new URL(url, "https://app.test").searchParams;
		if (params.get("action") !== "audit") return previous(url, init);
		const next = params.get("before") === "20";
		return Response.json({
			rows: [
				{
					id: next ? 19 : 20,
					actor_label: "Admin",
					action: "user.update",
					target_id: next ? "older" : "user",
					created_at: "2026-10-08T10:00:00Z",
					before_data: {
						email: next ? "older@example.com" : "user@example.com",
						status: "pending",
						roles: [],
						version: 3,
					},
					after_data: {
						email: next ? "older@example.com" : "user@example.com",
						status: "active",
						roles: ["support"],
						permissions: ["work"],
						version: 4,
					},
				},
			],
			hasMore: !next,
		});
	});
	render(<AccountsPanel initialTab="audit" />);
	const summary = await screen.findByText(
		/Изменение пользователя.*user@example\.com/,
	);
	const entry = within(summary.closest("details")!);
	expect(entry.getByText("До")).toBeTruthy();
	expect(entry.getByText("После")).toBeTruthy();
	expect(entry.getByText("Статус: Ожидает доступа")).toBeTruthy();
	expect(entry.getByText("Роли: Support")).toBeTruthy();
	expect(entry.getByText("Разрешения: Вход")).toBeTruthy();
	await waitFor(() =>
		expect(
			(
				screen.getByRole("button", {
					name: "Показать ещё",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false),
	);
	fireEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
	await screen.findByText(/Изменение пользователя.*older@example\.com/);
	expect(
		screen.getByText(/Изменение пользователя.*user@example\.com/),
	).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Показать ещё" })).toBeNull();
	expect(
		mock.fetch.mock.calls.some(([url]) =>
			String(url).includes("action=audit&before=20"),
		),
	).toBe(true);
});
it("assigns multiple roles with the profile version and shows success only after saving", async () => {
	render(<AccountsPanel />);
	await screen.findByText("user@example.com");
	fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "QC" }));
	fireEvent.click(screen.getByRole("button", { name: "Сохранить доступ" }));
	expect(
		mock.fetch.mock.calls.some(([, init]) => init?.method === "POST"),
	).toBe(false);
	fireEvent.click(
		screen.getByRole("button", { name: "Подтвердить изменения" }),
	);
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
	expect(screen.getByText("+ Просмотр мониторинга")).toBeTruthy();
	fireEvent.click(
		screen.getByRole("button", { name: "Подтвердить изменения" }),
	);
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
it("shows the embedded directory with all statuses, server filters and account creation", async () => {
	render(<AccountsPanel standalone embedded initialTab="users" />);
	await screen.findByRole("table", { name: "Реестр пользователей" });
	await screen.findByText("user@example.com");
	expect(
		(screen.getByLabelText("Статус сотрудников") as HTMLSelectElement).value,
	).toBe("");
	fireEvent.change(screen.getByLabelText("Статус сотрудников"), {
		target: { value: "pending" },
	});
	await waitFor(() =>
		expect(
			mock.fetch.mock.calls.some(([url]) =>
				String(url).includes("status=pending"),
			),
		).toBe(true),
	);
	fireEvent.change(screen.getByLabelText("Роль сотрудников"), {
		target: { value: "qc" },
	});
	await waitFor(() =>
		expect(
			mock.fetch.mock.calls.some(([url]) => String(url).includes("role=qc")),
		).toBe(true),
	);
	fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
	await waitFor(() =>
		expect(
			(screen.getByLabelText("Статус сотрудников") as HTMLSelectElement).value,
		).toBe(""),
	);
	await waitFor(() =>
		expect(
			(
				screen.getByRole("button", {
					name: "Создать аккаунт",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false),
	);
	fireEvent.click(screen.getByRole("button", { name: "Создать аккаунт" }));
	expect(screen.getByRole("dialog", { name: "Новый сотрудник" })).toBeTruthy();
});
it("opens a read-only security history drawer for a user without opening the access editor", async () => {
	useAuthStore.setState((state) => ({
		session: { ...state.session!, sessionId: "verified-session" },
	}));
	const previous = mock.fetch.getMockImplementation()!;
	mock.fetch.mockImplementation(async (url, init) =>
		String(url).includes("action=login-history")
			? new Response(JSON.stringify({ events: [], nextCursor: null }))
			: previous(url, init),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={client}>
			<AccountsPanel standalone embedded initialTab="users" />
		</QueryClientProvider>,
	);
	await screen.findByText("user@example.com");
	await waitFor(() =>
		expect(
			(
				screen.getByRole("button", {
					name: "История входов",
				}) as HTMLButtonElement
			).disabled,
		).toBe(false),
	);
	fireEvent.click(screen.getByRole("button", { name: "История входов" }));
	await screen.findByText("Событий безопасности пока нет.");
	expect(
		screen.getByRole("dialog", { name: "История входов · Employee" }),
	).toBeTruthy();
	expect(
		mock.fetch.mock.calls.some(([url]) =>
			String(url).includes("action=login-history&target=user"),
		),
	).toBe(true);
	expect(screen.queryByRole("button", { name: "Сохранить доступ" })).toBeNull();
	view.unmount();
	client.clear();
});
