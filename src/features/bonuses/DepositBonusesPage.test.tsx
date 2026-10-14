// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BonusProject } from "@/entities/bonus";
import { useBonusStore } from "@/store/bonus.store";

const mock = vi.hoisted(() => ({
	canEdit: true,
	ready: true,
	showToast: vi.fn(),
	copy: vi.fn(),
	preview: vi.fn(),
	getRates: vi.fn(),
}));
vi.mock("@/shared/hooks/useToast", () => ({
	useToast: () => ({ showToast: mock.showToast }),
}));
vi.mock("@/shared/lib/clipboard", () => ({ copyToClipboard: mock.copy }));
vi.mock("@/components/SharedPublication", () => ({
	useSharedPublication: () => ({
		canEdit: mock.canEdit,
		ready: mock.ready,
		banner: <p>Публикация справочника</p>,
	}),
}));
vi.mock("@/services/project-catalog.service", () => ({
	useProjectCatalog: () => ({ data: [] }),
}));
vi.mock("@/services/deposit-bonus-import.service", () => ({
	depositBonusImportService: { preview: mock.preview },
}));
vi.mock("@/services/currency.service", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/services/currency.service")>();
	return {
		...actual,
		currencyService: Object.assign(Object.create(actual.currencyService), {
			getRates: mock.getRates,
		}),
	};
});
vi.mock("@/services/bonus-currency-registry.service", () => ({
	bonusCurrencyRegistryService: {
		getCurrencyGroupOptions: () => [
			{ name: "CurrencyTest", currencies: ["USD", "EUR"] },
		],
		getProjectContext: () => undefined,
		getDefaultCurrency: () => "USD",
		getCurrencyOptions: ({ fallback }: { fallback: string[] }) => fallback,
		replaceProjectMoneyText: ({ text }: { text: string }) => text,
	},
}));

import { DepositBonusesPage } from "./DepositBonusesPage";

const projects: BonusProject[] = [
	{
		id: "alpha",
		name: "Alpha",
		slug: "alpha",
		updatedAt: "2026-10-08T10:00:00Z",
		bonuses: [
			{
				id: "second",
				name: "Second bonus",
				content: "Второй бонус",
				minDepositAmount: 20,
				minDepositCurrency: "USD",
				order: 2,
			},
			{
				id: "first",
				name: "First bonus",
				content: "Первый бонус",
				minDepositAmount: 10,
				minDepositCurrency: "USD",
				order: 1,
				checkedAt: "2026-10-08T10:00:00Z",
				translations: [
					{
						language: "ru",
						content: "Первый бонус",
						updatedAt: "2026-10-08T10:00:00Z",
					},
					{
						language: "en",
						content: "English offer",
						updatedAt: "2026-10-08T10:00:00Z",
					},
				],
			},
		],
	},
	{
		id: "beta",
		name: "Beta",
		slug: "beta",
		updatedAt: "2026-10-08T10:00:00Z",
		bonuses: [],
	},
];

beforeEach(() => {
	vi.clearAllMocks();
	mock.canEdit = true;
	mock.ready = true;
	mock.copy.mockResolvedValue(true);
	mock.getRates.mockResolvedValue({
		base: "USD",
		date: "2026-10-08",
		updatedAt: "2026-10-08T10:00:00Z",
		rates: { USD: 1, EUR: 0.9 },
		source: "test",
	});
	mock.preview.mockResolvedValue({
		sourceUrl: "https://docs.google.com/test",
		csvUrl: "",
		projects: [projects[1]],
		errors: [],
		warnings: ["Проверьте источник"],
	});
	useBonusStore.setState({
		projects: structuredClone(projects),
		activeProjectId: "alpha",
		selectedCurrency: "USD",
		depositBonusLanguage: "ru",
		depositBonusQuery: "",
		projectCurrencyGroups: {},
	});
});
afterEach(() => {
	cleanup();
	useBonusStore.setState({
		projects: [],
		activeProjectId: undefined,
		depositBonusQuery: "",
	});
});

async function openPage(management = true) {
	const view = render(<DepositBonusesPage management={management} />);
	await waitFor(() =>
		expect(
			(screen.getByRole("button", { name: "Курсы валют" }) as HTMLButtonElement)
				.disabled,
		).toBe(false),
	);
	return view;
}

