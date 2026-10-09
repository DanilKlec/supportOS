// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDefaultAppearanceSettings } from "@/shared/lib/appearance";
import { useAuthStore } from "@/store/auth.store";
import { useKnowledgeStore } from "@/store/knowledge.store";
import {
	DEFAULT_WORKSPACE_LAYOUT,
	useWorkspaceStore,
} from "@/store/workspace.store";

const mock = vi.hoisted(() => ({
	hash: "",
	showToast: vi.fn(),
	signOut: vi.fn(),
	loadKnowledge: vi.fn(),
	exportJson: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useRouterState: () => mock.hash,
	Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: mock.showToast }),
}));
vi.mock("@/services/supabase.service", () => ({
	supabaseService: { signOut: mock.signOut },
}));
vi.mock("@/services/knowledge.service", () => ({
	knowledgeService: { loadKnowledge: mock.loadKnowledge },
}));
vi.mock("@/services/supportos-export.service", () => ({
	supportOSExportService: { exportJson: mock.exportJson },
}));
vi.mock("@/features/accounts/PasswordPanel", () => ({
	PasswordPanel: () => <p>Форма пароля</p>,
}));
vi.mock("@/features/accounts/ActiveSessionsPanel", () => ({
	ActiveSessionsPanel: () => <p>Активные сессии</p>,
}));
vi.mock("@/features/accounts/TelegramLinkPanel", () => ({
	TelegramLinkPanel: () => <p>Привязка Telegram</p>,
}));
vi.mock("@/features/accounts/LoginHistoryPanel", () => ({
	LoginHistoryPanel: () => <p>История входов</p>,
}));
vi.mock("@/features/spaces/IntegrationsPanel", () => ({
	IntegrationsPanel: () => <p>Панель интеграций</p>,
}));
vi.mock("@/components/backup/BackupImportPanel", () => ({
	BackupImportPanel: () => <p>Импорт backup</p>,
}));
vi.mock("@/components/import/GoogleSheetsImportPanel", () => ({
	GoogleSheetsImportPanel: () => <p>Импорт Sheets</p>,
}));
vi.mock("@/components/pwa/PWAInstallButton", () => ({
	PWAInstallButton: () => <button type="button">Установить</button>,
}));

import { Route } from "@/routes/settings/index";

const SettingsPage = Route.options.component as ComponentType;

beforeEach(() => {
	vi.resetAllMocks();
	mock.hash = "";
	mock.signOut.mockResolvedValue(undefined);
	mock.loadKnowledge.mockResolvedValue(undefined);
	mock.exportJson.mockResolvedValue('{"snapshot":true}');
	localStorage.clear();
	useWorkspaceStore.setState({ layout: { ...DEFAULT_WORKSPACE_LAYOUT } });
	useKnowledgeStore.setState({ language: "ru" });
	useAuthStore.setState({
		configured: true,
		session: {
			accessToken: "test-token",
			user: {
				id: "employee",
				email: "employee@example.com",
				role: "admin",
				access: {
					status: "active",
					version: 1,
					display_name: "Employee",
					roles: [{ id: "admin", name: "Admin" }],
					permissions: ["work", "binds.read", "knowledge.write"],
				},
			},
		},
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	useAuthStore.setState({ configured: false, session: undefined });
	localStorage.clear();
	document.documentElement.removeAttribute("style");
	document.documentElement.removeAttribute("class");
	for (const key of ["themeMode", "density", "palette", "radius"])
		delete document.documentElement.dataset[key];
});

it.each([
	["", "Общие"],
	["unknown", "Общие"],
	["appearance", "Оформление"],
	["data", "Данные"],
	["security", "Безопасность"],
	["integrations", "Интеграции"],
	["integrations-ai", "Интеграции"],
	["integrations-translator", "Интеграции"],
])("selects the existing section for hash %s", (hash, title) => {
	mock.hash = hash;
	render(<SettingsPage />);
	expect(screen.getByRole("heading", { name: title })).toBeTruthy();
	expect(
		screen.getByText("employee@example.com", { selector: "header div" }),
	).toBeTruthy();
	if (hash === "security") {
		expect(screen.getByText("Активные сессии")).toBeTruthy();
		expect(screen.getByText("Привязка Telegram")).toBeTruthy();
		expect(screen.getByText("История входов")).toBeTruthy();
		expect(screen.queryByText("Форма пароля")).toBeNull();
	}
	if (hash.startsWith("integrations"))
		expect(screen.getByText("Панель интеграций")).toBeTruthy();
});

it("initializes appearance on any section and retains it while switching hashes", () => {
	localStorage.setItem("supportos-theme-mode", "light");
	const view = render(<SettingsPage />);
	expect(document.documentElement.dataset.themeMode).toBe("light");
	expect(localStorage.getItem("supportos-theme")).toBe("light");
	localStorage.setItem("supportos-theme-mode", "dark");
	mock.hash = "appearance";
	view.rerender(<SettingsPage />);
	expect(screen.getByText("Текущая тема: Светлая")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: /Тёмная/ }));
	mock.hash = "security";
	view.rerender(<SettingsPage />);
	localStorage.setItem("supportos-theme-mode", "light");
	mock.hash = "appearance";
	view.rerender(<SettingsPage />);
	expect(screen.getByText("Текущая тема: Тёмная")).toBeTruthy();
});

