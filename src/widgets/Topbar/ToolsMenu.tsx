import { createPortal } from "react-dom";
import { AmbientMotionButton } from "@/components/brand/AmbientBackground";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { can, routePermission } from "../../../shared/access.js";
import { useAuthStore } from "@/store/auth.store";
import {
	Archive,
	Bot,
	BrainCircuit,
	Check,
	ChevronRight,
	Download,
	FileJson,
	HeartPulse,
	type LucideIcon,
	Import,
	Languages,
	Moon,
	Settings,
	Sparkles,
	Sun,
	Trophy,
	LayoutGrid,
	Search,
	PanelRight,
	BookOpen,
	Users,
	Calculator,
	X,
} from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { supportOSExportService } from "@/services/supportos-export.service";
import { useToast } from "@/shared/hooks/useToast";
import {
	getAppearanceSettings,
	resolveThemeMode,
	saveAppearanceSettings,
} from "@/shared/lib/appearance";

type AppRoute =
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

const WORK_TOOLS: RouteToolItem[] = [
	{
		type: "route",
		label: "Калькуляторы бонусов",
		description: "Расчёты и условия",
		icon: Calculator,
		to: "/bonus-tools",
	},
	{
		type: "route",
		label: "Контроль агентов",
		description: "Приём чатов и история смен",
		icon: HeartPulse,
		to: "/agent-monitor",
	},
	{
		type: "route",
		label: "Переводчик",
		description: "Перевод рабочих текстов",
		icon: Languages,
		to: "/translator",
	},
	{
		type: "route",
		label: "AI-помощник",
		description: "Подготовка и проверка ответов",
		icon: Bot,
		to: "/ai/assistant",
	},
	{
		type: "route",
		label: "AI-переводчик",
		description: "Перевод с учётом контекста",
		icon: Sparkles,
		to: "/ai/translator",
	},
	{
		type: "route",
		label: "Обучение AI",
		description: "Общие инструкции для помощника",
		icon: BrainCircuit,
		to: "/ai/knowledge",
	},
	{
		type: "route",
		label: "Спортивные ставки",
		description: "Коэффициенты и события",
		icon: Trophy,
		to: "/sports-betting",
	},
	{
		type: "route",
		label: "Качество базы",
		description: "Проверка полноты и дубликатов",
		icon: HeartPulse,
		to: "/health",
	},
	{
		type: "route",
		label: "Архив",
		description: "Архивные материалы",
		icon: Archive,
		to: "/archive",
	},
];

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
	);
}