it("keeps project selection, translated search, bonus ordering and copying", async () => {
	await openPage();
	const editButtons = screen.getAllByRole("button", {
		name: "Редактировать бонус",
	});
	expect(editButtons[0].closest(".grid")!.textContent).toContain("First bonus");
	fireEvent.click(screen.getByRole("button", { name: /^Beta/ }));
	expect(useBonusStore.getState().activeProjectId).toBe("beta");
	expect(screen.getByText("В проекте пока нет бонусов")).toBeTruthy();
	fireEvent.change(screen.getByPlaceholderText("Поиск проектов или бонусов…"), {
		target: { value: "English offer" },
	});
	expect(screen.getByText("First bonus")).toBeTruthy();
	expect(screen.queryByText("Second bonus")).toBeNull();
	fireEvent.click(screen.getAllByRole("button", { name: "EN" })[0]);
	fireEvent.click(screen.getByRole("button", { name: "Копировать" }));
	await waitFor(() => expect(mock.copy).toHaveBeenCalledWith("English offer"));
	fireEvent.click(screen.getByRole("button", { name: "Скопировать пакет" }));
	await waitFor(() => expect(mock.copy).toHaveBeenCalledTimes(2));
	expect(mock.copy.mock.calls[1][0]).toContain("Alpha welcome package");
});

