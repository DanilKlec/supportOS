import { FileText, Plus, Search } from "lucide-react";

import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

export function EmptyWorkspace() {
	const categories = useKnowledgeStore((state) => state.categories);
	const selectedCategory = useKnowledgeStore((state) => state.selectedCategory);
	const selectedFolder = useKnowledgeStore((state) => state.selectedFolder);
	const folders = useKnowledgeStore((state) => state.folders);
	const setSearch = useKnowledgeStore((state) => state.setSearch);

	const createBind = () => {
		const categoryId = selectedCategory ?? categories[0]?.id;

		if (!categoryId) {
			modalManager.open("createCategory");
			return;
		}

		const folder = folders.find((item) => item.id === selectedFolder);

		modalManager.open("createBind", {
			categoryId,
			folderId: folder?.categoryId === categoryId ? folder.id : undefined,
		});
	};

	return (
		<div className="flex flex-1 items-center justify-center px-4 py-10">
			<div className="w-full max-w-md text-center">
				<SupportOSLogo className="mx-auto mb-5 h-12 w-12" />

				<div className="text-xl font-semibold">Ready for the next answer</div>
				<p className="mt-2 text-sm leading-6 text-muted">
					Find a material, open it, and copy the prepared reply in one step.
				</p>

				<div className="mt-6 grid gap-2 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => {
							setSearch("");
							window.dispatchEvent(
								new KeyboardEvent("keydown", {
									code: "KeyK",
									ctrlKey: true,
								}),
							);
						}}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
					>
						<Search size={17} />
						Search
					</button>

					<button
						type="button"
						onClick={createBind}
						className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
					>
						<Plus size={17} />
						New material
					</button>
				</div>

				<div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
					<FileText size={14} />
					<span>Use the sidebar for categories, folders and favorites.</span>
				</div>
			</div>
		</div>
	);
}
