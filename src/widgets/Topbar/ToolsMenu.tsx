import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Archive,
	Bot,
	BrainCircuit,
	Check,
	ChevronRight,
	Contact,
	Download,
	FileJson,
	Gift,
	HeartPulse,
	Import,
	Languages,
	Moon,
	Settings,
	Sparkles,
	Sun,
	Trophy,
	Wrench,
	X,
} from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent,
	type LucideIcon,
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
	| "/bonuses"
	| "/bonus-tools"
	| "/sports-betting"
	| "/project-emails"
	| "/health"
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
		label: "Translator",
		description: "Translate support text",
		icon: Languages,
		to: "/translator",
	},
	{
		type: "route",
		label: "Answer Assistant",
		description: "Generate and check replies",
		icon: Bot,
		to: "/ai/assistant",
	},
	{
		type: "route",
		label: "AI Translator",
		description: "Translate with AI workflow",
		icon: Sparkles,
		to: "/ai/translator",
	},
	{
		type: "route",
		label: "AI Knowledge",
		description: "Knowledge AI utilities",
		icon: BrainCircuit,
		to: "/ai/knowledge",
	},
	{
		type: "route",
		label: "Deposit Bonuses",
		description: "Bonus reference data",
		icon: Gift,
		to: "/bonuses",
	},
	{
		type: "route",
		label: "Bonus Tools",
		description: "Calculators and helpers",
		icon: Wrench,
		to: "/bonus-tools",
	},
	{
		type: "route",
		label: "Sports Betting",
		description: "Live odds workspace",
		icon: Trophy,
		to: "/sports-betting",
	},
	{
		type: "route",
		label: "Project Emails",
		description: "Project mailbox templates",
		icon: Contact,
		to: "/project-emails",
	},
	{
		type: "route",
		label: "Knowledge Health",
		description: "Find gaps and duplicates",
		icon: HeartPulse,
		to: "/health",
	},
	{
		type: "route",
		label: "Archive",
		description: "Restore archived materials",
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
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { showToast } = useToast();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
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
		const nextTheme =
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
			title: "Work tools",
			items: WORK_TOOLS,
		},
		{
			title: "Data",
			items: [
				{
					type: "action",
					label: "Import JSON",
					description: "Restore SupportOS export",
					icon: Import,
					action: importJson,
				},
				{
					type: "action",
					label: "Export JSON",
					description: "Download full backup",
					icon: Download,
					action: exportJson,
				},
				{
					type: "route",
					label: "Google Sheets Import",
					description: "Import published sheets",
					icon: FileJson,
					to: "/import/google-sheets",
				},
			],
		},
		{
			title: "Interface",
			items: [
				{
					type: "action",
					label:
						resolvedTheme === "dark" ? "Switch to Light" : "Switch to Dark",
					description: "Change workspace theme",
					icon: resolvedTheme === "dark" ? Sun : Moon,
					action: toggleTheme,
					active: true,
				},
				{
					type: "route",
					label: "Settings",
					description: "Workspace preferences",
					icon: Settings,
					to: "/settings",
				},
				{
					type: "route",
					label: "Translator Settings",
					description: "Provider and endpoint",
					icon: Languages,
					to: "/settings/translator",
				},
				{
					type: "route",
					label: "AI Settings",
					description: "Provider and model setup",
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
		const previousOverflow = document.body.style.overflow;
		const mobile = window.matchMedia("(max-width: 767px)").matches;

		if (mobile) {
			document.body.style.overflow = "hidden";
		}

		window.addEventListener("pointerdown", closeOnOutsideClick);
		window.addEventListener("keydown", closeOnEscape);
		window.setTimeout(() => {
			getFocusableItems(menuRef.current)[0]?.focus();
		}, 0);

		return () => {
			window.removeEventListener("pointerdown", closeOnOutsideClick);
			window.removeEventListener("keydown", closeOnEscape);
			document.body.style.overflow = previousOverflow;
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

		if (event.key === "Home") {
			event.preventDefault();
			items[0]?.focus();
		}

		if (event.key === "End") {
			event.preventDefault();
			items[items.length - 1]?.focus();
		}
	};

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen((value) => !value)}
				className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
			>
				<Wrench size={17} />
				<span className="hidden sm:inline">Tools</span>
			</button>

			<input
				ref={fileInputRef}
				type="file"
				accept="application/json,.json"
				onChange={handleImportFile}
				className="hidden"
			/>

			{open && (
				<>
					<button
						type="button"
						aria-label="Close Tools"
						onClick={closeMenu}
						className="fixed inset-0 z-40 bg-black/45 md:hidden"
					/>

					<div
						ref={menuRef}
						id={menuId}
						role="menu"
						aria-label="Tools"
						onKeyDown={handleMenuKeyDown}
						className="fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-hidden rounded-t-xl border border-border bg-surface shadow-2xl animate-slide-up md:absolute md:right-5 md:top-[3.25rem] md:bottom-auto md:left-auto md:w-[22rem] md:max-h-[min(76vh,46rem)] md:rounded-xl"
					>
						<div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
							<div className="text-sm font-semibold">Tools</div>
							<button
								type="button"
								onClick={closeMenu}
								aria-label="Close Tools"
								className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								<X size={18} />
							</button>
						</div>

						<div className="supportos-scroll max-h-[calc(86dvh-64px)] overflow-y-auto p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:max-h-[min(76vh,46rem)] md:pb-2">
							{groups.map((group) => (
								<section key={group.title} className="py-1">
									<div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
										{group.title}
									</div>

									<div className="space-y-1">
										{group.items.map((item) => {
											const Icon = item.icon;
											const active =
												item.type === "route" && pathname === item.to;

											return (
												<button
													key={`${group.title}-${item.label}`}
													type="button"
													role="menuitem"
													data-tools-item
													onClick={() =>
														item.type === "route"
															? navigateTo(item.to)
															: item.action()
													}
													className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
														item.danger
															? "text-red-400 hover:bg-red-500/10"
															: active
																? "bg-accent/10 text-foreground"
																: "text-foreground hover:bg-surface-elevated"
													}`}
												>
													<span
														className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
															active
																? "bg-accent text-accent-foreground"
																: "bg-background text-muted"
														}`}
													>
														<Icon size={16} />
													</span>
													<span className="min-w-0 flex-1">
														<span className="flex items-center gap-2">
															<span className="truncate font-medium">
																{item.label}
															</span>
															{item.type === "action" && item.active && (
																<Check
																	size={14}
																	className="shrink-0 text-accent"
																/>
															)}
														</span>
														{item.description && (
															<span className="mt-0.5 block truncate text-xs text-muted">
																{item.description}
															</span>
														)}
													</span>
													{item.type === "route" && (
														<ChevronRight
															size={15}
															className="shrink-0 text-muted"
														/>
													)}
												</button>
											);
										})}
									</div>
								</section>
							))}
						</div>
					</div>
				</>
			)}
		</>
	);
}