it("retains multilingual drafts and the existing bonus model when saving an edit", async () => {
	await openPage();
	fireEvent.click(
		screen.getAllByRole("button", { name: "Редактировать бонус" })[0],
	);
	fireEvent.change(
		screen.getByPlaceholderText("Текст бонуса / готовый ответ (RU)"),
		{ target: { value: "Обновлённый русский ответ" } },
	);
	fireEvent.click(screen.getAllByRole("button", { name: "EN" })[0]);
	expect(
		(
			screen.getByPlaceholderText(
				"Текст бонуса / готовый ответ (EN)",
			) as HTMLTextAreaElement
		).value,
	).toBe("English offer");
	fireEvent.change(
		screen.getByPlaceholderText("Текст бонуса / готовый ответ (EN)"),
		{ target: { value: "Updated English answer" } },
	);
	fireEvent.click(screen.getAllByRole("button", { name: "RU" })[0]);
	expect(
		(
			screen.getByPlaceholderText(
				"Текст бонуса / готовый ответ (RU)",
			) as HTMLTextAreaElement
		).value,
	).toBe("Обновлённый русский ответ");
	fireEvent.change(screen.getByPlaceholderText("Мин. депозит"), {
		target: { value: "25,5" },
	});
	fireEvent.change(screen.getByPlaceholderText("USD"), {
		target: { value: "eur" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Применить изменения" }));
	const bonus = useBonusStore
		.getState()
		.projects[0].bonuses.find((item) => item.id === "first")!;
	expect(bonus).toMatchObject({
		id: "first",
		name: "First bonus",
		content: "Обновлённый русский ответ",
		minDepositAmount: 25.5,
		minDepositCurrency: "EUR",
		order: 1,
		checkedAt: "",
	});
	expect(
		bonus.translations!.map(({ language, content }) => ({ language, content })),
	).toEqual([
		{ language: "ru", content: "Обновлённый русский ответ" },
		{ language: "en", content: "Updated English answer" },
	]);
	expect(
		screen.queryByRole("button", { name: "Применить изменения" }),
	).toBeNull();
});

it("preserves a draft across project changes and keeps validation and cancel behavior", async () => {
	await openPage();
	fireEvent.click(screen.getByRole("button", { name: "Добавить бонус" }));
	expect(screen.getByText("Укажите название бонуса")).toBeTruthy();
	fireEvent.change(screen.getByPlaceholderText("Название бонуса"), {
		target: { value: "Unsaved bonus" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Добавить бонус" }));
	expect(
		screen.getByText("Заполните условия хотя бы на одном языке"),
	).toBeTruthy();
	fireEvent.change(
		screen.getByPlaceholderText("Текст бонуса / готовый ответ (RU)"),
		{ target: { value: "Черновик" } },
	);
	fireEvent.click(screen.getByRole("button", { name: /^Beta/ }));
	expect(
		(screen.getByPlaceholderText("Название бонуса") as HTMLInputElement).value,
	).toBe("Unsaved bonus");
	expect(
		(
			screen.getByPlaceholderText(
				"Текст бонуса / готовый ответ (RU)",
			) as HTMLTextAreaElement
		).value,
	).toBe("Черновик");
	fireEvent.click(screen.getByRole("button", { name: /^Alpha/ }));
	fireEvent.click(
		screen.getAllByRole("button", { name: "Редактировать бонус" })[0],
	);
	fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
	expect(
		(screen.getByPlaceholderText("Название бонуса") as HTMLInputElement).value,
	).toBe("");
	expect(screen.getByRole("button", { name: "Добавить бонус" })).toBeTruthy();
});

it("keeps freshness form state through language changes and updates only the selected bonus", async () => {
	await openPage();
	fireEvent.click(
		screen.getAllByRole("button", { name: "Настроить актуальность" })[0],
	);
	fireEvent.change(screen.getByLabelText("Действует по"), {
		target: { value: "2030-12-31" },
	});
	fireEvent.change(screen.getByLabelText("Следующая проверка"), {
		target: { value: "2030-12-01" },
	});
	fireEvent.change(screen.getByLabelText("Ответственный"), {
		target: { value: "Reviewer" },
	});
	fireEvent.click(screen.getByRole("button", { name: "DE" }));
	expect(
		(screen.getByLabelText("Ответственный") as HTMLInputElement).value,
	).toBe("Reviewer");
	fireEvent.click(screen.getByRole("button", { name: "Условия проверены" }));
	const bonuses = useBonusStore.getState().projects[0].bonuses;
	expect(bonuses.find((bonus) => bonus.id === "first")).toMatchObject({
		validUntil: "2030-12-31",
		reviewDue: "2030-12-01",
		responsible: "Reviewer",
		checkedAt: expect.any(String),
	});
	expect(
		bonuses.find((bonus) => bonus.id === "second")!.responsible,
	).toBeUndefined();
	expect(screen.queryByLabelText("Ответственный")).toBeNull();
});

it("keeps editing disabled for read-only Support while copying stays available", async () => {
	mock.canEdit = false;
	await openPage(false);
	for (const button of screen.getAllByRole("button", {
		name: "Редактировать бонус",
	}))
		expect((button as HTMLButtonElement).disabled).toBe(true);
	expect(
		(
			screen
				.getByPlaceholderText("Название бонуса")
				.closest("fieldset") as HTMLFieldSetElement
		).disabled,
	).toBe(true);
	expect(
		screen.queryByRole("button", { name: "Настроить актуальность" }),
	).toBeNull();
	expect((screen.getByText("Импорт") as HTMLButtonElement).style.display).toBe(
		"none",
	);
	fireEvent.click(screen.getAllByRole("button", { name: "Копировать" })[0]);
	await waitFor(() => expect(mock.copy).toHaveBeenCalledWith("Первый бонус"));
});

it.each([
	"upsert",
	"replace",
] as const)("preserves the import preview and existing %s action", async (mode) => {
	await openPage();
	fireEvent.click(screen.getByRole("button", { name: "Импорт" }));
	const source = screen.getByPlaceholderText(
		/Вставьте ссылку на Google-таблицу/,
	);
	fireEvent.change(source, {
		target: { value: "https://docs.google.com/test" },
	});
	const modeSelect = screen.getByRole("option", { name: "Добавить и обновить" })
		.parentElement!;
	fireEvent.change(modeSelect, { target: { value: mode } });
	fireEvent.click(screen.getByRole("button", { name: "Предпросмотр" }));
	await screen.findByText("Проверьте источник");
	fireEvent.click(screen.getByRole("button", { name: "Импорт" }));
	fireEvent.click(screen.getByRole("button", { name: "Импорт" }));
	expect(
		(
			screen.getByPlaceholderText(
				/Вставьте ссылку на Google-таблицу/,
			) as HTMLTextAreaElement
		).value,
	).toBe("https://docs.google.com/test");
	fireEvent.click(screen.getByRole("button", { name: "Применить импорт" }));
	expect(mock.preview).toHaveBeenCalledWith("https://docs.google.com/test");
	expect(
		useBonusStore.getState().projects.map((project) => project.id),
	).toEqual(mode === "replace" ? ["beta"] : ["alpha", "beta"]);
	expect(screen.queryByRole("button", { name: "Предпросмотр" })).toBeNull();
});

it("requires the existing confirmation dialog before deleting a bonus", async () => {
	await openPage();
	fireEvent.click(screen.getAllByRole("button", { name: "Удалить бонус" })[0]);
	expect(useBonusStore.getState().projects[0].bonuses).toHaveLength(2);
	fireEvent.keyDown(document, { key: "Escape" });
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getAllByRole("button", { name: "Удалить бонус" })[0]);
	fireEvent.click(
		within(screen.getByRole("dialog", { name: "Удалить бонус?" })).getByRole(
			"button",
			{ name: "Удалить" },
		),
	);
	expect(
		useBonusStore.getState().projects[0].bonuses.map((bonus) => bonus.id),
	).toEqual(["second"]);
});
