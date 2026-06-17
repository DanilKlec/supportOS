import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { z } from "zod";

import { BindList } from "#/components/binds/BindList";
import { modalManager } from "#/shared/modals/modal.store";
import { useKnowledgeStore } from "#/store";

const bindsSearchSchema = z.object({
	categoryId: z.string().optional(),
});

type BindsSearch = z.infer<typeof bindsSearchSchema>;

export const Route = createFileRoute("/binds")({
	validateSearch: (search: Record<string, unknown>): BindsSearch => ({
		categoryId: search.categoryId as string | undefined,
	}),
	component: BindsPage,
});

function BindsPage() {
	const { categoryId } = Route.useSearch();
	const binds = useKnowledgeStore((state) => state.binds);
	const visibleBinds = categoryId
		? binds.filter((bind) => bind.categoryId === categoryId && !bind.archived)
		: [];

	if (!categoryId) {
		return (
			<div className="flex h-full">
				<main className="flex flex-1 items-center justify-center">
					<p className="text-sm text-muted">
						Select a category from the left sidebar
					</p>
				</main>
			</div>
		);
	}

	return (
		<div className="flex h-full">
			<main className="flex-1 overflow-auto">
				<div className="mx-auto max-w-4xl p-6">
					<div className="mb-6 flex items-center justify-end">
						<button
							type="button"
							onClick={() => modalManager.open("createBind", { categoryId })}
							className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
						>
							<Plus size={16} />
							New
						</button>
					</div>

					<BindList binds={visibleBinds} />
				</div>
			</main>
		</div>
	);
}
