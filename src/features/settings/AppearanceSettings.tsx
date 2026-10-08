import {
	Check,
	FileText,
	Languages,
	LayoutDashboard,
	Monitor,
	Moon,
	Palette,
	PanelLeft,
	PanelTop,
	Star,
	Sun,
	Zap,
} from "lucide-react";
import { PWAInstallButton } from "@/components/pwa/PWAInstallButton";
import { languages } from "@/entities/language";
import type {
	WorkspaceContentWidth,
	WorkspaceLayoutSettings,
	WorkspaceSidebarWidth,
} from "@/entities/workspace";
import { useToast } from "@/shared/hooks/useToast";
import {
	ACCENT_COLORS,
	type AppearanceSettings as AppearancePreferences,
	CUSTOM_PALETTE_FIELDS,
	FONT_SCALE_OPTIONS,
	getDefaultAppearanceSettings,
	PALETTE_OPTIONS,
	type PaletteColors,
	RADIUS_OPTIONS,
	resolveThemeMode,
	saveAppearanceSettings,
	type ThemeMode,
} from "@/shared/lib/appearance";
import {
	type LanguageCode,
	useKnowledgeStore,
	useWorkspaceStore,
} from "@/store";
import { useSettingsAppearance } from "./SettingsLayout";

const languageLabels: Record<string, string> = {
	ru: "Русский",
	en: "Английский",
	de: "Немецкий",
	pt: "Португальский",
	el: "Греческий",
};

const themeOptions: Array<{
	value: ThemeMode;
	title: string;
	description: string;
	icon: typeof Monitor;
}> = [
	{
		value: "system",
		title: "Системная",
		description: "Следовать теме операционной системы.",
		icon: Monitor,
	},
	{
		value: "dark",
		title: "Тёмная",
		description: "Использовать тёмное рабочее пространство.",
		icon: Moon,
	},
	{
		value: "light",
		title: "Светлая",
		description: "Использовать светлое рабочее пространство.",
		icon: Sun,
	},
];

const sidebarWidthOptions: Array<{
	value: WorkspaceSidebarWidth;
	title: string;
	description: string;
}> = [
	{
		value: "narrow",
		title: "Узкая",
		description: "Больше места для содержимого бинда.",
	},
	{
		value: "standard",
		title: "Стандартная",
		description: "Сбалансированное дерево и содержимое.",
	},
	{
		value: "wide",
		title: "Широкая",
		description: "Удобнее для вложенных папок.",
	},
];

const contentWidthOptions: Array<{
	value: WorkspaceContentWidth;
	title: string;
	description: string;
}> = [
	{
		value: "standard",
		title: "Стандартная",
		description: "Удобный центрированный просмотр бинда.",
	},
	{
		value: "wide",
		title: "Широкая",
		description: "Больше места для длинных ответов.",
	},
	{
		value: "full",
		title: "Полная",
		description: "Использовать всё рабочее пространство.",
	},
];

type WorkspaceToggleKey = keyof Pick<
	WorkspaceLayoutSettings,
	| "showTopbar"
	| "showSidebar"
	| "showTabs"
	| "showTranslatorWidget"
	| "showSidebarFavorites"
>;

const workspaceToggleOptions: Array<{
	key: WorkspaceToggleKey;
	title: string;
	description: string;
	icon: typeof Monitor;
}> = [
	{
		key: "showTopbar",
		title: "Верхняя панель",
		description: "Поиск, создание и настройки.",
		icon: PanelTop,
	},
	{
		key: "showSidebar",
		title: "Дерево знаний",
		description: "Левая панель навигации.",
		icon: PanelLeft,
	},
	{
		key: "showTabs",
		title: "Открытые вкладки",
		description: "Вкладки биндов над просмотрщиком.",
		icon: FileText,
	},
	{
		key: "showTranslatorWidget",
		title: "Помощник ответа",
		description: "Кнопка контекстного помощника.",
		icon: Languages,
	},
	{
		key: "showSidebarFavorites",
		title: "Блок избранного",
		description: "Закреплённые ярлыки в дереве.",
		icon: Star,
	},
];

