import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { useKnowledgeStore } from "@/store/knowledge.store";
import { can } from "../../../shared/access.js";
export function SelectionActions() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const access = useAuthStore((s) => s.session?.user.access);
	const [selection, setSelection] = useState<{
		text: string;
		x: number;
		y: number;
	} | null>(null);
	useEffect(() => {
		const update = () => {
			const selected = window.getSelection();
			const parent = selected?.anchorNode?.parentElement;
			const text = selected?.toString().trim() ?? "";
			if (
				pathname !== "/" ||
				!parent?.closest(".workspace-main") ||
				parent.closest("input,textarea,[contenteditable],a,button") ||
				!text ||
				text.length > 5000 ||
				!selected?.rangeCount
			) {
				setSelection(null);
				return;
			}
			const rect = selected.getRangeAt(0).getBoundingClientRect();
			setSelection({
				text,
				x: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
				y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 120)),
			});
		};
		document.addEventListener("selectionchange", update);
		return () => document.removeEventListener("selectionchange", update);
	}, [pathname]);
	if (!selection || !can(access, "binds.read")) return null;
	return (
		<div
			className="ui-actions items-center fixed z-30 flex max-w-[calc(100vw-16px)] flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 shadow-lg"
			style={{ left: selection.x, top: selection.y }}
		>
			{can(access, "tools") &&
				[
					["translate", "Перевести"],
					["rewrite", "Переписать"],
					["check", "Проверить"],
				].map(([mode, label]) => (
					<button
						type="button"
						key={mode}
						className="min-h-10 px-2 text-xs"
						onPointerDown={(e) => e.preventDefault()}
						onClick={() => {
							window.dispatchEvent(
								new CustomEvent("supportos:compose-selection", {
									detail: { text: selection.text, mode },
								}),
							);
							setSelection(null);
						}}
					>
						{label}
					</button>
				))}
			<button
				type="button"
				className="min-h-10 px-2 text-xs"
				onPointerDown={(e) => e.preventDefault()}
				onClick={() => {
					useKnowledgeStore.getState().setSearch(selection.text);
					window.dispatchEvent(
						new KeyboardEvent("keydown", { code: "KeyK", ctrlKey: true }),
					);
					setSelection(null);
				}}
			>
				Найти
			</button>
			<button
				type="button"
				aria-label="Закрыть действия выделения"
				className="min-h-10 px-2"
				onClick={() => setSelection(null)}
			>
				×
			</button>
		</div>
	);
}
