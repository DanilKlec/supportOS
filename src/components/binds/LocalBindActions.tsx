import { Copy, FolderInput, Pin, Star, Trash2 } from "lucide-react";
import type { Bind } from "@/entities/bind";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

/** Library actions always address the linked local record, never a received version. */
export function LocalBindActions({ bind }: { bind: Bind }) {
	const pinned = useKnowledgeStore((s) => s.pinnedTabs.includes(bind.id));
	const favorite = useKnowledgeStore((s) => s.favorites.includes(bind.id));
	const { showToast } = useToast();
	const run = (action: () => unknown) => {
		try {
			action();
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Не удалось выполнить действие",
			);
		}
	};
	return (
		<>
			<button
				type="button"
				className="action-menu-item"
				onClick={() =>
					modalManager.open("moveBind", {
						bindId: bind.id,
						categoryId: bind.categoryId,
						folderId: bind.folderId,
					})
				}
			>
				<FolderInput size={16} />
				Переместить в папку
			</button>
			<button
				type="button"
				className="action-menu-item"
				onClick={() => run(() => knowledgeService.duplicateBind(bind.id))}
			>
				<Copy size={16} />
				Дублировать
			</button>
			<button
				type="button"
				className="action-menu-item"
				onClick={() => run(() => knowledgeService.toggleFavorite(bind.id))}
			>
				<Star size={16} />
				{favorite ? "Убрать из избранного" : "В избранное"}
			</button>
			<button
				type="button"
				className="action-menu-item"
				onClick={() => useKnowledgeStore.getState().togglePinnedTab(bind.id)}
			>
				<Pin size={16} />
				{pinned ? "Открепить вкладку" : "Закрепить вкладку"}
			</button>
			<button
				type="button"
				className="action-menu-item text-red-400"
				onClick={() =>
					modalManager.open("deleteNode", {
						id: bind.id,
						type: "bind",
						name: bind.translations[0]?.title ?? bind.slug,
					})
				}
			>
				<Trash2 size={16} />В архив
			</button>
		</>
	);
}