it("keeps appearance, language and workspace persistence keys and reset behavior", () => {
	mock.hash = "appearance";
	render(<SettingsPage />);
	fireEvent.click(screen.getByRole("button", { name: /Светлая/ }));
	expect(
		screen
			.getByRole("option", { name: "Английский (EN)" })
			.getAttribute("value"),
	).toBe("en");
	fireEvent.click(screen.getByRole("button", { name: "Компактная" }));
	fireEvent.click(screen.getByRole("button", { name: "Большой" }));
	fireEvent.click(screen.getByRole("button", { name: /Закруглённый/ }));
	fireEvent.click(
		screen.getByRole("button", { name: /Свой Собственные цвета/ }),
	);
	fireEvent.change(screen.getByLabelText("Фон"), {
		target: { value: "#123456" },
	});
	fireEvent.change(screen.getByLabelText("Язык рабочего пространства"), {
		target: { value: "en" },
	});
	expect(useKnowledgeStore.getState().language).toBe("en");
	expect(localStorage.getItem("supportos-theme-mode")).toBe("light");
	expect(localStorage.getItem("supportos-theme")).toBe("light");
	expect(localStorage.getItem("supportos-density")).toBe("compact");
	expect(localStorage.getItem("supportos-font-scale")).toBe("large");
	expect(localStorage.getItem("supportos-radius")).toBe("rounded");
	expect(localStorage.getItem("supportos-palette")).toBe("custom");
	expect(
		JSON.parse(localStorage.getItem("supportos-custom-palette")!).background,
	).toBe("#123456");
	fireEvent.click(screen.getByRole("button", { name: /Узкая Больше места/ }));
	fireEvent.click(screen.getByRole("button", { name: /Верхняя панель/ }));
	expect(
		JSON.parse(localStorage.getItem("supportos:workspace-layout:v1")!).state
			.layout,
	).toMatchObject({ sidebarWidth: "narrow", showTopbar: false });
	fireEvent.click(screen.getByRole("button", { name: "Сбросить макет" }));
	expect(useWorkspaceStore.getState().layout).toEqual(DEFAULT_WORKSPACE_LAYOUT);
	expect(mock.showToast).toHaveBeenCalledWith(
		"Макет рабочего пространства сброшен",
	);
	fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
	expect(localStorage.getItem("supportos-accent")).toBe(
		getDefaultAppearanceSettings().accent,
	);
	expect(localStorage.getItem("supportos-theme-mode")).toBe(
		getDefaultAppearanceSettings().themeMode,
	);
});

