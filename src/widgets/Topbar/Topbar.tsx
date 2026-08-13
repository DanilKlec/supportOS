import { useNavigate } from "@tanstack/react-router";
import { Cloud, LogIn, LogOut, Menu, Plus, Search, X } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";
import { useToast } from "@/shared/hooks/useToast";
import { getBindTitle, searchBinds } from "@/shared/lib/bind-search";
import { isKeyboardCode } from "@/shared/lib/keyboard";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore, useWorkspaceStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";

import { ToolsMenu } from "./ToolsMenu";

interface TopbarProps {
	onOpenMobileSidebar?: () => void;
}

function getShortcutLabel() {
	if (
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.platform)
	) {
		return "\u2318K";
	}

	return "Ctrl K";
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
	const tokens = query
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.sort((first, second) => second.length - first.length);

	if (tokens.length === 0) return <>{text}</>;

	const matcher = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
	const parts = text.split(matcher);
	let offset = 0;
	const segments = parts.map((part) => {
		const start = offset;

		offset += part.length;

		return {
			part,
			start,
			matched: tokens.some(
				(token) => token.toLowerCase() === part.toLowerCase(),
			),
		};
	});

	return (
		<>
			{segments.map((segment) =>
				segment.matched ? (
					<mark
						key={`${segment.start}-${segment.part}`}
						className="rounded bg-accent/20 px-0.5 text-foreground"
					>
						{segment.part}
					</mark>
				) : (
					<span key={`${segment.start}-${segment.part}`}>{segment.part}</span>
				),
			)}
		</>
	);
}

function getFolderPath(
	folderId: string | undefined,
	folders: KnowledgeFolder[],
) {
	if (!folderId) return "";

	const names: string[] = [];
	let current = folders.find((folder) => folder.id === folderId);
	let guard = 0;

	while (current && guard < 20) {
		names.unshift(current.name);
		current = current.parentId
			? folders.find((folder) => folder.id === current?.parentId)
			: undefined;
		guard += 1;
	}

	return names.join(" / ");
}

function getResultLanguage(bind: Bind, language: string) {
	return (
		bind.translations.find(
			(translation) => translation.language === language,
		) ??
		bind.translations.find((translation) => translation.language === "ru") ??
		bind.translations.find((translation) => translation.language === "en") ??
		bind.translations[0]
	)?.language;
}

function SearchResults({
	results,
	query,
	language,
	categories,
	folders,
	activeIndex,
	onActiveIndexChange,
	onOpen,
}: {
	results: Bind[];
	query: string;
	language: string;
	categories: KnowledgeCategory[];
	folders: KnowledgeFolder[];
	activeIndex: number;
	onActiveIndexChange: (index: number) => void;
	onOpen: (bind: Bind) => void;
}) {
	if (!query.trim()) {
		return (
			<div className="px-4 py-8 text-center text-sm text-muted">
				Type a title, tag, folder or answer text.
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="px-4 py-8 text-center text-sm text-muted">
				Nothing found for “{query.trim()}”.
			</div>
		);
	}

	return (
		<div role="listbox" aria-label="Search results" className="py-1">
			{results.map((bind, index) => {
				const category = categories.find((item) => item.id === bind.categoryId);
				const folderPath = getFolderPath(bind.folderId, folders);
				const title = getBindTitle(bind, language);
				const resultLanguage = getResultLanguage(bind, language);
				const location = `${category?.name ?? "No category"}${
					folderPath ? ` / ${folderPath}` : ""
				}`;
				const active = index === activeIndex;

				return (
					<button
						key={bind.id}
						type="button"
						role="option"
						aria-selected={active}
						onMouseEnter={() => onActiveIndexChange(index)}
						onMouseDown={(event) => {
							event.preventDefault();
							onOpen(bind);
						}}
						className={`flex min-h-16 w-full min-w-0 flex-col gap-1 px-4 py-3 text-left transition ${
							active
								? "bg-accent/10 text-foreground"
								: "text-foreground hover:bg-surface-elevated"
						}`}
					>
						<span className="truncate text-sm font-semibold">
							<Highlight text={title} query={query} />
						</span>
						<span className="flex min-w-0 items-center gap-2 text-xs text-muted">
							<span className="truncate">
								<Highlight text={location} query={query} />
							</span>
							{resultLanguage && (
								<span className="shrink-0 rounded-full bg-background px-2 py-0.5 uppercase">
									{resultLanguage}
								</span>
							)}
						</span>
					</button>
				);
			})}
		</div>
	);
}

