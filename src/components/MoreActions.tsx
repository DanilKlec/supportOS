import { useEffect, useRef, type ReactNode } from "react";
export function MoreActions({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		const outside = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node) && ref.current)
				ref.current.open = false;
		};
		const escape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && ref.current?.open) {
				e.stopPropagation();
				ref.current.open = false;
				ref.current.querySelector("summary")?.focus();
			}
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", escape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", escape);
		};
	}, []);
	return (
		<details ref={ref} className="relative">
			<summary className="cursor-pointer list-none rounded-xl border border-border px-3 py-2 text-xs">
				Ещё ···
			</summary>
			<div
				className="absolute right-0 top-full z-20 mt-2 flex w-64 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-xl"
				onClick={(e) => {
					if (
						(e.target as HTMLElement).closest("button:not(:disabled)") &&
						ref.current
					)
						ref.current.open = false;
				}}
			>
				{children}
			</div>
		</details>
	);
}
