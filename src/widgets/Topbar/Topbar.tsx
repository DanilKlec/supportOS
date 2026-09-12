import { spaces, type SpaceItem } from "@/features/spaces/navigation";
import { Inbox } from "@/features/shared-binds/Inbox";
import { BonusFreshness } from "@/features/bonuses/BonusFreshness";
import { catalogResults, type CatalogResult } from "./search-catalog";
import { useQuery } from "@tanstack/react-query";
import { contentApi } from "@/services/shared-content.service";
import { BaseModal } from "@/shared/modals/BaseModal";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useBonusStore } from "@/store/bonus.store";
import { can, routePermission } from "../../../shared/access.js";
import { SharedBindEditor } from "@/features/shared-binds/SharedBindsPage";
import { useQueryClient } from "@tanstack/react-query";
import { ToolsMenu } from "./ToolsMenu";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, Menu, Search, X } from "lucide-react";
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
import { useKnowledgeStore, useWorkspaceStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";

interface TopbarProps {
	onOpenMobileSidebar?: () => void;
	showKnowledgeControls?: boolean;
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
	results: CatalogResult[];
	query: string;
	language: string;
	categories: KnowledgeCategory[];
	folders: KnowledgeFolder[];
	activeIndex: number;
	onActiveIndexChange: (index: number) => void;
	onOpen: (bind: CatalogResult) => void;
}) {
	if (!query.trim()) {
		return (
			<div className="px-4 py-8 text-center text-sm text-muted">
				Введите название, проект, почту или текст ответа.
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="px-4 py-8 text-center text-sm text-muted">
				Ничего не найдено по запросу «{query.trim()}».
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
				const location = bind.resultKind
					? `${bind.resultKind === "email" ? "Почты" : "Бонусы"} · ${bind.projectName}`
					: `${category?.name ?? "Бинды"}${
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
						onClick={() => onOpen(bind)}
						onMouseDown={(event) => {
							event.preventDefault();
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

export function Topbar({
	onOpenMobileSidebar,
	showKnowledgeControls = true,
}: TopbarProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [newShared, setNewShared] = useState(false);
	const [preview, setPreview] = useState<CatalogResult | null>(null);
	const [kind, setKind] = useState("all");
	const [searchFocused, setSearchFocused] = useState(false);
	const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
	const [activeResultIndex, setActiveResultIndex] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const mobileSearchInputRef = useRef<HTMLInputElement>(null);
	const { showToast } = useToast();

	const authConfigured = useAuthStore((s) => s.configured);
	const authSession = useAuthStore((s) => s.session);
	const access = authSession?.user.access;
	const enabled = searchFocused || mobileSearchOpen;
	const emails = useQuery({
		queryKey: ["search-emails", authSession?.user.id],
		enabled: enabled && can(access, "projects.read"),
		staleTime: 10000,
		queryFn: () => contentApi("emails"),
	});
	const bonuses = useQuery({
		queryKey: ["search-bonuses", authSession?.user.id],
		enabled: enabled && can(access, "bonuses.read"),
		staleTime: 10000,
		queryFn: async () => {
			const [shared, personal] = await Promise.all([
				contentApi("bonuses"),
				contentApi("bonuses", undefined, undefined, "personal"),
			]);
			return personal ?? shared;
		},
	});
	const catalog = useMemo(
		() =>
			catalogResults(
				can(access, "projects.read") && !emails.error
					? (emails.data?.data ?? [])
					: [],
				can(access, "bonuses.read") && !bonuses.error
					? (bonuses.data?.data ?? [])
					: [],
			),
		[access, emails.data, bonuses.data, emails.error, bonuses.error],
	);
	const layout = useWorkspaceStore((s) => s.layout);
	const setLayout = useWorkspaceStore((s) => s.setLayout);
	const searchValue = useKnowledgeStore((s) => s.search);
	const setSearch = useKnowledgeStore((s) => s.setSearch);
	const language = useKnowledgeStore((s) => s.language);
	const activeTab = useKnowledgeStore((s) => s.activeTab);
	const categories = useKnowledgeStore((s) => s.categories);
	const folders = useKnowledgeStore((s) => s.folders);
	const localBinds = useKnowledgeStore((s) => s.binds);
	const remoteBinds = useKnowledgeStore((s) => s.remoteBinds);
	const binds = useMemo(
		() => [
			...remoteBinds,
			...localBinds.filter((b) => !remoteBinds.some((r) => r.id === b.id)),
		],
		[localBinds, remoteBinds],
	);
	const openBind = useKnowledgeStore((s) => s.openBind);
	const shortcutLabel = useMemo(getShortcutLabel, []);

	const searchResults = searchValue.trim()
		? searchBinds(
				[...(can(access, "binds.read") ? binds : []), ...catalog].filter(
					(bind: CatalogResult) =>
						!bind.archived &&
						(kind === "all" || (bind.resultKind ?? "bind") === kind),
				),
				searchValue,
				{
					categories,
					folders,
					language,
				},
			).slice(0, 9)
		: [];

	const sectionResults = spaces
		.flatMap((g) =>
			(g.items as readonly SpaceItem[]).map((i) => ({ ...i, group: g.title })),
		)
		.filter(
			(i) =>
				can(access, i.permission ?? routePermission(i.to)) &&
				searchValue.trim() &&
				(i.label + " " + i.group)
					.toLowerCase()
					.includes(searchValue.trim().toLowerCase()),
		);
	const sectionSearch = (
		<>
			{sectionResults.map((i) => (
				<button
					type="button"
					key={i.to + (i.hash ?? "")}
					className="flex w-full justify-between p-3 text-left text-sm hover:bg-surface-elevated"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => {
						void navigate({ to: i.to, hash: i.hash ?? "" });
						setSearchFocused(false);
						setMobileSearchOpen(false);
					}}
				>
					{i.label}
					<span className="text-xs text-muted">{i.group}</span>
				</button>
			))}
		</>
	);
	const searchFilters = (
		<div className="border-b border-border p-2">
			<div className="flex gap-1">
				{[
					{ id: "all", label: "Всё" },
					...(can(access, "binds.read")
						? [{ id: "bind", label: "Бинды" }]
						: []),
					...(can(access, "projects.read")
						? [{ id: "email", label: "Почты" }]
						: []),
					...(can(access, "bonuses.read")
						? [{ id: "bonus", label: "Бонусы" }]
						: []),
				].map((item) => (
					<button
						key={item.id}
						type="button"
						aria-pressed={kind === item.id}
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => {
							setKind(item.id);
							setActiveResultIndex(0);
						}}
						className="rounded-lg px-3 py-1 text-xs text-muted aria-pressed:bg-surface-elevated aria-pressed:text-foreground"
					>
						{item.label}
					</button>
				))}
			</div>
			{((can(access, "projects.read") && emails.isFetching) ||
				(can(access, "bonuses.read") && bonuses.isFetching)) && (
				<p role="status" className="p-2 text-xs text-muted">
					Обновляем справочники…
				</p>
			)}
			{((can(access, "projects.read") && emails.error) ||
				(can(access, "bonuses.read") && bonuses.error)) && (
				<p role="alert" className="p-2 text-xs text-red-400">
					Часть справочников недоступна.{" "}
					<button
						type="button"
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => {
							if (can(access, "projects.read")) void emails.refetch();
							if (can(access, "bonuses.read")) void bonuses.refetch();
						}}
						className="underline"
					>
						Повторить
					</button>
				</p>
			)}
		</div>
	);
	const openSearchResult = (bind: CatalogResult) => {
		if (bind.resultKind) setPreview(bind);
		else {
			openBind(bind.id);
			void navigate({ to: "/" });
		}
		setSearchFocused(false);
		setMobileSearchOpen(false);
	};

	const createBind = useCallback(() => {
		if (can(authSession?.user.access, "knowledge.write")) setNewShared(true);
		else void navigate({ to: "/" });
	}, [authSession?.user.access, navigate]);

	const signOut = async () => {
		try {
			await supabaseService.signOut();
		} catch {
			showToast("Не удалось выйти. Повторите попытку.");
			return;
		}
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
		<div className="relative z-30 shrink-0">
			{preview &&
				can(
					access,
					preview.resultKind === "email" ? "projects.read" : "bonuses.read",
				) && (
					<BaseModal
						title={getBindTitle(preview, language)}
						onClose={() => setPreview(null)}
					>
						<p className="mb-3 text-xs text-muted">
							{preview.resultKind === "email"
								? "Почта проекта"
								: "Сохранённые условия бонуса"}
						</p>
						{preview.freshness && <BonusFreshness bonus={preview.freshness} />}
						<p className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border p-4 text-sm leading-6">
							{
								(
									preview.translations.find((t) => t.language === language) ??
									preview.translations[0]
								)?.content
							}
						</p>
						<div className="mt-4 flex gap-2">
							<button
								type="button"
								onClick={() =>
									void copyToClipboard(
										(
											preview.translations.find(
												(t) => t.language === language,
											) ?? preview.translations[0]
										)?.content ?? "",
									).then((ok) =>
										showToast(ok ? "Скопировано" : "Не удалось скопировать"),
									)
								}
								className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-foreground"
							>
								Копировать
							</button>
							<button
								type="button"
								onClick={() => {
									if (preview.resultKind === "bonus") {
										useBonusStore
											.getState()
											.setActiveProject(preview.projectId);
										useBonusStore.getState().setDepositBonusQuery("");
									}
									void navigate({
										to:
											preview.resultKind === "email"
												? "/project-emails"
												: "/bonuses",
									});
									setPreview(null);
								}}
								className="rounded-xl border border-border px-4 py-2 text-sm"
							>
								Открыть раздел
							</button>
						</div>
					</BaseModal>
				)}

			<header className="relative flex h-16 items-center gap-2 border-b border-border bg-surface/95 px-3 text-foreground backdrop-blur md:px-5">
				<button
					type="button"
					aria-label={
						layout.showSidebar ? "Collapse navigation" : "Open navigation"
					}
					onClick={toggleSidebar}
					style={!showKnowledgeControls ? { display: "none" } : undefined}
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
							Рабочее пространство
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
							placeholder="Бинды, почты, бонусы…"
						/>
						<kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted lg:block">
							{shortcutLabel}
						</kbd>

						{searchFocused && (
							<div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
								{searchFilters}
								{sectionSearch}
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

					{authConfigured &&
						(authSession ? (
							<button
								type="button"
								title={`Выйти: ${authSession.user.email}`}
								aria-label="Выйти из аккаунта"
								onClick={signOut}
								className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs text-muted transition hover:bg-surface-elevated hover:text-foreground"
							>
								<span className="hidden max-w-28 truncate lg:block">
									{authSession.user.access?.display_name ||
										authSession.user.email?.split("@")[0]}
								</span>
								<LogOut size={16} />
							</button>
						) : (
							<button
								type="button"
								title="Cloud login"
								onClick={() => void navigate({ to: "/login" })}
								className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs text-muted transition hover:bg-surface-elevated hover:text-foreground"
							>
								<LogIn size={16} />
							</button>
						))}
					<Inbox />
					<ToolsMenu />
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
								placeholder="Найти бинд…"
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
							{searchFilters}
							{sectionSearch}
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

			{newShared && can(authSession?.user.access, "knowledge.write") && (
				<SharedBindEditor
					onClose={() => setNewShared(false)}
					onSaved={() => {
						setNewShared(false);
						void queryClient.invalidateQueries({ queryKey: ["shared-binds"] });
						showToast("Бинд сохранён для всей команды");
						void navigate({ to: "/shared-binds" });
					}}
				/>
			)}
		</div>
	);
}