it("keeps the explicitly selected blue accent after reinitializing Settings", () => {
	mock.hash = "appearance";
	const view = render(<SettingsPage />);
	fireEvent.click(screen.getByRole("button", { name: "Синий" }));
	expect(localStorage.getItem("supportos-accent")).toBe("#3b82f6");
	expect(
		document.documentElement.style.getPropertyValue("--color-accent"),
	).toBe("#3b82f6");
	view.unmount();
	render(<SettingsPage />);
	expect(
		document.documentElement.style.getPropertyValue("--color-accent"),
	).toBe("#3b82f6");
});

it("keeps import and export permission checks", () => {
	useAuthStore.setState((state) => ({
		session: {
			...state.session!,
			user: {
				...state.session!.user,
				access: { ...state.session!.user.access!, permissions: ["work"] },
			},
		},
	}));
	mock.hash = "data";
	render(<SettingsPage />);
	expect(screen.queryByText("Импорт backup")).toBeNull();
	expect(screen.queryByText("Импорт Sheets")).toBeNull();
	expect(
		(screen.getByRole("button", { name: /Экспорт JSON/ }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	expect(mock.exportJson).not.toHaveBeenCalled();
});

it("exports the server snapshot and releases the temporary download URL", async () => {
	mock.hash = "data";
	const createObjectURL = vi.fn(() => "blob:test-snapshot");
	const revokeObjectURL = vi.fn();
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL = createObjectURL;
			static revokeObjectURL = revokeObjectURL;
		},
	);
	const click = vi
		.spyOn(HTMLAnchorElement.prototype, "click")
		.mockImplementation(() => {});
	render(<SettingsPage />);
	expect(screen.getByText("Импорт backup")).toBeTruthy();
	expect(screen.getByText("Импорт Sheets")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: /Экспорт JSON/ }));
	await waitFor(() =>
		expect(mock.showToast).toHaveBeenCalledWith(
			"Снимок базы знаний экспортирован",
		),
	);
	expect(mock.exportJson).toHaveBeenCalledTimes(1);
	expect(click).toHaveBeenCalledTimes(1);
	expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
	expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-snapshot");
	expect(document.querySelector("a[download]")).toBeNull();
});

it("keeps sign-out and knowledge reload ordering", async () => {
	render(<SettingsPage />);
	expect(screen.getByText("Форма пароля")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
	await waitFor(() =>
		expect(mock.showToast).toHaveBeenCalledWith("Вы вышли из аккаунта"),
	);
	expect(mock.signOut).toHaveBeenCalledTimes(1);
	expect(mock.loadKnowledge).toHaveBeenCalledTimes(1);
	expect(mock.signOut.mock.invocationCallOrder[0]).toBeLessThan(
		mock.loadKnowledge.mock.invocationCallOrder[0],
	);
});

it("does not reload knowledge after a failed sign-out", async () => {
	mock.signOut.mockRejectedValue(new Error("offline"));
	render(<SettingsPage />);
	fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
	await waitFor(() =>
		expect(mock.showToast).toHaveBeenCalledWith(
			"Не удалось выйти. Повторите попытку.",
		),
	);
	expect(mock.loadKnowledge).not.toHaveBeenCalled();
});

it.each([
	[
		true,
		"Подключение к серверу настроено. Войдите в аккаунт, чтобы загрузить рабочие данные.",
	],
	[false, "Подключение к серверу не настроено. Рабочие данные недоступны."],
])("describes server data availability without promising local storage (%s)", (configured, message) => {
	useAuthStore.setState({ configured, session: undefined });
	render(<SettingsPage />);
	expect(screen.getByText(message)).toBeTruthy();
	expect(
		screen.queryByText(
			/локального рабочего пространства|Облачная синхронизация/,
		),
	).toBeNull();
	expect(mock.loadKnowledge).not.toHaveBeenCalled();
});
