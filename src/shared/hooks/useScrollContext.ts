import { useLayoutEffect, type RefObject } from "react";
const positions = new Map<
	string,
	Record<string, { top: number; left: number }>
>();
export function useScrollContext(
	root: RefObject<HTMLElement | null>,
	key: string,
) {
	useLayoutEffect(() => {
		const host = root.current;
		if (!host) return;
		const saved = positions.get(key) ?? {};
		let restoring = true;
		let frame = 0;
		const address = (node: HTMLElement) => {
			const path: number[] = [];
			let current: Element | null = node;
			while (current && current !== host) {
				const parent: Element | null = current.parentElement;
				if (!parent) return "";
				path.unshift(Array.prototype.indexOf.call(parent.children, current));
				current = parent;
			}
			return path.join(".");
		};
		const restore = () => {
			for (const [path, value] of Object.entries(saved)) {
				let node: Element | undefined = host;
				for (const part of path.split(".").filter(Boolean))
					node = node?.children[Number(part)];
				if (node instanceof HTMLElement) {
					node.scrollTop = value.top;
					node.scrollLeft = value.left;
				}
			}
		};
		const capture = (e: Event) => {
			if (restoring || !(e.target instanceof HTMLElement)) return;
			saved[address(e.target)] = {
				top: e.target.scrollTop,
				left: e.target.scrollLeft,
			};
			positions.set(key, saved);
			if (positions.size > 80) positions.delete(positions.keys().next().value!);
		};
		const stop = () => {
			restoring = false;
			observer.disconnect();
		};
		const observer = new MutationObserver(() => {
			if (restoring) {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(restore);
			}
		});
		restore();
		observer.observe(host, { childList: true, subtree: true });
		const timer = setTimeout(stop, 1500);
		host.addEventListener("scroll", capture, true);
		host.addEventListener("wheel", stop, { passive: true });
		host.addEventListener("pointerdown", stop);
		host.addEventListener("keydown", stop);
		return () => {
			clearTimeout(timer);
			cancelAnimationFrame(frame);
			observer.disconnect();
			host.removeEventListener("scroll", capture, true);
			host.removeEventListener("wheel", stop);
			host.removeEventListener("pointerdown", stop);
			host.removeEventListener("keydown", stop);
		};
	}, [root, key]);
}
