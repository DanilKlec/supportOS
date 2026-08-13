import { useNavigate } from "@tanstack/react-router";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";

import type { Bind } from "#/entities/bind";
import { answerAssistantService } from "#/services/answer-assistant.service";
import { useToast } from "#/shared/hooks/useToast";
import { setBindDragData } from "#/shared/lib/bind-drag";
import { copyToClipboard } from "#/shared/lib/clipboard";
import { modalManager } from "#/shared/modals/modal.store";
import { useKnowledgeStore } from "#/store";

interface BindCardProps {
	bind: Bind;
}

function getBindTitle(bind: Bind, language: string) {
	return (
		bind.translations.find((translation) => translation.language === language)
			?.title ??
		bind.translations.find((translation) => translation.language === "ru")
			?.title ??
		bind.translations.find((translation) => translation.language === "en")
			?.title ??
		bind.slug
	);
}

function getBindContent(bind: Bind, language: string) {
	return (
		bind.translations.find((translation) => translation.language === language)
			?.content ??
		bind.translations[0]?.content ??
		""
	);
}

function getCopyWarningTitle(content: string, title: string, language: string) {
	const assistantData = answerAssistantService.load();
	const issues = answerAssistantService.checkAnswer({
		answer: content,
		customerMessage: title,
		glossary: assistantData.glossary,
		language,
	});
	const importantWarnings = new Set([
		"placeholders",
		"promise",
		"glossary",
		"length",
	]);

	return issues.find(
		(issue) => issue.severity === "error" || importantWarnings.has(issue.id),
	)?.title;
}

export function BindCard({ bind }: BindCardProps) {
	const navigate = useNavigate();
	const language = useKnowledgeStore((state) => state.language);
	const openBind = useKnowledgeStore((state) => state.openBind);
	const addRecent = useKnowledgeStore((state) => state.addRecent);
	const [dragging, setDragging] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const { showToast } = useToast();
	const title = getBindTitle(bind, language);
	const content = getBindContent(bind, language);

	const copy = async () => {
		const warningTitle = getCopyWarningTitle(content, title, language);
		const ok = await copyToClipboard(content);

		addRecent(bind.id);
		showToast(
			ok
				? warningTitle
					? `Copied. Check: ${warningTitle}`
					: "Copied to clipboard"
				: "Copy failed",
		);
	};

	const handleDragStart = (event: DragEvent<HTMLElement>) => {
		setBindDragData(event.dataTransfer, bind.id);
		setDragging(true);
	};

	useEffect(() => {
		if (!menuOpen) return;

		const closeMenu = (event: MouseEvent) => {
			if (menuRef.current?.contains(event.target as Node)) return;
			setMenuOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuOpen(false);
		};

		document.addEventListener("mousedown", closeMenu);
		document.addEventListener("keydown", closeOnEscape);

		return () => {
			document.removeEventListener("mousedown", closeMenu);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [menuOpen]);

	return (
		<article
			draggable
			onDragStart={handleDragStart}
			onDragEnd={() => setDragging(false)}
			className={`group cursor-grab rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/30 active:cursor-grabbing ${
				dragging ? "opacity-50" : ""
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<button
					type="button"
					onClick={() => {
						openBind(bind.id);
						void navigate({ to: "/" });
					}}
					className="min-w-0 flex-1 text-left"
				>
					<h3 className="truncate text-sm font-semibold text-foreground">
						{title}
					</h3>
					<p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">
						{content || bind.slug || "No content"}
					</p>
				</button>

				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={copy}
						title="Copy"
						className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
					>
						<Copy size={16} />
					</button>

					<div ref={menuRef} className="relative">
						<button
							type="button"
							onClick={() => setMenuOpen((value) => !value)}
							title="More actions"
							aria-haspopup="menu"
							aria-expanded={menuOpen}
							className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
						>
							<MoreHorizontal size={16} />
						</button>

						{menuOpen && (
							<div
								role="menu"
								className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-2xl"
							>
								<button
									type="button"
									role="menuitem"
									onClick={() => {
										setMenuOpen(false);
										modalManager.open("editBind", { bindId: bind.id });
									}}
									className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
								>
									<Pencil size={15} />
									Edit
								</button>
								<button
									type="button"
									role="menuitem"
									onClick={() => {
										setMenuOpen(false);
										modalManager.open("deleteNode", {
											id: bind.id,
											type: "bind",
											name: title,
										});
									}}
									className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
								>
									<Trash2 size={15} />
									Delete
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			{bind.tags.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-2">
					{bind.tags.slice(0, 4).map((tag) => (
						<span
							key={tag}
							className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-muted"
						>
							#{tag}
						</span>
					))}
					{bind.tags.length > 4 && (
						<span className="rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-muted">
							+{bind.tags.length - 4}
						</span>
					)}
				</div>
			)}
		</article>
	);
}
