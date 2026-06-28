import { Link, useNavigate } from "@tanstack/react-router";
import { Cloud, LogIn, LogOut, Plus, Search, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";
import { useToast } from "@/shared/hooks/useToast";
import { getBindTitle, searchBinds } from "@/shared/lib/bind-search";
import { isKeyboardCode } from "@/shared/lib/keyboard";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";

export function Topbar() {
	const navigate = useNavigate();
	const [searchFocused, setSearchFocused] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const { showToast } = useToast();

	const authConfigured = useAuthStore((s) => s.configured);
	const authSession = useAuthStore((s) => s.session);
	const searchValue = useKnowledgeStore((s) => s.search);
	const setSearch = useKnowledgeStore((s) => s.setSearch);
	const language = useKnowledgeStore((s) => s.language);
	const activeTab = useKnowledgeStore((s) => s.activeTab);
	const categories = useKnowledgeStore((s) => s.categories);
	const folders = useKnowledgeStore((s) => s.folders);
	const selectedCategory = useKnowledgeStore((s) => s.selectedCategory);
	const selectedFolder = useKnowledgeStore((s) => s.selectedFolder);
	const binds = useKnowledgeStore((s) => s.binds);
	const openBind = useKnowledgeStore((s) => s.openBind);

	const searchResults = searchValue.trim()
		? searchBinds(
				binds.filter((bind) => !bind.archived),
				searchValue,
				{
					categories,
					folders,
					language,
				},
			).slice(0, 8)
		: [];

	const createBind = useCallback(() => {
		const categoryId = selectedCategory ?? categories[0]?.id;

		if (!categoryId) {
			showToast("Create a category first");
			return;
		}

		const selectedFolderEntity = folders.find(
			(folder) => folder.id === selectedFolder,
		);
		modalManager.open("createBind", {
			categoryId,
			folderId:
				selectedFolderEntity?.categoryId === categoryId
					? selectedFolderEntity.id
					: undefined,
		});
	}, [categories, folders, selectedCategory, selectedFolder, showToast]);

	const signOut = async () => {
		await supabaseService.signOut();
		await knowledgeService.loadKnowledge();
		showToast("Signed out");
	};

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;

			if (isKeyboardCode(event, "KeyF") || isKeyboardCode(event, "KeyP")) {
				event.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
			}

			if (isKeyboardCode(event, "KeyN")) {
				event.preventDefault();
				createBind();
			}

			if (isKeyboardCode(event, "KeyD") && activeTab) {
				event.preventDefault();
				const favorite = knowledgeService.toggleFavorite(activeTab);

				showToast(favorite ? "Added to favorites" : "Removed from favorites");
			}

			if (isKeyboardCode(event, "KeyS")) {
				event.preventDefault();

				const detail = { handled: false };

				window.dispatchEvent(
					new CustomEvent("supportos:save-active-bind", {
						detail,
					}),
				);

				if (!detail.handled) {
					knowledgeService.saveKnowledge();
					showToast("Saved");
				}
			}
		};

		window.addEventListener("keydown", handler);

		return () => window.removeEventListener("keydown", handler);
	}, [activeTab, createBind, showToast]);

	return (
		<header className="flex h-14 items-center justify-between border-b border-border bg-surface px-5">
			<div className="flex items-center gap-3">
				<SupportOSLogo />

				<div>
					<div className="font-semibold">SupportOS</div>

					<div className="text-xs text-muted">Knowledge Workspace</div>
				</div>
			</div>

			<div className="flex flex-1 justify-center px-10">
				<div className="relative w-full max-w-xl">
					<Search size={16} className="absolute left-3 top-3 text-muted" />

					<input
						ref={searchInputRef}
						value={searchValue}
						onChange={(event) => setSearch(event.target.value)}
						onFocus={() => setSearchFocused(true)}
						onBlur={() => {
							window.setTimeout(() => setSearchFocused(false), 120);
						}}
						className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Search binds..."
					/>

					{searchFocused && searchValue.trim() && (
						<div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
							{searchResults.length > 0 ? (
								searchResults.map((bind) => (
									<button
										key={bind.id}
										type="button"
										onMouseDown={(event) => {
											event.preventDefault();
											openBind(bind.id);
											void navigate({ to: "/" });
											setSearchFocused(false);
										}}
										className="block w-full border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-elevated"
									>
										<div className="truncate text-sm font-medium">
											{getBindTitle(bind, language)}
										</div>

										<div className="mt-1 truncate text-xs text-muted">
											{bind.slug}
											{bind.tags.length > 0 ? ` - ${bind.tags.join(", ")}` : ""}
										</div>
									</button>
								))
							) : (
								<div className="px-4 py-3 text-sm text-muted">
									Nothing found
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="flex items-center gap-2">
				<button
					type="button"
					title="New bind"
					onClick={createBind}
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<Plus size={18} />
				</button>

				{authConfigured &&
					(authSession ? (
						<button
							type="button"
							title={`Cloud: ${authSession.user.email}`}
							onClick={signOut}
							className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs hover:bg-surface-elevated"
						>
							<Cloud size={16} />
							<LogOut size={16} />
						</button>
					) : (
						<Link
							to="/login"
							title="Cloud login"
							className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs hover:bg-surface-elevated"
						>
							<Cloud size={16} />
							<LogIn size={16} />
						</Link>
					))}

				<Link
					to="/settings"
					title="Settings"
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<Settings size={18} />
				</Link>
			</div>
		</header>
	);
}
