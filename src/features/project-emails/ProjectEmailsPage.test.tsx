// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ProjectEmailRecord } from "@/entities/project-email";
import { clearSessionViews } from "@/shared/hooks/useViewState";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { useProjectEmailStore } from "@/store/project-email.store";

const copy = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("@/shared/lib/clipboard", () => ({ copyToClipboard: copy }));
vi.mock("@/components/SharedPublication", () => ({
	useSharedPublication: () => ({ ready: true, canEdit: false, banner: null }),
}));

import { ProjectEmailsPage } from "./ProjectEmailsPage";

const records: ProjectEmailRecord[] = [
	{
		id: "alpha",
		slug: "alpha",
		projectName: "Alpha",
		updatedAt: "2026-10-08T10:00:00Z",
		addresses: [
			{ id: "a", type: "Support", email: "help@alpha.test", order: 0 },
		],
	},
	{
		id: "beta",
		slug: "beta",
		projectName: "Beta",
		updatedAt: "2026-10-08T10:00:00Z",
		addresses: [
			{
				id: "b",
				type: "KYC",
				email: "check@beta.test",
				note: "Проверка документов",
				order: 0,
			},
		],
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	useAuthStore.setState({ session: undefined });
	clearSessionViews();
	useBonusStore.setState({ activeProjectId: "alpha" });
	useProjectEmailStore.getState().setRecords(structuredClone(records));
});
afterEach(() => {
	cleanup();
	clearSessionViews();
	useProjectEmailStore.setState({ records: [] });
	useBonusStore.setState({ activeProjectId: undefined });
});

it.each([
	false,
	true,
])("searches all projects without a project filter (management=%s)", (management) => {
	// Old UI preferences and the bonus workspace must not narrow the directory.
	sessionStorage.setItem(
		`supportos:session-view:v1:${JSON.stringify(["guest", `emails:${management}`, "project-filter"])}`,
		JSON.stringify("alpha"),
	);
	render(<ProjectEmailsPage management={management} />);
	expect(screen.queryByRole("combobox")).toBeNull();
	expect(screen.getByText("2 из 2 проектов")).toBeTruthy();
	expect(screen.getByRole("button", { name: /Beta/ })).toBeTruthy();
});

it.each([
	" BETA ",
	"check@beta.test",
	"kyc",
	"документов",
])("searches names, addresses, types and notes: %s", (query) => {
	render(<ProjectEmailsPage />);
	fireEvent.change(screen.getByPlaceholderText("Поиск проекта или почты…"), {
		target: { value: query },
	});
	expect(screen.getByText("1 из 2 проектов")).toBeTruthy();
	expect(screen.getByRole("heading", { name: "Beta" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: /Alpha/ })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Сбросить поиск" }));
	expect(screen.getByText("2 из 2 проектов")).toBeTruthy();
});

it("distinguishes an empty search from an empty database", () => {
	render(<ProjectEmailsPage />);
	fireEvent.change(screen.getByPlaceholderText("Поиск проекта или почты…"), {
		target: { value: "not-found" },
	});
	expect(screen.getAllByText("Ничего не найдено")).toHaveLength(2);
	expect(screen.queryByText("Справочник почт пуст")).toBeNull();
	expect(useProjectEmailStore.getState().records).toEqual(records);
});

it("preserves project selection and address copying", () => {
	render(<ProjectEmailsPage />);
	fireEvent.click(screen.getByRole("button", { name: /Beta/ }));
	fireEvent.click(screen.getByRole("button", { name: "Копировать всё" }));
	expect(copy).toHaveBeenCalledWith(expect.stringContaining("check@beta.test"));
	expect(screen.getByRole("heading", { name: "Beta" })).toBeTruthy();
});