export function AppearanceSettings() {
	const { showToast } = useToast();
	const { appearance, setAppearance } = useSettingsAppearance();
	const language = useKnowledgeStore((state) => state.language);
	const setLanguage = useKnowledgeStore((state) => state.setLanguage);
	const workspaceLayout = useWorkspaceStore((state) => state.layout);
	const setWorkspaceLayout = useWorkspaceStore((state) => state.setLayout);
	const resetWorkspaceLayout = useWorkspaceStore((state) => state.resetLayout);

	const updateAppearance = (patch: Partial<AppearancePreferences>) => {
		const next = { ...appearance, ...patch };

		setAppearance(next);
		saveAppearanceSettings(next);
	};

	const resetAppearance = () => {
		const next = getDefaultAppearanceSettings();

		setAppearance(next);
		saveAppearanceSettings(next);
	};

	const updateCustomPalette = (patch: Partial<PaletteColors>) => {
		updateAppearance({
			palette: "custom",
			customPalette: {
				...appearance.customPalette,
				...patch,
			},
		});
	};

	const toggleWorkspaceFlag = (key: WorkspaceToggleKey) => {
		setWorkspaceLayout({
			[key]: !workspaceLayout[key],
		} as Partial<WorkspaceLayoutSettings>);
	};

	const resetWorkspace = () => {
		resetWorkspaceLayout();
		showToast("Макет рабочего пространства сброшен");
	};

	const resolvedTheme = resolveThemeMode(appearance.themeMode);
	return (
		<>
			<section className="rounded-lg border border-border bg-surface p-5">
				<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
					<div>
						<div className="flex items-center gap-2 text-lg font-semibold">
							<Palette size={18} />
							Оформление
						</div>
						<p className="mt-1 text-sm text-muted">
							Настройте рабочее пространство, не покидая приложение.
						</p>
					</div>

					<div className="ui-actions items-center flex  gap-2">
						<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
							Текущая тема: {resolvedTheme === "dark" ? "Тёмная" : "Светлая"}
						</div>
						<button
							type="button"
							onClick={resetAppearance}
							className="ui-button ui-button--secondary border border-border bg-background font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							Сбросить
						</button>
					</div>
				</div>

				<div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
					<div className="space-y-4">
						<div className="grid gap-3 sm:grid-cols-3">
							{themeOptions.map((option) => {
								const Icon = option.icon;
								const active = appearance.themeMode === option.value;

								return (
									<button
										key={option.value}
										type="button"
										onClick={() =>
											updateAppearance({ themeMode: option.value })
										}
										className={`rounded-lg border px-4 py-3 text-left transition ${
											active
												? "border-accent bg-accent/10 text-foreground"
												: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
										}`}
									>
										<div className="flex items-center gap-2 text-sm font-semibold">
											<Icon size={16} />
											{option.title}
										</div>
										<div className="mt-1 text-xs text-muted">
											{option.description}
										</div>
									</button>
								);
							})}
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium">Цвет акцента</div>
							<div className="flex flex-wrap gap-2">
								{ACCENT_COLORS.map((color) => {
									const active = appearance.accent === color.value;

									return (
										<button
											key={color.value}
											type="button"
											onClick={() => updateAppearance({ accent: color.value })}
											className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
												active
													? "border-accent bg-accent/10"
													: "border-border hover:bg-surface-elevated"
											}`}
										>
											<span
												className="h-4 w-4 rounded-full"
												style={{ backgroundColor: color.value }}
											/>
											{color.name}
											{active && <Check size={14} />}
										</button>
									);
								})}
							</div>
						</div>

						<label className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
							<span>
								<span className="block text-sm font-medium">
									Свой цвет акцента
								</span>
								<span className="mt-1 block text-xs text-muted">
									Выберите цвет для активных состояний и выделений.
								</span>
							</span>
							<input
								type="color"
								value={appearance.accent}
								onChange={(event) =>
									updateAppearance({ accent: event.target.value })
								}
								className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background p-1"
							/>
						</label>

						<div className="space-y-2">
							<div className="text-sm font-medium">
								Палитра рабочего пространства
							</div>
							<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
								{PALETTE_OPTIONS.map((option) => {
									const active = appearance.palette === option.value;

									return (
										<button
											key={option.value}
											type="button"
											onClick={() =>
												updateAppearance({ palette: option.value })
											}
											className={`rounded-lg border px-3 py-3 text-left transition ${
												active
													? "border-accent bg-accent/10"
													: "border-border bg-background hover:bg-surface-elevated"
											}`}
										>
											<div className="flex items-center justify-between gap-2">
												<span className="text-sm font-semibold">
													{option.name}
												</span>
												{active && <Check size={14} />}
											</div>
											<div className="mt-1 text-xs text-muted">
												{option.description}
											</div>
										</button>
									);
								})}
							</div>
						</div>

						{appearance.palette === "custom" && (
							<div className="rounded-lg border border-border bg-background p-3">
								<div className="mb-3 flex items-center justify-between gap-3">
									<div className="text-sm font-medium">Свои цвета</div>
									<div className="flex overflow-hidden rounded-md border border-border">
										{CUSTOM_PALETTE_FIELDS.map((field) => (
											<span
												key={field.key}
												className="h-7 w-8"
												style={{
													backgroundColor: appearance.customPalette[field.key],
												}}
											/>
										))}
									</div>
								</div>

								<div className="grid gap-3 sm:grid-cols-2">
									{CUSTOM_PALETTE_FIELDS.map((field) => (
										<label
											key={field.key}
											className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2"
										>
											<span className="text-sm text-muted">{field.name}</span>
											<input
												type="color"
												value={appearance.customPalette[field.key]}
												onChange={(event) =>
													updateCustomPalette({
														[field.key]: event.target.value,
													})
												}
												className="h-9 w-12 cursor-pointer rounded-md border border-border bg-background p-1"
											/>
										</label>
									))}
								</div>
							</div>
						)}
					</div>

					<div className="space-y-4">
						<label className="ui-field ">
							<span className="text-sm font-medium">
								Язык рабочего пространства
							</span>
							<select
								value={language}
								onChange={(event) =>
									setLanguage(event.target.value as LanguageCode)
								}
								className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							>
								{languages.map((item) => (
									<option key={item.code} value={item.code}>
										{languageLabels[item.code] ?? item.name} (
										{item.code.toUpperCase()})
									</option>
								))}
							</select>
						</label>

						<div className="space-y-2">
							<div className="text-sm font-medium">Плотность интерфейса</div>
							<div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
								<button
									type="button"
									onClick={() => updateAppearance({ density: "comfortable" })}
									className={`rounded-md border px-3 py-2 text-sm ${
										appearance.density === "comfortable"
											? "border-accent bg-accent/10"
											: "border-border bg-background hover:bg-surface-elevated"
									}`}
								>
									Комфортная
								</button>
								<button
									type="button"
									onClick={() => updateAppearance({ density: "compact" })}
									className={`rounded-md border px-3 py-2 text-sm ${
										appearance.density === "compact"
											? "border-accent bg-accent/10"
											: "border-border bg-background hover:bg-surface-elevated"
									}`}
								>
									Компактная
								</button>
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium">Размер текста</div>
							<div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
								{FONT_SCALE_OPTIONS.map((option) => {
									const active = appearance.fontScale === option.value;

									return (
										<button
											key={option.value}
											type="button"
											onClick={() =>
												updateAppearance({ fontScale: option.value })
											}
											className={`rounded-md border px-3 py-2 text-sm ${
												active
													? "border-accent bg-accent/10"
													: "border-border bg-background hover:bg-surface-elevated"
											}`}
										>
											{option.name}
										</button>
									);
								})}
							</div>
						</div>

						<div className="space-y-2">
							<div className="text-sm font-medium">Стиль углов</div>
							<div className="grid gap-2">
								{RADIUS_OPTIONS.map((option) => {
									const active = appearance.radius === option.value;

									return (
										<button
											key={option.value}
											type="button"
											onClick={() => updateAppearance({ radius: option.value })}
											className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
												active
													? "border-accent bg-accent/10"
													: "border-border bg-background hover:bg-surface-elevated"
											}`}
										>
											<span>
												<span className="block font-medium">{option.name}</span>
												<span className="text-xs text-muted">
													{option.description}
												</span>
											</span>
											{active && <Check size={14} />}
										</button>
									);
								})}
							</div>
						</div>

						<div className="rounded-lg border border-border bg-background p-3">
							<div className="mb-2 flex items-center gap-2 text-sm font-medium">
								<Zap size={16} />
								Установка приложения
							</div>
							<PWAInstallButton />
						</div>
					</div>
				</div>
			</section>
			<section className="rounded-lg border border-border bg-surface p-5">
				<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
					<div>
						<div className="flex items-center gap-2 text-lg font-semibold">
							<LayoutDashboard size={18} />
							Макет рабочего пространства
						</div>
						<p className="mt-1 text-sm text-muted">
							Выберите видимые панели и объём места для дерева и просмотрщика
							биндов.
						</p>
					</div>

					<button
						type="button"
						onClick={resetWorkspace}
						className="ui-button ui-button--secondary border border-border bg-background font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
					>
						Сбросить макет
					</button>
				</div>

				<div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
					<div className="space-y-4">
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-sm font-medium">
								<PanelLeft size={16} />
								Ширина дерева
							</div>
							<div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
								{sidebarWidthOptions.map((option) => {
									const active = workspaceLayout.sidebarWidth === option.value;

									return (
										<button
											key={option.value}
											type="button"
											onClick={() =>
												setWorkspaceLayout({
													sidebarWidth: option.value,
												})
											}
											className={`rounded-lg border px-3 py-3 text-left transition ${
												active
													? "border-accent bg-accent/10 text-foreground"
													: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
											}`}
										>
											<div className="flex items-center justify-between gap-2">
												<span className="text-sm font-semibold">
													{option.title}
												</span>
												{active && <Check size={14} />}
											</div>
											<div className="mt-1 text-xs text-muted">
												{option.description}
											</div>
										</button>
									);
								})}
							</div>
						</div>

						<div className="space-y-2">
							<div className="flex items-center gap-2 text-sm font-medium">
								<FileText size={16} />
								Ширина просмотрщика биндов
							</div>
							<div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
								{contentWidthOptions.map((option) => {
									const active = workspaceLayout.contentWidth === option.value;

									return (
										<button
											key={option.value}
											type="button"
											onClick={() =>
												setWorkspaceLayout({
													contentWidth: option.value,
												})
											}
											className={`rounded-lg border px-3 py-3 text-left transition ${
												active
													? "border-accent bg-accent/10 text-foreground"
													: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
											}`}
										>
											<div className="flex items-center justify-between gap-2">
												<span className="text-sm font-semibold">
													{option.title}
												</span>
												{active && <Check size={14} />}
											</div>
											<div className="mt-1 text-xs text-muted">
												{option.description}
											</div>
										</button>
									);
								})}
							</div>
						</div>
					</div>

					<div className="grid gap-2 sm:grid-cols-2">
						{workspaceToggleOptions.map((option) => {
							const Icon = option.icon;
							const enabled = workspaceLayout[option.key];

							return (
								<button
									key={option.key}
									type="button"
									onClick={() => toggleWorkspaceFlag(option.key)}
									className={`flex min-h-24 items-start gap-3 rounded-lg border p-3 text-left transition ${
										enabled
											? "border-accent bg-accent/10 text-foreground"
											: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
									}`}
								>
									<span
										className={`mt-0.5 rounded-md border p-2 ${
											enabled
												? "border-accent/40 bg-accent/15 text-accent"
												: "border-border text-muted"
										}`}
									>
										<Icon size={17} />
									</span>
									<span className="min-w-0 flex-1">
										<span className="flex items-center justify-between gap-2">
											<span className="text-sm font-semibold">
												{option.title}
											</span>
											<span
												className={`rounded-full px-2 py-0.5 text-[11px] ${
													enabled
														? "bg-accent text-accent-foreground"
														: "bg-surface-elevated text-muted"
												}`}
											>
												{enabled ? "Вкл." : "Выкл."}
											</span>
										</span>
										<span className="mt-1 block text-xs text-muted">
											{option.description}
										</span>
									</span>
								</button>
							);
						})}
					</div>
				</div>
			</section>
		</>
	);
}
