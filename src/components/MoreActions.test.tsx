// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MoreActions } from "./MoreActions";

it("closes on Escape, outside click and action selection", async () => {
	render(
		<MoreActions>
			<button type="button">История</button>
		</MoreActions>,
	);
	const summary = screen.getByLabelText("Действия бинда"),
		details = summary.parentElement as HTMLDetailsElement;
	details.open = true;
	fireEvent.keyDown(document, { key: "Escape" });
	expect(details.open).toBe(false);
	expect(document.activeElement).toBe(summary);
	details.open = true;
	fireEvent.pointerDown(document.body);
	expect(details.open).toBe(false);
	details.open = true;
	fireEvent.click(await screen.findByText("История"));
	expect(details.open).toBe(false);
	cleanup();
});
