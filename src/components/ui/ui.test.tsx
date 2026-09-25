// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
	Badge,
	Button,
	Field,
	IconButton,
	Input,
	Panel,
	Select,
	Tabs,
	Textarea,
} from "./index";

it("uses the shared button classes and disables actions while loading", () => {
	render(
		<>
			<Button variant="primary" loading>
				Сохранить
			</Button>
			<IconButton label="Закрыть">×</IconButton>
		</>,
	);
	const button = screen.getByRole("button", { name: /сохранить/i });
	expect((button as HTMLButtonElement).disabled).toBe(true);
	expect(button.getAttribute("aria-busy")).toBe("true");
	expect(button.classList.contains("ui-button")).toBe(true);
	expect(button.classList.contains("ui-button--primary")).toBe(true);
	expect(screen.getByRole("button", { name: "Закрыть" }).classList.contains("ui-button--icon")).toBe(true);
});

it("forwards native field behavior and preserves SupportOS classes", () => {
	render(
		<>
			<Field label="Имя" description="Видно в профиле" error="Обязательное поле">
				<Input aria-label="Имя" disabled />
			</Field>
			<Textarea aria-label="Описание" defaultValue="Текст" />
			<Select aria-label="Роль" defaultValue="support">
				<option value="support">Support</option>
			</Select>
		</>,
	);
	const input = screen.getByLabelText("Имя") as HTMLInputElement;
	expect(input.disabled).toBe(true);
	expect(input.classList.contains("ui-input")).toBe(true);
	expect(screen.getByText("Обязательное поле").getAttribute("role")).toBe("alert");
	expect((screen.getByLabelText("Описание") as HTMLTextAreaElement).value).toBe("Текст");
	expect((screen.getByLabelText("Роль") as HTMLSelectElement).value).toBe("support");
});

it("reports tab changes and renders panel and badge wrappers", () => {
	const onValueChange = vi.fn();
	render(
		<>
			<Tabs
				ariaLabel="Разделы"
				value="one"
				onValueChange={onValueChange}
				items={[
					{ value: "one", label: "Первый" },
					{ value: "two", label: "Второй" },
				]}
			/>
			<Panel data-testid="panel">Содержимое</Panel>
			<Badge>Новый</Badge>
		</>,
	);
	fireEvent.click(screen.getByRole("tab", { name: "Второй" }));
	expect(onValueChange).toHaveBeenCalledWith("two");
	expect(screen.getByRole("tab", { name: "Первый" }).getAttribute("aria-selected")).toBe("true");
	expect(screen.getByTestId("panel").classList.contains("border")).toBe(true);
	expect(screen.getByTestId("panel").classList.contains("bg-surface")).toBe(true);
	expect(screen.getByText("Новый").classList.contains("rounded-full")).toBe(true);
});