export function ToolsMenu() {
	const role = useAuthStore((s) => s.session?.user.access);
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { showToast } = useToast();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	const [themeMode, setThemeMode] = useState(
		() => getAppearanceSettings().themeMode,
	);
	const resolvedTheme = resolveThemeMode(themeMode);
	const menuId = "supportos-tools-menu";

	const closeMenu = useCallback(() => {
		setOpen(false);
	}, []);

	const navigateTo = (to: AppRoute) => {
		setOpen(false);
		void navigate({ to });
	};

	const exportJson = () => {
		try {
			downloadJson(supportOSExportService.exportJson());
			showToast("SupportOS JSON exported");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Export failed");
		}
		setOpen(false);
	};

	const importJson = () => {
		fileInputRef.current?.click();
		setOpen(false);
	};

	const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];

		event.target.value = "";
		if (!file) return;

		try {
			supportOSExportService.importJson(await file.text());
			showToast("SupportOS JSON imported");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Import failed");
		}
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
			nextTheme === "dark" ? "Dark theme enabled" : "Light theme enabled",
		);
		setOpen(false);
	};

	const groups: ToolGroup[] = [
		{
			title: "Рабочее пространство",
			items: [
				{
					type: "route",
					label: "Пространство биндов",
					description: "Материалы и личная библиотека",
					icon: BookOpen,
					to: "/",
				},
				{
					type: "route",
					label: "Общая база",
					description: "Бинды, почты, бонусы и калькуляторы команды",
					icon: Users,
					to: "/shared-binds",
				},
				...WORK_TOOLS.filter((item) =>
					["/archive", "/health"].includes(item.to),
				),
			],
		},
		{
			title: "AI и инструменты",
			items: WORK_TOOLS.filter((item) =>
				[
					"/translator",
					"/ai/assistant",
					"/ai/translator",
					"/sports-betting",
				].includes(item.to),
			),
		},
		{
			title: "Команда и контроль",
			items: [
				{
					type: "route",
					label: "Пользователи и роли",
					description: "Реестр команды и управление доступами",
					icon: Users,
					to: "/settings/users",
				},
				...WORK_TOOLS.filter((item) =>
					["/agent-monitor", "/ai/knowledge"].includes(item.to),
				),
			],
		},
		{
			title: "Данные",
			items: [
				{
					type: "action",
					label: "Восстановить локальную копию",
					description: "Восстановление из файла",
					icon: Import,
					action: importJson,
				},
				{
					type: "action",
					label: "Экспорт локальной копии",
					description: "Скачать резервную копию",
					icon: Download,
					action: exportJson,
				},
				{
					type: "route",
					label: "Таблица в личную базу",
					description: "Добавить данные из таблицы",
					icon: FileJson,
					to: "/import/google-sheets",
				},
			],
		},
		{
			title: "Настройки",
			items: [
				{
					type: "action",
					label: resolvedTheme === "dark" ? "Светлая тема" : "Тёмная тема",
					description: "Оформление рабочего пространства",
					icon: resolvedTheme === "dark" ? Sun : Moon,
					action: toggleTheme,
					active: true,
				},
				{
					type: "route",
					label: "Настройки пространства",
					description: "Аккаунт, роли и оформление",
					icon: Settings,
					to: "/settings",
				},
				{
					type: "route",
					label: "Настройки перевода",
					description: "Подключение провайдера",
					icon: Languages,
					to: "/settings/translator",
				},
				{
					type: "route",
					label: "Настройки AI",
					description: "Провайдер и модель",
					icon: BrainCircuit,
					to: "/settings/ai",
				},
			],
		},
	];

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
				);
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
					if (item.type === "route") return can(role, routePermission(item.to));
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
	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				aria-label="Открыть меню пространства"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => {
					setQuery("");
					setOpen(true);
					setThemeMode(getAppearanceSettings().themeMode);
				}}
				className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-elevated/50 px-3 text-sm font-medium text-foreground transition hover:bg-surface-elevated"
			>
				<PanelRight size={18} />
				<span className="hidden sm:inline">Меню</span>
			</button>
			<input
				ref={fileInputRef}
				type="file"
				accept="application/json,.json"
				onChange={handleImportFile}
				className="hidden"
			/>
			{open &&
				createPortal(
					<div className="fixed inset-0 z-[80]">
						<div
							aria-hidden="true"
							onClick={closeMenu}
							className="absolute inset-0 bg-black/65 backdrop-blur-sm"
						/>
						<div
							ref={menuRef}
							id={menuId}
							role="dialog"
							aria-modal="true"
							aria-labelledby="workspace-menu-title"
							onKeyDown={handleMenuKeyDown}
							className="workspace-drawer absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-border bg-surface text-foreground shadow-2xl"
						>
							<header className="flex items-center gap-3 px-6 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
								<span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface-elevated">
									<LayoutGrid size={20} />
								</span>
								<div className="flex-1">
									<p className="text-[10px] uppercase tracking-[.2em] text-muted">
										SupportOS
									</p>
									<h2
										id="workspace-menu-title"
										className="mt-1 text-lg font-semibold"
									>
										Рабочее пространство
									</h2>
								</div>
								<button
									type="button"
									aria-label="Закрыть меню"
									onClick={closeMenu}
									className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface-elevated hover:text-foreground"
								>
									<X size={20} />
								</button>
							</header>
							<div className="relative mx-6 mb-4">
								<Search
									size={17}
									className="pointer-events-none absolute left-3 top-3 text-muted"
								/>
								<input
									ref={searchRef}
									aria-label="Поиск разделов и инструментов"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Найти раздел или инструмент…"
									className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-accent"
								/>
							</div>
							<nav
								aria-label="Разделы и инструменты"
								className="supportos-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5"
							>
								{visibleGroups.map((group) => (
									<section key={group.title} className="mb-5">
										<h3 className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.16em] text-muted">
											{group.title}
										</h3>
										<div className="space-y-1">
											{group.items.map((item) => {
												const Icon = item.icon;
												const active =
													item.type === "route" &&
													(pathname.replace(/\/+$/, "") || "/") === item.to;
												return (
													<button
														key={item.label}
														type="button"
														data-tools-item
														aria-current={active ? "page" : undefined}
														onClick={() =>
															item.type === "route"
																? navigateTo(item.to)
																: item.action()
														}
														className={`drawer-link group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? "bg-accent/10 text-accent ring-1 ring-inset ring-accent/20" : "hover:bg-surface-elevated"}`}
													>
														<span
															className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-accent/10" : "bg-background text-muted"}`}
														>
															<Icon size={18} strokeWidth={1.7} />
														</span>
														<span className="min-w-0 flex-1">
															<span className="block text-sm font-medium">
																{item.label}
															</span>
															<span className="mt-0.5 block text-xs leading-5 text-muted">
																{item.description}
															</span>
														</span>
														{active ? (
															<Check size={15} />
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
							<footer className="flex shrink-0 items-center justify-between border-t border-border px-6 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
								<span className="text-xs text-muted">Esc — закрыть меню</span>
								<AmbientMotionButton />
							</footer>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
