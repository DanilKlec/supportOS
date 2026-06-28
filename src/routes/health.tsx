import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	Archive,
	CheckCircle2,
	Edit3,
	FileText,
	Folder,
	HeartPulse,
	Info,
	Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { getBindTitle } from "@/shared/lib/bind-search";
import {
	getKnowledgeHealthReport,
	type KnowledgeHealthIssue,
} from "@/shared/lib/knowledge-health";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

export const Route = createFileRoute("/health")({
	component: HealthPage,
});

const severityStyle = {
	critical: "border-red-500/30 bg-red-500/10 text-red-300",
	warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
	info: "border-border bg-background text-muted",
};

function getSeverityIcon(issue: KnowledgeHealthIssue) {
	if (issue.severity === "critical") return <AlertTriangle size={16} />;
	if (issue.severity === "warning") return <Info size={16} />;

	return <CheckCircle2 size={16} />;
}

function HealthPage() {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [severity, setSeverity] = useState<
		"all" | KnowledgeHealthIssue["severity"]
	>("all");
	const binds = useKnowledgeStore((state) => state.binds);
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const language = useKnowledgeStore((state) => state.language);
	const openBind = useKnowledgeStore((state) => state.openBind);
	const selectFolder = useKnowledgeStore((state) => state.selectFolder);
	const report = useMemo(
		() => getKnowledgeHealthReport({ binds, categories, folders }),
		[binds, categories, folders],
	);
	const visibleIssues = report.issues.filter((issue) => {
		const queryText = query.trim().toLowerCase();
		const severityMatches = severity === "all" || issue.severity === severity;

		if (!severityMatches) return false;
		if (!queryText) return true;

		return [issue.title, issue.description]
			.join(" ")
			.toLowerCase()
			.includes(queryText);
	});

	const openIssue = (issue: KnowledgeHealthIssue) => {
		if (issue.bindId) {
			openBind(issue.bindId);
			void navigate({ to: "/" });
			return;
		}

		if (issue.folderId) {
			selectFolder(issue.folderId);
			void navigate({ to: "/" });
		}
	};

	const editIssueBind = (bindId?: string) => {
		if (!bindId) return;

		modalManager.open("editBind", { bindId });
	};

	return (
		<div className="h-full overflow-auto bg-background">
			<div className="mx-auto w-full max-w-6xl p-6">
				<header className="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted">
							<HeartPulse size={14} />
							Knowledge health
						</div>
						<h1 className="text-3xl font-bold">Database check</h1>
						<p className="mt-2 max-w-2xl text-sm text-muted">
							Find duplicates, empty binds, missing translations and unused
							folders.
						</p>
					</div>

					<Link
						to="/archive"
						className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated"
					>
						<Archive size={16} />
						Open archive
					</Link>
				</header>

				<section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<HealthStat label="Active binds" value={report.stats.activeBinds} />
					<HealthStat label="Archived" value={report.stats.archivedBinds} />
					<HealthStat label="Duplicates" value={report.stats.duplicates} />
					<HealthStat
						label="Missing translations"
						value={report.stats.missingTranslations}
					/>
					<HealthStat label="Empty content" value={report.stats.emptyContent} />
					<HealthStat
						label="Unused folders"
						value={report.stats.unusedFolders}
					/>
					<HealthStat
						label="Orphaned binds"
						value={report.stats.orphanedBinds}
					/>
					<HealthStat label="Total issues" value={report.issues.length} />
				</section>

				<section className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 lg:flex-row lg:items-center">
					<div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
						<Search size={16} className="text-muted" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Filter issues"
							className="h-8 flex-1 bg-transparent text-sm outline-none"
						/>
					</div>

					<div className="flex flex-wrap gap-2">
						{(["all", "critical", "warning", "info"] as const).map((item) => (
							<button
								key={item}
								type="button"
								onClick={() => setSeverity(item)}
								className={`rounded-md border px-3 py-2 text-xs font-medium capitalize ${
									severity === item
										? "border-accent bg-accent text-accent-foreground"
										: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
								}`}
							>
								{item}
							</button>
						))}
					</div>
				</section>

				{visibleIssues.length === 0 ? (
					<div className="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted">
						No issues found
					</div>
				) : (
					<div className="space-y-3">
						{visibleIssues.map((issue) => {
							const bind = issue.bindId
								? binds.find((item) => item.id === issue.bindId)
								: undefined;
							const folder = issue.folderId
								? folders.find((item) => item.id === issue.folderId)
								: undefined;

							return (
								<div
									key={issue.id}
									className="rounded-lg border border-border bg-surface p-4"
								>
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span
													className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${severityStyle[issue.severity]}`}
												>
													{getSeverityIcon(issue)}
													{issue.severity}
												</span>
												<h2 className="truncate text-base font-semibold">
													{issue.title}
												</h2>
											</div>
											<p className="mt-2 text-sm text-muted">
												{issue.description}
											</p>
											{bind && (
												<div className="mt-2 flex items-center gap-2 text-xs text-muted">
													<FileText size={14} />
													<span className="truncate">
														{getBindTitle(bind, language)}
													</span>
												</div>
											)}
											{folder && (
												<div className="mt-2 flex items-center gap-2 text-xs text-muted">
													<Folder size={14} />
													<span className="truncate">{folder.name}</span>
												</div>
											)}
										</div>

										<div className="flex shrink-0 gap-2">
											{issue.bindId && (
												<button
													type="button"
													onClick={() => editIssueBind(issue.bindId)}
													className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-foreground"
													title="Edit bind"
												>
													<Edit3 size={15} />
												</button>
											)}
											{(issue.bindId || issue.folderId) && (
												<button
													type="button"
													onClick={() => openIssue(issue)}
													className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-elevated"
												>
													Open
												</button>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function HealthStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg border border-border bg-surface px-4 py-3">
			<div className="text-xs uppercase tracking-wider text-muted">{label}</div>
			<div className="mt-1 text-2xl font-semibold">{value}</div>
		</div>
	);
}
