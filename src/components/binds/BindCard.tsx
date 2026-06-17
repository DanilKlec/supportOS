import { useNavigate } from "@tanstack/react-router";
import { Copy, Pencil, Trash2 } from "lucide-react";

import type { Bind } from "#/entities/bind";
import { useToast } from "#/shared/hooks/useToast";
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

export function BindCard({ bind }: BindCardProps) {
	const navigate = useNavigate();
	const language = useKnowledgeStore((state) => state.language);
	const openBind = useKnowledgeStore((state) => state.openBind);
	const addRecent = useKnowledgeStore((state) => state.addRecent);
	const { showToast } = useToast();
	const title = getBindTitle(bind, language);
	const content = getBindContent(bind, language);

	const copy = async () => {
		const ok = await copyToClipboard(content);

		addRecent(bind.id);
		showToast(ok ? "Copied to clipboard" : "Copy failed");
	};

	return (
		<article className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/30">
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
					<p className="mt-1 truncate text-xs text-muted">{bind.slug}</p>
				</button>

				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={copy}
						title="Copy"
						className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
					>
						<Copy size={16} />
					</button>

					<button
						type="button"
						onClick={() => modalManager.open("editBind", { bindId: bind.id })}
						title="Edit bind"
						className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
					>
						<Pencil size={16} />
					</button>

					<button
						type="button"
						onClick={() =>
							modalManager.open("deleteNode", {
								id: bind.id,
								type: "bind",
								name: title,
							})
						}
						title="Delete"
						className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-red-400"
					>
						<Trash2 size={16} />
					</button>
				</div>
			</div>

			{bind.tags.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-2">
					{bind.tags.map((tag) => (
						<span
							key={tag}
							className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-muted"
						>
							#{tag}
						</span>
					))}
				</div>
			)}

			<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
				{content || "No content"}
			</p>
		</article>
	);
}