export function Topbar({ onOpenMobileSidebar }: TopbarProps) {
	const navigate = useNavigate();
	const [searchFocused, setSearchFocused] = useState(false);
	const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
	const [activeResultIndex, setActiveResultIndex] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const mobileSearchInputRef = useRef<HTMLInputElement>(null);
	const { showToast } = useToast();

	const authConfigured = useAuthStore((s) => s.configured);
	const authSession = useAuthStore((s) => s.session);
	const layout = useWorkspaceStore((s) => s.layout);
	const setLayout = useWorkspaceStore((s) => s.setLayout);
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
	const shortcutLabel = useMemo(getShortcutLabel, []);

	const searchResults = searchValue.trim()
		? searchBinds(
				binds.filter((bind) => !bind.archived),
				searchValue,
				{
					categories,
					folders,
					language,
				},
			).slice(0, 9)
		: [];

	const openSearchResult = (bind: Bind) => {
		openBind(bind.id);
		void navigate({ to: "/" });
		setSearchFocused(false);
		setMobileSearchOpen(false);
	};

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

	const openGlobalSearch = useCallback(() => {
		const mobile = window.matchMedia("(max-width: 767px)").matches;

		if (mobile) {
			setMobileSearchOpen(true);
			window.setTimeout(() => mobileSearchInputRef.current?.focus(), 0);
			return;
		}

		searchInputRef.current?.focus();
		searchInputRef.current?.select();
	}, []);

	const toggleSidebar = () => {
		const mobile = window.matchMedia("(max-width: 767px)").matches;

		if (mobile) {
			onOpenMobileSidebar?.();
			return;
		}

		setLayout({ showSidebar: !layout.showSidebar });
	};

	const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveResultIndex((index) =>
				searchResults.length === 0 ? 0 : (index + 1) % searchResults.length,
			);
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveResultIndex((index) =>
				searchResults.length === 0
					? 0
					: (index - 1 + searchResults.length) % searchResults.length,
			);
		}

		if (event.key === "Enter" && searchResults[activeResultIndex]) {
			event.preventDefault();
			openSearchResult(searchResults[activeResultIndex]);
		}

		if (event.key === "Escape") {
			event.preventDefault();
			setSearchFocused(false);
			setMobileSearchOpen(false);
			searchInputRef.current?.blur();
			mobileSearchInputRef.current?.blur();
		}
	};

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;

			if (
				isKeyboardCode(event, "KeyK") ||
				isKeyboardCode(event, "KeyF") ||
				isKeyboardCode(event, "KeyP")
			) {
				event.preventDefault();
				openGlobalSearch();
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
	}, [activeTab, createBind, openGlobalSearch, showToast]);

	useEffect(() => {
		if (!mobileSearchOpen) return undefined;

		const previousOverflow = document.body.style.overflow;

		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [mobileSearchOpen]);

	return (
		<header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/95 px-3 text-foreground backdrop-blur md:px-5">
			<button
				type="button"
				aria-label={
					layout.showSidebar ? "Collapse navigation" : "Open navigation"
				}
				onClick={toggleSidebar}
				className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
			>
				<Menu size={19} />
			</button>

			<div className="flex min-w-0 shrink-0 items-center gap-2">
				<SupportOSLogo className="h-8 w-8" />
				<div className="hidden min-w-0 sm:block">
					<div className="truncate text-sm font-semibold leading-5">
						SupportOS
					</div>
					<div className="truncate text-[11px] text-muted">
						Support workspace
					</div>
				</div>
			</div>

			<div className="hidden min-w-0 flex-1 justify-center px-4 md:flex">
				<div className="relative w-full max-w-2xl">
					<Search
						size={17}
						className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
					/>
					<input
						ref={searchInputRef}
						value={searchValue}
						onChange={(event) => {
							setSearch(event.target.value);
							setActiveResultIndex(0);
						}}
						onKeyDown={handleSearchKeyDown}
						onFocus={() => setSearchFocused(true)}
						onBlur={() => {
							window.setTimeout(() => setSearchFocused(false), 120);
						}}
						className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-20 text-sm outline-none transition placeholder:text-muted/80 focus:border-accent focus:ring-2 focus:ring-accent/30"
						placeholder="Search materials, folders, tags..."
					/>
					<kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted lg:block">
						{shortcutLabel}
					</kbd>

					{searchFocused && (
						<div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
							<SearchResults
								results={searchResults}
								query={searchValue}
								language={language}
								categories={categories}
								folders={folders}
								activeIndex={activeResultIndex}
								onActiveIndexChange={setActiveResultIndex}
								onOpen={openSearchResult}
							/>
						</div>
					)}
				</div>
			</div>

			<div className="ml-auto flex shrink-0 items-center gap-2">
				<button
					type="button"
					aria-label="Search"
					onClick={() => {
						setMobileSearchOpen(true);
						window.setTimeout(() => mobileSearchInputRef.current?.focus(), 0);
					}}
					className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:hidden"
				>
					<Search size={19} />
				</button>

				<button
					type="button"
					onClick={createBind}
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
				>
					<Plus size={17} />
					<span className="hidden lg:inline">New material</span>
				</button>

				<ToolsMenu />

				{authConfigured &&
					(authSession ? (
						<button
							type="button"
							title={`Cloud: ${authSession.user.email}`}
							onClick={signOut}
							className="hidden h-10 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted transition hover:bg-surface-elevated hover:text-foreground sm:inline-flex"
						>
							<Cloud size={16} />
							<LogOut size={16} />
						</button>
					) : (
						<button
							type="button"
							title="Cloud login"
							onClick={() => void navigate({ to: "/login" })}
							className="hidden h-10 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted transition hover:bg-surface-elevated hover:text-foreground sm:inline-flex"
						>
							<Cloud size={16} />
							<LogIn size={16} />
						</button>
					))}
			</div>

			{mobileSearchOpen && (
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Search materials"
					className="fixed inset-0 z-50 flex flex-col bg-background text-foreground md:hidden"
				>
					<div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
						<Search size={18} className="shrink-0 text-muted" />
						<input
							ref={mobileSearchInputRef}
							value={searchValue}
							onChange={(event) => {
								setSearch(event.target.value);
								setActiveResultIndex(0);
							}}
							onKeyDown={handleSearchKeyDown}
							placeholder="Search materials..."
							className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
						/>
						<button
							type="button"
							aria-label="Close search"
							onClick={() => setMobileSearchOpen(false)}
							className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<X size={19} />
						</button>
					</div>

					<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
						<SearchResults
							results={searchResults}
							query={searchValue}
							language={language}
							categories={categories}
							folders={folders}
							activeIndex={activeResultIndex}
							onActiveIndexChange={setActiveResultIndex}
							onOpen={openSearchResult}
						/>
					</div>
				</div>
			)}
		</header>
	);
}
