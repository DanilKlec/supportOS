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
	ChevronDown,
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

export function ToolsMenu({
	placement = "down",
}: {
	placement?: "up" | "down";
}) {
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
	const [groupIndex, setGroupIndex] = useState(0);
	const searchRef = useRef<HTMLInputElement>(null);
	const [themeMode, setThemeMode] = useState(
		() => getAppearanceSettings().themeMode,
	);
	const resolvedTheme = resolveThemeMode(themeMode);
	const menuId = "supportos-tools-menu";

	const closeMenu = useCallback(() => {
		setOpen(false);
		buttonRef.current?.focus();
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
			title: "Инструменты",
			items: WORK_TOOLS.filter(
				(item) =>
					!["/bonus-tools", "/agent-monitor", "/ai/assistant"].includes(
						item.to,
					),
			),
		},
		{
			title: "Данные",
			items: [
				{
					type: "action",
					label: "Импорт JSON",
					description: "Восстановление из файла",
					icon: Import,
					action: importJson,
				},
				{
					type: "action",
					label: "Экспорт JSON",
					description: "Скачать резервную копию",
					icon: Download,
					action: exportJson,
				},
				{
					type: "route",
					label: "Импорт Google Sheets",
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
					label: "Управление",
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
		if (!open) return undefined;

		const closeOnOutsideClick = (event: PointerEvent) => {
			const target = event.target as Node;

			if (
				buttonRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			) {
				return;
			}

			setOpen(false);
		};
		const closeOnEscape = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeMenu();
			}
		};

		window.addEventListener("pointerdown", closeOnOutsideClick);
		window.addEventListener("keydown", closeOnEscape);
		window.setTimeout(() => {
			searchRef.current?.focus();
		}, 0);

		return () => {
			window.removeEventListener("pointerdown", closeOnOutsideClick);
			window.removeEventListener("keydown", closeOnEscape);
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
			items: group.items.filter(
				(item) => item.type !== "route" || can(role, routePermission(item.to)),
			),
		}))
		.filter((group) => group.items.length);
	const displayed = (
		query.trim()
			? visibleGroups.flatMap((g) => g.items)
			: (visibleGroups[groupIndex]?.items ?? [])
	).filter((item) =>
		`${item.label} ${item.description ?? ""}`
			.toLocaleLowerCase()
			.includes(query.trim().toLocaleLowerCase()),
	);
	return (
		<div
			className="relative"
			onBlur={(event) => {
				if (
					event.relatedTarget &&
					!event.currentTarget.contains(event.relatedTarget as Node)
				)
					setOpen(false);
			}}
		>
			<button
				ref={buttonRef}
				type="button"
				aria-label="Открыть инструменты"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => {
					setOpen((v) => !v);
					setQuery("");
				}}
				className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition ${open ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}
			>
				<LayoutGrid size={18} />
				<span className="hidden sm:inline">Инструменты</span>
				<ChevronDown
					size={13}
					className={`transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			<input
				ref={fileInputRef}
				type="file"
				accept="application/json,.json"
				onChange={handleImportFile}
				className="hidden"
			/>
			{open && (
				<div
					ref={menuRef}
					id={menuId}
					role="dialog"
					aria-label="Инструменты"
					onKeyDown={handleMenuKeyDown}
					className={`tools-popover fixed right-3 z-50 flex w-[min(350px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/30 sm:absolute sm:right-0 ${placement === "up" ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] sm:bottom-[calc(100%+12px)] origin-bottom-right" : "top-[4.5rem] sm:top-[calc(100%+12px)]"}`}
				>
					<div className="flex items-center gap-2 border-b border-border px-4 py-3">
						<Search size={16} className="shrink-0 text-muted" />
						<input
							ref={searchRef}
							aria-label="Найти инструмент"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Найти инструмент…"
							className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
						/>
						<button
							type="button"
							aria-label="Закрыть инструменты"
							onClick={closeMenu}
							className="rounded-lg p-1.5 text-muted hover:bg-surface-elevated"
						>
							<X size={16} />
						</button>
					</div>
					{!query && (
						<div
							className="flex gap-1 px-3 pt-3"
							aria-label="Группы инструментов"
						>
							{visibleGroups.map((group, index) => (
								<button
									type="button"
									key={group.title}
									aria-pressed={groupIndex === index}
									onClick={() => setGroupIndex(index)}
									className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium ${groupIndex === index ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}
								>
									{group.title}
								</button>
							))}
						</div>
					)}
					<div className="supportos-scroll max-h-[min(390px,calc(100dvh-220px))] overflow-y-auto p-2">
						{displayed.map((item) => {
							const Icon = item.icon;
							const active = item.type === "route" && pathname === item.to;
							return (
								<button
									key={item.label}
									type="button"
									data-tools-item
									onClick={() =>
										item.type === "route" ? navigateTo(item.to) : item.action()
									}
									className={`group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-accent/10 text-accent" : "hover:bg-surface-elevated"}`}
								>
									<Icon
										size={18}
										strokeWidth={1.6}
										className={
											active ? "shrink-0 text-accent" : "shrink-0 text-muted"
										}
									/>
									<span className="min-w-0 flex-1">
										<span className="block text-sm font-medium">
											{item.label}
										</span>
										<span className="mt-0.5 block text-[11px] text-muted">
											{item.description}
										</span>
									</span>
									{active ? (
										<Check size={14} />
									) : (
										<ChevronRight
											size={14}
											className="text-muted opacity-0 group-hover:opacity-100"
										/>
									)}
								</button>
							);
						})}
						{!displayed.length && (
							<p className="px-4 py-8 text-center text-sm text-muted">
								Инструмент не найден
							</p>
						)}
					</div>
					<div className="flex justify-between border-t border-border px-4 py-2.5 text-[10px] text-muted">
						<span>↑ ↓ выбор · Enter открыть</span>
						<span>Esc закрыть</span>
					</div>
				</div>
			)}
		</div>
	);
}
