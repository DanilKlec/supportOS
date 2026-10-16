import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	BookOpen,
	Check,
	ChevronRight,
	Download,
	Import,
	LayoutGrid,
	type LucideIcon,
	Menu,
	Moon,
	PanelRight,
	Search,
	ShieldCheck,
	Sun,
	UserRound,
	Users,
	Wrench,
	X,
} from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { AmbientMotionButton } from "@/components/brand/AmbientBackground";
import { IconButton } from "@/components/ui";
import { type SpaceItem, spaces } from "@/features/spaces/navigation";
import { supportOSExportService } from "@/services/supportos-export.service";
import { useToast } from "@/shared/hooks/useToast";
import {
	getAppearanceSettings,
	resolveThemeMode,
	saveAppearanceSettings,
} from "@/shared/lib/appearance";
import { useAuthStore } from "@/store/auth.store";
import type { Permission } from "../../../shared/access.js";
import { can, canAccessPage, canAdmin } from "../../../shared/access.js";
import "./workspace-navigation.css";

type AppRoute =
	| "/admin"
	| "/content"
	| "/team"
	| "/project-emails"
	| "/bonuses"
	| "/shared-binds"
	| "/settings/users"
	| "/"
	| "/translator"
	| "/ai/assistant"
	| "/ai/translator"
	| "/ai/knowledge"
	| "/sports-betting"
	| "/bonus-tools"
	| "/health"
	| "/agent-monitor"
	| "/archive"
	| "/import/google-sheets"
	| "/settings"
	| "/settings/translator"
	| "/settings/ai";

interface RouteToolItem {
	type: "route";
	label: string;
	description?: string;
	icon: LucideIcon;
	to: AppRoute;
	hash?: string;
	permission?: Permission;
	active?: boolean;
}

interface ActionToolItem {
	type: "action";
	label: string;
	description?: string;
	icon: LucideIcon;
	action: () => void;
	active?: boolean;
	danger?: boolean;
}

type ToolItem = RouteToolItem | ActionToolItem;

interface ToolGroup {
	title: string;
	items: ToolItem[];
}

