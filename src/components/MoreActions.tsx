import { type ReactNode, useEffect, useRef, useState } from "react";
import { ActionMenuPortal } from "./ActionMenuPortal";
export function MoreActions({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDetailsElement>(null),
		[open, setOpen] = useState(false);
	const close = () => {
		if (ref.current) ref.current.open = false;
		setOpen(false);
	};
	useEffect(() => {
		const outside = (e: PointerEvent) => {
			if (
				e.target instanceof Element &&
				e.target.closest("[data-workspace-actions]")
			)
				return;
			if (!ref.current?.contains(e.target as Node)) {
				if (ref.current) ref.current.open = false;
				setOpen(false);
			}
		};
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && ref.current?.open) {
				ref.current.open = false;
				setOpen(false);
				ref.current.querySelector("summary")?.focus();
			}
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, []);
	return (
		<details
			ref={ref}
			className="relative shrink-0"
			onToggle={(e) => setOpen(e.currentTarget.open)}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					close();
					ref.current?.querySelector("summary")?.focus();
				}
			}}
			onClick={(e) => {
				if (
					e.target instanceof Element &&
					e.target.closest("button:not(:disabled)")
				)
					close();
			}}
		>
			<summary
				aria-label="Действия бинда"
				aria-haspopup="menu"
				className="ui-button ui-button--secondary list-none"
			>
				<span aria-hidden="true" className="text-lg leading-none">
					···
				</span>
				<span className="">Действия</span>
			</summary>
			{open && <ActionMenuPortal anchor={ref}>{children}</ActionMenuPortal>}
		</details>
	);
}
