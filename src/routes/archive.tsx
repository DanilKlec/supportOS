import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, FileText, RotateCcw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { getBindTitle, searchBinds } from "@/shared/lib/bind-search";
import { useKnowledgeStore } from "@/store";

export const Route = createFileRoute("/archive")({
	component: ArchivePage,
});

function ArchivePage() {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const [query, setQuery] = useState("");
	const binds = useKnowledgeStore((state) => state.binds);
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const language = useKnowledgeStore((state) => state.language);
	const archivedBinds = useMemo(
		() =>
			binds
				.filter((bind) => bind.archived)
				.sort(
					(first, second) =>
						new Date(second.updatedAt).getTime() -
						new Date(first.updatedAt).getTime(),
				),
		[binds],
	);
	const visibleBinds = query.trim()
		? searchBinds(archivedBinds, query, {
				categories,
				folders,
				language,
			})
		: archivedBinds;

	const restoreBind = (id: string) => {
		const restored = knowledgeService.restoreArchivedBind(id);

		if (restored) {
			showToast("Bind restored");
			void navigate({ to: "/" });
		}
	};

	const deleteForever = (id: string) => {
		if (!window.confirm("Delete this archived bind permanently?")) return;

		const deleted = knowledgeService.deleteManyBinds([id]);

		showToast(`${deleted.length} bind deleted`);
	};

	return (
		<div className="h-full overflow-auto bg-background">
			<div className="mx-auto w-full max-w-5xl p-6">
				<header className="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted">
							<Archive size={14} />
							Archive
						</div>
						<h1 className="text-3xl font-bold">Archived binds</h1>
						<p className="mt-2 max-w-2xl text-sm text-muted">
							Restore old binds or remove items you no longer need.
						</p>
					</div>

					<div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
						<span className="text-2xl font-semibold">
							{archivedBinds.length}
						</span>
						<span className="ml-2 text-muted">archived</span>
					</div>
				</header>

				<div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
					<Search size={16} className="text-muted" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search archive"
						className="h-9 flex-1 bg-transparent text-sm outline-none"
					/>
				</div>

				{visibleBinds.length === 0 ? (
					<div className="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted">
						Nothing in archive
					</div>
				) : (
					<div className="space-y-3">
						{visibleBinds.map((bind) => (
							<div
								key={bind.id}
								className="rounded-lg border border-border bg-surface p-4"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<FileText size={16} className="shrink-0 text-muted" />
											<h2 className="truncate text-base font-semibold">
												{getBindTitle(bind, language)}
											</h2>
										</div>
										<div className="mt-1 truncate text-xs text-muted">
											{bind.slug}
											{bind.tags.length > 0 ? ` - ${bind.tags.join(", ")}` : ""}
										</div>
										<div className="mt-2 line-clamp-2 text-sm text-muted">
											{bind.translations[0]?.content || "No content"}
										</div>
									</div>

									<div className="flex shrink-0 gap-2">
										<button
											type="button"
											onClick={() => restoreBind(bind.id)}
											className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-elevated"
										>
											<RotateCcw size={15} />
											Restore
										</button>
										<button
											type="button"
											onClick={() => deleteForever(bind.id)}
											className="rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
											title="Delete forever"
										>
											<Trash2 size={15} />
										</button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