function downloadJson(payload: string) {
	const blob = new Blob([payload], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");

	anchor.href = url;
	anchor.download = `supportos-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function getFocusableItems(container: HTMLDivElement | null) {
	if (!container) return [];

	return Array.from(
		container.querySelectorAll<HTMLElement>(
			"[data-tools-item]:not([disabled])",
		),
	).filter((item) => !item.closest("[hidden]"));
}

export function ToolsMenu() {
	const role = useAuthStore((s) => s.session?.user.access);
	const actor = useAuthStore((s) => s.session?.user.id);
	const scrollPositions = useRef<Record<string, number>>({});
	const scrollRef = useRef<HTMLElement>(null);
	const navigate = useNavigate();
	const hash = useRouterState({ select: (s) => s.location.hash });
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { showToast } = useToast();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	const [themeMode, setThemeMode] = useState(
		() => getAppearanceSettings().themeMode,
	);
	const resolvedTheme = resolveThemeMode(themeMode);
	const menuId = "supportos-tools-menu";
	useEffect(() => {
		if (open && scrollRef.current)
			scrollRef.current.scrollTop = query
				? 0
				: (scrollPositions.current[actor ?? "guest"] ?? 0);
	}, [open, query, actor]);

	const closeMenu = useCallback(() => {
		setOpen(false);
	}, []);

	const navigateTo = (to: AppRoute, hash?: string) => {
		setOpen(false);
		void navigate({ to, hash: hash ?? "" });
	};

	const exportJson = async () => {
		try {
			downloadJson(await supportOSExportService.exportJson());
			showToast("Снимок базы знаний экспортирован");
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Не удалось экспортировать данные",
			);
		}
		setOpen(false);
	};

	const importJson = () => {
		navigateTo("/settings", "data");
	};

	const toggleTheme = () => {
		const settings = getAppearanceSettings();
		const nextTheme: "light" | "dark" =
			resolveThemeMode(settings.themeMode) === "dark" ? "light" : "dark";
		const nextSettings = {
			...settings,
			themeMode: nextTheme,
		};

		saveAppearanceSettings(nextSettings);
		setThemeMode(nextTheme);
		showToast(
			nextTheme === "dark" ? "Тёмная тема включена" : "Светлая тема включена",
		);
		setOpen(false);
	};

	const groups: ToolGroup[] = spaces.map((space) => ({
		title: space.title,
		items: (space.items as readonly SpaceItem[]).map((item) => ({
			type: "route" as const,
			...item,
			to: item.to as AppRoute,
			icon:
				{
					"Рабочее пространство": BookOpen,
					Контент: LayoutGrid,
					Команда: Users,
					Инструменты: Wrench,
					"Личный кабинет": UserRound,
				}[space.title] ?? BookOpen,
		})),
	}));
	groups.push({
		title: "Администрирование",
		items: canAdmin(role)
			? [
					{
						type: "route",
						label: "Администрирование",
						icon: ShieldCheck,
						to: "/admin",
					},
				]
			: [],
	});
	groups.push({
		title: "Быстрые действия",
		items: [
			{
				type: "action",
				label: "Рабочий вид",
				icon: PanelRight,
				action: () => {
					setOpen(false);
					window.setTimeout(
						() => window.dispatchEvent(new Event("supportos:workspace-view")),
						0,
					);
				},
			},
			{
				type: "action",
				label: "Рабочая подборка",
				icon: BookOpen,
				action: () => {
					setOpen(false);
					window.setTimeout(
						() => window.dispatchEvent(new Event("supportos:library")),
						0,
					);
				},
			},
			{
				type: "action",
				label: "Горячие клавиши",
				icon: Search,
				action: () => {
					setOpen(false);
					window.setTimeout(
						() => window.dispatchEvent(new Event("supportos:shortcuts")),
						0,
					);
				},
			},
			{
				type: "action",
				label: "Импорт JSON с предпросмотром",
				icon: Import,
				action: importJson,
			},
			{
				type: "action",
				label: "Экспорт снимка базы знаний",
				icon: Download,
				action: exportJson,
			},
			{
				type: "action",
				label: resolvedTheme === "dark" ? "Светлая тема" : "Тёмная тема",
				icon: resolvedTheme === "dark" ? Sun : Moon,
				action: toggleTheme,
			},
		],
	});
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
		try {
			return {
				"Быстрые действия": true,
				...JSON.parse(sessionStorage.getItem("supportos-menu-groups") ?? "{}"),
			};
		} catch {
			return { "Быстрые действия": true };
		}
	});
	const toggleGroup = (title: string) =>
		setCollapsed((current) => {
			const next = { ...current, [title]: !current[title] };
			try {
				sessionStorage.setItem("supportos-menu-groups", JSON.stringify(next));
			} catch {}
			return next;
		});

	// biome-ignore lint/correctness/useExhaustiveDependencies: navigation closes the menu.
	useEffect(() => {
		setOpen(false);
	}, [pathname]);
	useEffect(() => {
		if (!open) return;
		const root = document.getElementById("app");
		const previousInert = root?.inert;
		const overflow = document.body.style.overflow;
		if (root) root.inert = true;
		document.body.style.overflow = "hidden";
		searchRef.current?.focus();
		const keyboard = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopImmediatePropagation();
				closeMenu();
			}
			if (event.key === "Tab") {
				const nodes = Array.from(
					menuRef.current?.querySelectorAll<HTMLElement>(
						"button:not([disabled]), input:not([disabled]), a[href]",
					) ?? [],
				).filter((node) => !node.closest("[hidden]"));
				const first = nodes[0],
					last = nodes[nodes.length - 1];
				if (
					event.shiftKey &&
					(document.activeElement === first ||
						!menuRef.current?.contains(document.activeElement))
				) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first?.focus();
				}
			}
		};
		window.addEventListener("keydown", keyboard, true);
		return () => {
			window.removeEventListener("keydown", keyboard, true);
			if (root) root.inert = previousInert ?? false;
			document.body.style.overflow = overflow;
			buttonRef.current?.focus();
		};
	}, [open, closeMenu]);

	const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const items = getFocusableItems(menuRef.current);
		const currentIndex = items.indexOf(document.activeElement as HTMLElement);

		if (event.key === "ArrowDown") {
			event.preventDefault();
			items[(currentIndex + 1 + items.length) % items.length]?.focus();
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			items[(currentIndex - 1 + items.length) % items.length]?.focus();
		}

		if (event.key === "Home" && event.target !== searchRef.current) {
			event.preventDefault();
			items[0]?.focus();
		}

		if (event.key === "End" && event.target !== searchRef.current) {
			event.preventDefault();
			items[items.length - 1]?.focus();
		}
	};

	const visibleGroups = groups
		.map((group) => ({
			...group,
			items: group.items
				.filter((item) => {
					if (item.type === "route")
						return canAccessPage(role, item.to, item.hash);
					if (item.action === importJson) return can(role, "knowledge.write");
					if (item.action === exportJson) return can(role, "binds.read");
					return can(role, "work");
				})
				.filter((item) =>
					`${item.label} ${item.description ?? ""} ${group.title}`
						.toLocaleLowerCase()
						.includes(query.trim().toLocaleLowerCase()),
				),
		}))
		.filter((group) => group.items.length);
	// Keep the drawer at section level; search still reaches every nested destination.
	const displayGroups = query.trim()
		? visibleGroups
		: [
				{
					title: "Разделы",
					items: visibleGroups
						.filter((g) => g.title !== "Быстрые действия")
						.map((group) => {
							const first = group.items[0];
							return {
								...first,
								label:
									group.title === "Рабочее пространство"
										? "Бинды"
										: group.title,
								description: undefined,
								active: group.items.some(
									(item) =>
										item.type === "route" &&
										(pathname.replace(/\/+$/, "") || "/") === item.to,
								),
							};
						}),
				},
				...visibleGroups.filter((g) => g.title === "Быстрые действия"),
			];
	return (
		<>
			<IconButton
				ref={buttonRef}
				type="button"
				label="Открыть меню пространства"
				title="Меню"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => {
					setQuery("");
					setOpen(true);
					setThemeMode(getAppearanceSettings().themeMode);
				}}
				variant="ghost"
			>
				<Menu size={19} strokeWidth={1.6} aria-hidden="true" />
			</IconButton>
			{open &&
				createPortal(
					<div className="fixed inset-0 z-[80]">
						<div
							aria-hidden="true"
							onClick={closeMenu}
							className="absolute inset-0 bg-black/25"
						/>
						<div
							ref={menuRef}
							id={menuId}
							role="dialog"
							aria-modal="true"
							aria-labelledby="workspace-menu-title"
							onKeyDown={handleMenuKeyDown}
							className="workspace-menu tools-popover"
						>
							<header className="workspace-menu-heading">
								<div className="min-w-0 flex-1">
									<h2
										id="workspace-menu-title"
										className="text-sm font-semibold"
									>
										Меню
									</h2>
									<p className="mt-1 text-xs text-muted">
										Разделы и инструменты
									</p>
								</div>
								<IconButton
									type="button"
									label="Закрыть меню"
									onClick={closeMenu}
									variant="ghost"
									size="small"
								>
									<X size={17} strokeWidth={1.6} />
								</IconButton>
							</header>
							<div className="workspace-menu-search relative">
								<Search
									size={17}
									className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 shrink-0 text-muted"
								/>
								<input
									ref={searchRef}
									aria-label="Поиск разделов и инструментов"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Найти раздел или инструмент…"
									className="ui-input w-full border border-border bg-background pl-10 pr-3 outline-none focus:border-accent"
								/>
							</div>
							<nav
								aria-label="Разделы и инструменты"
								ref={scrollRef}
								onScroll={(e) => {
									if (!query)
										scrollPositions.current[actor ?? "guest"] =
											e.currentTarget.scrollTop;
								}}
								className="workspace-menu-content supportos-scroll"
							>
								{displayGroups.map((group) => (
									<section key={group.title} className="workspace-menu-section">
										<h3>
											<button
												type="button"
												className="workspace-menu-group"
												aria-expanded={!!query || !collapsed[group.title]}
												onClick={() => toggleGroup(group.title)}
											>
												{group.title}
												<ChevronRight
													size={12}
													aria-hidden="true"
													className={
														!query && collapsed[group.title] ? "" : "rotate-90"
													}
												/>
											</button>
										</h3>
										<div
											className="space-y-1"
											hidden={!query && collapsed[group.title]}
										>
											{group.items.map((item) => {
												const Icon = item.icon;
												const active =
													item.type === "route" &&
													(item.active ??
														((pathname.replace(/\/+$/, "") || "/") ===
															item.to &&
															hash === (item.hash ?? "")));
												return (
													<button
														key={item.label}
														type="button"
														data-tools-item
														aria-current={active ? "page" : undefined}
														onClick={() =>
															item.type === "route"
																? navigateTo(item.to, item.hash)
																: item.action()
														}
														className="workspace-menu-link group"
													>
														<span className="workspace-menu-icon">
															<Icon
																size={17}
																strokeWidth={1.6}
																aria-hidden="true"
															/>
														</span>
														<span className="min-w-0 flex-1">
															<span className="block text-sm font-medium">
																{item.label}
															</span>
															{item.description && (
																<span className="mt-0.5 block text-xs leading-5 text-muted">
																	{item.description}
																</span>
															)}
														</span>
														{active ? (
															<Check
																size={14}
																aria-hidden="true"
																className="text-muted"
															/>
														) : (
															<ChevronRight
																size={14}
																className="text-muted opacity-40 group-hover:opacity-100"
															/>
														)}
													</button>
												);
											})}
										</div>
									</section>
								))}
								{!visibleGroups.length && (
									<p className="py-12 text-center text-sm text-muted">
										Ничего не найдено. Попробуйте другое название.
									</p>
								)}
							</nav>
							<footer className="workspace-menu-footer">
								<span className="flex items-center gap-2 text-[11px] text-muted">
									<kbd>Esc</kbd>Закрыть
								</span>
								<AmbientMotionButton />
							</footer>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
