import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import type { Bind } from "@/entities/bind";
import { useKnowledgeStore } from "@/store";

import { BaseModal } from "./BaseModal";
import { getBindTitle, getBindTranslation } from "./knowledge-modal-helpers";
import type { ModalPayload } from "./modal.types";

export function FindDuplicatesModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const language = useKnowledgeStore((state) => state.language);
	const binds = useKnowledgeStore((state) => state.binds);
	const openBind = useKnowledgeStore((state) => state.openBind);
	const target = payload.bindId
		? binds.find((bind) => bind.id === payload.bindId)
		: undefined;
	const duplicates = useMemo(
		() => getDuplicateCandidates(binds, language, target),
		[binds, language, target],
	);

	const openCandidate = (id: string) => {
		openBind(id);
		void navigate({ to: "/" });
		onClose();
	};

	return (
		<BaseModal title="Найти дубликаты" onClose={onClose} size="lg">
			<div className="space-y-3">
				{duplicates.length === 0 ? (
					<p className="text-sm text-muted">Дубликаты не найдены</p>
				) : (
					duplicates.map((bind) => (
						<button
							key={bind.id}
							type="button"
							onClick={() => openCandidate(bind.id)}
							className="block w-full rounded-md border border-border bg-background p-3 text-left hover:bg-surface-elevated"
						>
							<div className="truncate text-sm font-semibold">
								{getBindTitle(bind, language)}
							</div>
							<div className="mt-1 truncate text-xs text-muted">
								{bind.slug}
								{bind.tags.length > 0 ? ` - ${bind.tags.join(", ")}` : ""}
							</div>
						</button>
					))
				)}
			</div>
		</BaseModal>
	);
}

function normalizeDuplicateText(value: string) {
	return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getDuplicateCandidates(
	binds: Bind[],
	language: string,
	target?: Bind,
) {
	const visibleBinds = binds.filter((bind) => !bind.archived);

	if (target) {
		const targetTranslation = getBindTranslation(target, language);
		const targetContent = normalizeDuplicateText(
			targetTranslation?.content ?? "",
		);
		const targetTitle = normalizeDuplicateText(targetTranslation?.title ?? "");

		return visibleBinds
			.filter((bind) => bind.id !== target.id)
			.filter((bind) =>
				bind.translations.some((translation) => {
					const content = normalizeDuplicateText(translation.content);
					const title = normalizeDuplicateText(translation.title);

					return (
						(targetContent && content === targetContent) ||
						(targetTitle && title === targetTitle)
					);
				}),
			);
	}

	const seen = new Map<string, string>();
	const duplicateIds = new Set<string>();

	for (const bind of visibleBinds) {
		for (const translation of bind.translations) {
			const content = normalizeDuplicateText(translation.content);

			if (!content) continue;

			const previousId = seen.get(content);

			if (previousId) {
				duplicateIds.add(previousId);
				duplicateIds.add(bind.id);
			} else {
				seen.set(content, bind.id);
			}
		}
	}

	return visibleBinds.filter((bind) => duplicateIds.has(bind.id));
}
