import {
	type ReactNode,
	type RefObject,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

/** Escape scrolling/overflow ancestors, keeping the menu inside the viewport. */
export function ActionMenuPortal({
	anchor,
	children,
}: {
	anchor: RefObject<HTMLElement | null>;
	children: ReactNode;
}) {
	const menu = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ left: 8, top: 8 });
	useLayoutEffect(() => {
		const place = () => {
			const rect = anchor.current?.getBoundingClientRect();
			if (!rect) return;
			const height = menu.current?.offsetHeight ?? 0;
			const width = Math.min(256, window.innerWidth - 16);
			setPosition({
				left: Math.max(
					8,
					Math.min(rect.right - width, window.innerWidth - width - 8),
				),
				top: Math.max(
					8,
					Math.min(rect.bottom + 4, window.innerHeight - height - 8),
				),
			});
		};
		place();
		window.addEventListener("resize", place);
		window.addEventListener("scroll", place, true);
		menu.current
			?.querySelector<HTMLButtonElement>("button:not(:disabled)")
			?.focus();
		return () => {
			window.removeEventListener("resize", place);
			window.removeEventListener("scroll", place, true);
		};
	}, [anchor]);
	return createPortal(
		<div
			ref={menu}
			role="menu"
			data-workspace-actions
			className="fixed z-[100] max-h-[calc(100dvh-16px)] w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl"
			style={position}
			onKeyDown={(event) => {
				if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
					return;
				event.preventDefault();
				const items = Array.from(
					menu.current?.querySelectorAll<HTMLButtonElement>(
						"button:not(:disabled)",
					) ?? [],
				);
				const index = items.indexOf(
					document.activeElement as HTMLButtonElement,
				);
				items[
					event.key === "Home"
						? 0
						: event.key === "End"
							? items.length - 1
							: (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
								items.length
				]?.focus();
			}}
		>
			{children}
		</div>,
		document.body,
	);
}
