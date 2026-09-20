import { useNavigate } from "@tanstack/react-router";
import { Copy, Pencil } from "lucide-react";
import { type DragEvent, useState } from "react";
import type { Bind } from "#/entities/bind";
import { answerAssistantService } from "#/services/answer-assistant.service";
import { useToast } from "#/shared/hooks/useToast";
import { setBindDragData } from "#/shared/lib/bind-drag";
import { copyToClipboard } from "#/shared/lib/clipboard";
import { modalManager } from "#/shared/modals/modal.store";
import { useKnowledgeStore } from "#/store";
import { MoreActions } from "@/components/MoreActions";
import { LocalBindActions } from "./LocalBindActions";

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
					? `Скопировано. Проверьте: ${warningTitle}`
					: "Скопировано"
				: "Не удалось скопировать",
		);
	};

	const handleDragStart = (event: DragEvent<HTMLElement>) => {
		setBindDragData(event.dataTransfer, bind.id);
		setDragging(true);
	};

	return (
		<article
			draggable
			onDragStart={handleDragStart}
			onDragEnd={() => setDragging(false)}
			className={`rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/30 ${dragging ? "opacity-50" : ""}`}
		>
			<div className="flex items-start gap-3">
				<button
					type="button"
					onClick={() => {
						openBind(bind.id);
						void navigate({ to: "/" });
					}}
					className="min-w-0 flex-1 text-left"
				>
					<h3 className="truncate text-sm font-semibold">{title}</h3>
					<p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">
						{content || bind.slug || "Нет текста"}
					</p>
				</button>
				<button
					type="button"
					onClick={copy}
					title="Копировать"
					className="shell-button"
				>
					<Copy size={16} />
				</button>
				<MoreActions>
					<button
						type="button"
						className="action-menu-item"
						onClick={() => modalManager.open("editBind", { bindId: bind.id })}
					>
						<Pencil size={16} />
						Редактировать
					</button>
					<LocalBindActions bind={bind} />
				</MoreActions>
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
						<span className="text-xs text-muted">+{bind.tags.length - 4}</span>
					)}
				</div>
			)}
		</article>
	);
}
