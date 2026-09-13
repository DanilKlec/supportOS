import { type ReactNode, useEffect, useRef } from "react";
export function MoreActions({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		const outside = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node) && ref.current)
				ref.current.open = false;
		};
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && ref.current?.open) {
				e.stopPropagation();
				ref.current.open = false;
				ref.current.querySelector("summary")?.focus();
			}
		};
		document.addEventListener("pointerdown", outside);
		const host = ref.current;
		const selected = (event: MouseEvent) => {
			if (
				event.target instanceof Element &&
				event.target.closest("button:not(:disabled)") &&
				host
			)
				host.open = false;
		};
		host?.addEventListener("click", selected);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", handleEscape);
			host?.removeEventListener("click", selected);
		};
	}, []);
	return (
		<details ref={ref} className="relative">
			<summary className="cursor-pointer list-none rounded-xl border border-border px-3 py-2 text-xs">
				Ещё ···
			</summary>
			<div className="absolute right-0 top-full z-20 mt-2 flex w-64 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-xl">
				{children}
			</div>
		</details>
	);
}
