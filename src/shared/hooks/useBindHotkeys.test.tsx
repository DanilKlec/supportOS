// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBindHotkeys } from "./useBindHotkeys";

afterEach(() => {
	cleanup();
	window.getSelection()?.removeAllRanges();
});

function setup() {
	const actions = {
		enabled: true,
		copy: vi.fn(),
		edit: vi.fn(),
		duplicate: vi.fn(),
		favorite: vi.fn(),
		pin: vi.fn(),
		languages: ["ru", "en"],
		language: "ru",
		setLanguage: vi.fn(),
	};
	const hook = renderHook((options) => useBindHotkeys(options), {
		initialProps: actions,
	});
	return { actions, ...hook };
}

function press(code: string, modifiers: KeyboardEventInit = {}) {
	const event = new KeyboardEvent("keydown", {
		code,
		bubbles: true,
		cancelable: true,
		...modifiers,
	});
	fireEvent(window, event);
	return event;
}

it.each([
	{},
	{ ctrlKey: true },
	{ metaKey: true },
])("copies with C/Ctrl+C/Meta+C using the physical key across layouts (%j)", (modifiers) => {
	const { actions } = setup();
	expect(press("KeyC", { key: "с", ...modifiers }).defaultPrevented).toBe(true);
	expect(actions.copy).toHaveBeenCalledTimes(1);
});

it("retains edit, duplicate, favorite, pin and language shortcuts", () => {
	const { actions } = setup();
	for (const [code, action] of [
		["KeyE", actions.edit],
		["KeyD", actions.duplicate],
		["KeyF", actions.favorite],
		["KeyP", actions.pin],
	] as const) {
		expect(press(code).defaultPrevented).toBe(true);
		expect(action).toHaveBeenCalledTimes(1);
	}
	press("ArrowRight");
	press("ArrowLeft");
	expect(actions.setLanguage.mock.calls).toEqual([["en"], ["en"]]);
});

it.each([
	"KeyD",
	"KeyE",
	"KeyF",
	"KeyP",
	"ArrowRight",
])("preserves native Ctrl/Meta combinations for %s", (code) => {
	const { actions } = setup();
	expect(press(code, { ctrlKey: true }).defaultPrevented).toBe(false);
	expect(press(code, { metaKey: true }).defaultPrevented).toBe(false);
	for (const action of [
		actions.edit,
		actions.duplicate,
		actions.favorite,
		actions.pin,
		actions.setLanguage,
	])
		expect(action).not.toHaveBeenCalled();
});

it("does not replace native copying of selected text", () => {
	const { actions } = setup();
	const content = render(<p>Выделенный фрагмент</p>);
	const range = document.createRange();
	range.selectNodeContents(content.container);
	window.getSelection()?.addRange(range);
	expect(press("KeyC", { ctrlKey: true }).defaultPrevented).toBe(false);
	expect(actions.copy).not.toHaveBeenCalled();
});

it("ignores inputs, textareas, selects and contenteditable including nested targets", () => {
	const { actions } = setup();
	const fields = render(
		<>
			<input aria-label="Поле" />
			<textarea aria-label="Текст" />
			<select aria-label="Язык">
				<option>Русский</option>
			</select>
			<div contentEditable="plaintext-only" suppressContentEditableWarning>
				<span>Редактор</span>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: Exercise custom editor targets as well as native inputs. */}
			<div role="textbox" tabIndex={0}>
				Редактор с ролью
			</div>
		</>,
	);
	for (const field of fields.container.querySelectorAll<HTMLElement>(
		"input,textarea,select,[contenteditable],[role=textbox]",
	)) {
		field.focus();
		fireEvent.keyDown(field, { code: "KeyC", ctrlKey: true });
		press("KeyC", { ctrlKey: true });
		press("KeyE");
	}
	(document.activeElement as HTMLElement).blur();
	fireEvent.keyDown(fields.getByText("Редактор"), { code: "KeyD" });
	expect(actions.copy).not.toHaveBeenCalled();
	expect(actions.edit).not.toHaveBeenCalled();
	expect(actions.duplicate).not.toHaveBeenCalled();
});

it.each([
	{ repeat: true },
	{ altKey: true },
	{ shiftKey: true },
])("ignores repeated or alternate gestures (%j)", (modifiers) => {
	const { actions } = setup();
	expect(press("KeyC", modifiers).defaultPrevented).toBe(false);
	expect(actions.copy).not.toHaveBeenCalled();
});

it.each([
	"dialog",
	"menu",
	"listbox",
])("does not fire behind an open %s", (role) => {
	const { actions } = setup();
	render(
		role === "dialog" ? (
			<div role="dialog" aria-modal="true" />
		) : (
			<div role={role} />
		),
	);
	expect(press("KeyC", { ctrlKey: true }).defaultPrevented).toBe(false);
	expect(press("KeyE").defaultPrevented).toBe(false);
	expect(actions.copy).not.toHaveBeenCalled();
	expect(actions.edit).not.toHaveBeenCalled();
});

it("does not invoke absent actions, and uses the current callbacks without leaked listeners", () => {
	const { actions, rerender, unmount } = setup();
	const nextCopy = vi.fn();
	rerender({ ...actions, copy: nextCopy });
	press("KeyC");
	expect(nextCopy).toHaveBeenCalledTimes(1);
	expect(actions.copy).not.toHaveBeenCalled();
	rerender({ ...actions, enabled: false });
	expect(press("KeyC").defaultPrevented).toBe(false);
	unmount();
	press("KeyC");
	expect(actions.copy).not.toHaveBeenCalled();
	cleanup();
	renderHook(() => useBindHotkeys({ ...actions, duplicate: undefined }));
	expect(press("KeyD").defaultPrevented).toBe(false);
});
