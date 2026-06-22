import { Link, useNavigate } from "@tanstack/react-router";
import {
	Contact,
	FileSpreadsheet,
	FileText,
	Gift,
	Plus,
	Star,
	Wrench,
} from "lucide-react";

import type { Bind } from "@/entities/bind";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

import { Tree } from "./Tree";

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

export function Sidebar() {
	const navigate = useNavigate();
	const tree = useKnowledgeStore((s) => s.tree);
	const binds = useKnowledgeStore((s) => s.binds);
	const favorites = useKnowledgeStore((s) => s.favorites);
	const language = useKnowledgeStore((s) => s.language);
	const openBind = useKnowledgeStore((s) => s.openBind);

	const favoriteBinds = favorites
		.map((id) => binds.find((bind) => bind.id === id))
		.filter((bind): bind is Bind => Boolean(bind));
	const createCategory = () => {
		modalManager.open("createCategory");
	};

	const renderBindShortcut = (bind: Bind) => (
		<button
			key={bind.id}
			type="button"
			onClick={() => {
				openBind(bind.id);
				void navigate({ to: "/" });
			}}
			className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-accent/10 hover:text-foreground"
		>
			<FileText size={14} className="shrink-0" />
			<span className="truncate">{getBindTitle(bind, language)}</span>
		</button>
	);

	return (
		<aside className="flex h-full w-72 flex-col border-r border-border bg-surface">
			<div className="shrink-0 border-b border-border px-3 py-3">
				<div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
					<Star size={13} />
					Favorites
				</div>

				{favoriteBinds.length > 0 ? (
					<div className="space-y-0.5">
						{favoriteBinds.map(renderBindShortcut)}
					</div>
				) : (
					<div className="px-2 text-xs text-muted">No favorites yet</div>
				)}
			</div>

			{/* <div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
						<Clock3 size={13} />
						Recent
					</div>

					{recentBinds.length > 0 ? (
						<div className="space-y-0.5">
							{recentBinds.map(renderBindShortcut)}
						</div>
					) : (
						<div className="px-2 text-xs text-muted">Nothing opened yet</div>
					)}
				</div> */}

			<div className="shrink-0 border-b border-border px-3 py-3">
				<div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
					Tools
				</div>

				<div className="space-y-0.5">
					{/* <Link
							to="/translator"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Languages size={14} />
							<span>Translator</span>
						</Link> */}

					{/* <Link
							to="/settings/translator"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Settings size={14} />
							<span>Translator Settings</span>
						</Link> */}

					<Link
						to="/import/google-sheets"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
					>
						<FileSpreadsheet size={14} />
						<span>Google Sheets Import</span>
					</Link>

					<Link
						to="/bonuses"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
					>
						<Gift size={14} />
						<span>Deposit Bonuses</span>
					</Link>

					<Link
						to="/bonus-tools"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
					>
						<Wrench size={14} />
						<span>Bonus Tools</span>
					</Link>

					<Link
						to="/project-emails"
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
					>
						<Contact size={14} />
						<span>Project Emails</span>
					</Link>
				</div>
			</div>

			{/* <div className="shrink-0 border-b border-border px-3 py-3">
					<div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
						AI
					</div>

					<div className="space-y-0.5">
						<Link
							to="/ai/assistant"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<Bot size={14} />
							<span>AI Assistant</span>
						</Link>

						<Link
							to="/ai/knowledge"
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-accent/10 hover:text-foreground"
						>
							<BrainCircuit size={14} />
							<span>AI Knowledge</span>
						</Link>
					</div>
				</div> */}

			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex items-center justify-between px-5 py-3">
					<div className="text-xs font-semibold uppercase tracking-wider text-muted">
						Categories
					</div>

					<button
						type="button"
						title="New category"
						onClick={createCategory}
						className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-foreground"
					>
						<Plus size={15} />
					</button>
				</div>

				<div className="supportos-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
					<Tree nodes={tree} />
				</div>
			</div>
		</aside>
	);
}
