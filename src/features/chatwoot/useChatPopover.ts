import { useEffect, useRef } from "react";

export function useChatPopover<T extends HTMLElement>(
	open: boolean,
	close: () => void,
) {
	const container = useRef<T>(null);
	const dismiss = useRef(close);
	dismiss.current = close;

	useEffect(() => {
		if (!open) return;
		const onOutside = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!container.current?.contains(event.target)
			)
				dismiss.current();
		};
		const onEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			event.preventDefault();
			dismiss.current();
			container.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus();
		};
		document.addEventListener("pointerdown", onOutside);
		document.addEventListener("keydown", onEscape);
		return () => {
			document.removeEventListener("pointerdown", onOutside);
			document.removeEventListener("keydown", onEscape);
		};
	}, [open]);

	return container;
}
