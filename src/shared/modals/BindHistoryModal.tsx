import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { useKnowledgeStore } from "@/store";

import { BaseModal } from "./BaseModal";
import type { ModalPayload } from "./modal.types";

export function BindHistoryModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const { showToast } = useToast();
	const language = useKnowledgeStore((state) => state.language);
	const bind = useKnowledgeStore((state) =>
		payload.bindId ? state.getBind(payload.bindId) : undefined,
	);
	const history = bind?.history ?? [];

	if (!bind) {
		return (
			<BaseModal title="История" onClose={onClose}>
				<p className="text-sm text-muted">Bind was not found</p>
			</BaseModal>
		);
	}

	const restore = (historyId: string) => {
		knowledgeService.restoreBindHistory(bind.id, historyId);
		showToast("Версия восстановлена");
		onClose();
	};

	return (
		<BaseModal title="История" onClose={onClose} size="lg">
			<div className="space-y-3">
				{history.length === 0 ? (
					<p className="text-sm text-muted">Предыдущих версий пока нет</p>
				) : (
					history.map((entry) => {
						const translation =
							entry.translations.find((item) => item.language === language) ??
							entry.translations[0];

						return (
							<div
								key={entry.id}
								className="rounded-md border border-border bg-background p-3"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="truncate text-sm font-semibold">
											{translation?.title ?? entry.slug}
										</div>
										<div className="mt-1 text-xs text-muted">
											{new Date(entry.createdAt).toLocaleString()} -{" "}
											{entry.translations.length} languages
										</div>
									</div>

									<button
										type="button"
										onClick={() => restore(entry.id)}
										className="ui-button ui-button--secondary shrink-0 border border-border font-medium hover:bg-surface-elevated"
									>
										Restore
									</button>
								</div>

								<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
									{translation?.content ?? "Нет содержания"}
								</p>
							</div>
						);
					})
				)}
			</div>
		</BaseModal>
	);
}
