// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	Link: ({
		children,
		to,
		hash,
		...props
	}: {
		children: ReactNode;
		to: string;
		hash: string;
	}) => (
		<a href={`${to}#${hash}`} {...props}>
			{children}
		</a>
	),
}));

import { SectionNavigation } from "./SectionNavigation";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
const items = Array.from({ length: 7 }, (_, index) => ({
	label: `Страница ${index}`,
	to: "/admin",
	hash: `section-${index}`,
}));
it("limits visible links and keeps the active secondary page selected", () => {
	render(<SectionNavigation label="Раздел" items={items} active={items[5]} />);
	expect(screen.getAllByRole("link")).toHaveLength(4);
	const more = screen.getByLabelText("Ещё: Раздел") as HTMLSelectElement;
	expect(more.value).toBe("/admin#section-5");
	fireEvent.change(more, { target: { value: "/admin#section-6" } });
	expect(navigate).toHaveBeenCalledWith({ to: "/admin", hash: "section-6" });
});
it("mobile selector reaches every allowed destination, including the main page", () => {
	render(
		<SectionNavigation
			label="Раздел"
			items={[{ label: "Обзор", to: "/content" }, ...items]}
			active={items[0]}
		/>,
	);
	const selector = screen.getByLabelText(
		"Страница: Раздел",
	) as HTMLSelectElement;
	expect(selector.options).toHaveLength(8);
	fireEvent.change(selector, { target: { value: "/content#" } });
	expect(navigate).toHaveBeenCalledWith({ to: "/content", hash: "" });
});
it("omits overflow when all destinations fit", () => {
	render(
		<SectionNavigation
			label="Раздел"
			items={items.slice(0, 2)}
			active={items[0]}
		/>,
	);
	expect(screen.queryByLabelText("Ещё: Раздел")).toBeNull();
});
