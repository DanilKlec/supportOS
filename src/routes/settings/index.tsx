import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Bot,
	Check,
	Clock3,
	Cloud,
	Database,
	Download,
	FileJson,
	FileText,
	Languages,
	LayoutDashboard,
	LogIn,
	LogOut,
	Monitor,
	Moon,
	Palette,
	PanelLeft,
	PanelTop,
	Shield,
	Star,
	Sun,
	Upload,
	User,
	Wrench,
	Zap,
} from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";

import { GoogleSheetsImportPanel } from "@/components/import/GoogleSheetsImportPanel";
import { PWAInstallButton } from "@/components/pwa/PWAInstallButton";
import { languages } from "@/entities/language";
import type {
	WorkspaceContentWidth,
	WorkspaceLayoutSettings,
	WorkspaceSidebarWidth,
} from "@/entities/workspace";
import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";
import { supportOSExportService } from "@/services/supportos-export.service";
import { useToast } from "@/shared/hooks/useToast";
import {
	ACCENT_COLORS,
	type AppearanceSettings,
	applyAppearance,
	CUSTOM_PALETTE_FIELDS,
	FONT_SCALE_OPTIONS,
	getAppearanceSettings,
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
import { useAIStore } from "@/store/ai.store";
import { useAuthStore } from "@/store/auth.store";

export const Route = createFileRoute("/settings/")({
	component: SettingsPage,
});

const themeOptions: Array<{
	value: ThemeMode;
	title: string;
	description: string;
	icon: typeof Monitor;
}> = [
	{
		value: "system",
		title: "System",
		description: "Follow the OS theme.",
		icon: Monitor,
	},
	{
		value: "dark",
		title: "Dark",
		description: "Use the dark workspace.",
		icon: Moon,
	},
	{
		value: "light",
		title: "Light",
		description: "Use the light workspace.",
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
		title: "Narrow",
		description: "More room for bind content.",
	},
	{
		value: "standard",
		title: "Standard",
		description: "Balanced tree and content.",
	},
	{
		value: "wide",
		title: "Wide",
		description: "Better for deep folders.",
	},
];

const contentWidthOptions: Array<{
	value: WorkspaceContentWidth;
	title: string;
	description: string;
}> = [
	{
		value: "standard",
		title: "Standard",
		description: "Readable centered bind view.",
	},
	{
		value: "wide",
		title: "Wide",
		description: "More space for long answers.",
	},
	{
		value: "full",
		title: "Full",
		description: "Use the whole workspace.",
	},
];

type WorkspaceToggleKey = keyof Pick<
	WorkspaceLayoutSettings,
	| "showTopbar"
	| "showSidebar"
	| "showTabs"
	| "showTranslatorWidget"
	| "showSidebarFavorites"
	| "showSidebarRecentFolders"
	| "showSidebarTools"
>;

const workspaceToggleOptions: Array<{
	key: WorkspaceToggleKey;
	title: string;
	description: string;
	icon: typeof Monitor;
}> = [
	{
		key: "showTopbar",
		title: "Top bar",
		description: "Search, create button and settings.",
		icon: PanelTop,
	},
	{
		key: "showSidebar",
		title: "Knowledge tree",
		description: "Left navigation panel.",
		icon: PanelLeft,
	},
	{
		key: "showTabs",
		title: "Opened tabs",
		description: "Bind tabs above the viewer.",
		icon: FileText,
	},
	{
		key: "showTranslatorWidget",
		title: "Translator button",
		description: "Floating quick translator.",
		icon: Languages,
	},
	{
		key: "showSidebarFavorites",
		title: "Favorites block",
		description: "Pinned shortcuts in the tree.",
		icon: Star,
	},
	{
		key: "showSidebarRecentFolders",
		title: "Recent folders",
		description: "Fast return to opened folders.",
		icon: Clock3,
	},
	{
		key: "showSidebarTools",
		title: "Tools block",
		description: "Bonus tools and project links.",
		icon: Wrench,
	},
];

function SettingsPage() {
	const importInputRef = useRef<HTMLInputElement>(null);
	const { showToast } = useToast();
	const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
		const settings = getAppearanceSettings();

		applyAppearance(settings);

		return settings;
	});
	const binds = useKnowledgeStore((state) => state.binds);
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const favorites = useKnowledgeStore((state) => state.favorites);
	const recent = useKnowledgeStore((state) => state.recent);
	const language = useKnowledgeStore((state) => state.language);
	const setLanguage = useKnowledgeStore((state) => state.setLanguage);
	const workspaceLayout = useWorkspaceStore((state) => state.layout);
	const setWorkspaceLayout = useWorkspaceStore((state) => state.setLayout);
	const resetWorkspaceLayout = useWorkspaceStore((state) => state.resetLayout);
	const authConfigured = useAuthStore((state) => state.configured);
	const authSession = useAuthStore((state) => state.session);
	const aiApiKey = useAIStore((state) => state.apiKey);
	const aiModel = useAIStore((state) => state.model);

	const stats = useMemo(
		() => [
			{ label: "Binds", value: binds.length },
			{ label: "Categories", value: categories.length },
			{ label: "Folders", value: folders.length },
			{ label: "Favorites", value: favorites.length },
			{ label: "Recent", value: recent.length },
		],
		[
			binds.length,
			categories.length,
			favorites.length,
			folders.length,
			recent.length,
		],
	);

	const updateAppearance = (patch: Partial<AppearanceSettings>) => {
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
		showToast("Workspace layout reset");
	};

	const exportJson = () => {
		const blob = new Blob([supportOSExportService.exportJson()], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");

		link.href = url;
		link.download = `supportos-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
		showToast("SupportOS JSON exported");
	};

	const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];

		if (!file) return;

		try {
			const text = await file.text();

			supportOSExportService.importJson(text);
			showToast("SupportOS JSON imported");
		} catch {
			showToast("Import failed");
		} finally {
			event.target.value = "";
		}
	};

	const signOut = async () => {
		await supabaseService.signOut();
		await knowledgeService.loadKnowledge();
		showToast("Signed out");
	};

	const resolvedTheme = resolveThemeMode(appearance.themeMode);

	return (
		<div className="h-full overflow-auto bg-background">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
				<header className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted">
							<User size={14} />
							Personal cabinet
						</div>
						<h1 className="text-3xl font-bold text-foreground">Settings</h1>
						<p className="mt-2 max-w-2xl text-sm text-muted">
							Manage workspace appearance, data imports, account status and app
							preferences from one place.
						</p>
					</div>

					<div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
						<Shield size={16} />
						{authSession?.user.email ?? "Local workspace"}
					</div>
				</header>

				<section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
					{stats.map((item) => (
						<div
							key={item.label}
							className="rounded-lg border border-border bg-surface px-4 py-3"
						>
							<div className="text-xs uppercase tracking-wider text-muted">
								{item.label}
							</div>
							<div className="mt-1 text-2xl font-semibold">{item.value}</div>
						</div>
					))}
				</section>

				<section className="rounded-lg border border-border bg-surface p-5">
					<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
						<div>
							<div className="flex items-center gap-2 text-lg font-semibold">
								<Palette size={18} />
								Appearance
							</div>
							<p className="mt-1 text-sm text-muted">
								Customize the workspace without leaving the app.
							</p>
						</div>

						<div className="flex items-center gap-2">
							<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
								Current: {resolvedTheme}
							</div>
							<button
								type="button"
								onClick={resetAppearance}
								className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								Reset
							</button>
						</div>
					</div>

					<div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
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
								<div className="text-sm font-medium">Accent color</div>
								<div className="flex flex-wrap gap-2">
									{ACCENT_COLORS.map((color) => {
										const active = appearance.accent === color.value;

										return (
											<button
												key={color.value}
												type="button"
												onClick={() =>
													updateAppearance({ accent: color.value })
												}
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
										Custom accent
									</span>
									<span className="mt-1 block text-xs text-muted">
										Pick any color for active states and highlights.
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
								<div className="text-sm font-medium">Workspace palette</div>
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
										<div className="text-sm font-medium">Custom colors</div>
										<div className="flex overflow-hidden rounded-md border border-border">
											{CUSTOM_PALETTE_FIELDS.map((field) => (
												<span
													key={field.key}
													className="h-7 w-8"
													style={{
														backgroundColor:
															appearance.customPalette[field.key],
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
							<label className="block space-y-2">
								<span className="text-sm font-medium">Workspace language</span>
								<select
									value={language}
									onChange={(event) =>
										setLanguage(event.target.value as LanguageCode)
									}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								>
									{languages.map((item) => (
										<option key={item.code} value={item.code}>
											{item.name} ({item.code.toUpperCase()})
										</option>
									))}
								</select>
							</label>

							<div className="space-y-2">
								<div className="text-sm font-medium">Interface density</div>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => updateAppearance({ density: "comfortable" })}
										className={`rounded-md border px-3 py-2 text-sm ${
											appearance.density === "comfortable"
												? "border-accent bg-accent/10"
												: "border-border bg-background hover:bg-surface-elevated"
										}`}
									>
										Comfortable
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
										Compact
									</button>
								</div>
							</div>

							<div className="space-y-2">
								<div className="text-sm font-medium">Text size</div>
								<div className="grid grid-cols-3 gap-2">
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
								<div className="text-sm font-medium">Corner style</div>
								<div className="grid gap-2">
									{RADIUS_OPTIONS.map((option) => {
										const active = appearance.radius === option.value;

										return (
											<button
												key={option.value}
												type="button"
												onClick={() =>
													updateAppearance({ radius: option.value })
												}
												className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
													active
														? "border-accent bg-accent/10"
														: "border-border bg-background hover:bg-surface-elevated"
												}`}
											>
												<span>
													<span className="block font-medium">
														{option.name}
													</span>
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
									App install
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
								Workspace layout
							</div>
							<p className="mt-1 text-sm text-muted">
								Choose which panels stay visible and how much space the tree and
								bind viewer use.
							</p>
						</div>

						<button
							type="button"
							onClick={resetWorkspace}
							className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							Reset layout
						</button>
					</div>

					<div className="grid gap-4 lg:grid-cols-[0.95fr_1.2fr]">
						<div className="space-y-4">
							<div className="space-y-2">
								<div className="flex items-center gap-2 text-sm font-medium">
									<PanelLeft size={16} />
									Tree width
								</div>
								<div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
									{sidebarWidthOptions.map((option) => {
										const active =
											workspaceLayout.sidebarWidth === option.value;

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
									Bind viewer width
								</div>
								<div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
									{contentWidthOptions.map((option) => {
										const active =
											workspaceLayout.contentWidth === option.value;

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
													{enabled ? "On" : "Off"}
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

				<section className="rounded-lg border border-border bg-surface p-5">
					<div className="mb-5 flex items-center gap-2 text-lg font-semibold">
						<Database size={18} />
						Import and export
					</div>

					<div className="mb-5 grid gap-3 sm:grid-cols-2">
						<button
							type="button"
							onClick={() => importInputRef.current?.click()}
							className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left hover:bg-surface-elevated"
						>
							<span>
								<span className="block text-sm font-semibold">Import JSON</span>
								<span className="mt-1 block text-xs text-muted">
									Restore a SupportOS export file.
								</span>
							</span>
							<Upload size={18} />
						</button>

						<button
							type="button"
							onClick={exportJson}
							className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left hover:bg-surface-elevated"
						>
							<span>
								<span className="block text-sm font-semibold">Export JSON</span>
								<span className="mt-1 block text-xs text-muted">
									Download a full workspace backup.
								</span>
							</span>
							<Download size={18} />
						</button>
					</div>

					<input
						ref={importInputRef}
						type="file"
						accept="application/json,.json"
						className="hidden"
						onChange={importJson}
					/>

					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<FileJson size={16} />
						Google Sheets
					</div>
					<GoogleSheetsImportPanel showHeading={false} />
				</section>

				<section className="grid gap-5 lg:grid-cols-2">
					<div className="rounded-lg border border-border bg-surface p-5">
						<div className="mb-4 flex items-center gap-2 text-lg font-semibold">
							<Cloud size={18} />
							Account
						</div>

						{authConfigured ? (
							authSession ? (
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<div className="text-sm font-semibold">
											{authSession.user.email}
										</div>
										<div className="mt-1 text-xs text-muted">
											Role: {authSession.user.role}
										</div>
									</div>
									<button
										type="button"
										onClick={signOut}
										className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-elevated"
									>
										<LogOut size={16} />
										Sign out
									</button>
								</div>
							) : (
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="text-sm text-muted">
										Cloud sync is configured, but you are not signed in.
									</div>
									<Link
										to="/login"
										className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
									>
										<LogIn size={16} />
										Sign in
									</Link>
								</div>
							)
						) : (
							<div className="text-sm text-muted">
								SupportOS is running in local workspace mode.
							</div>
						)}
					</div>

					<div className="rounded-lg border border-border bg-surface p-5">
						<div className="mb-4 flex items-center gap-2 text-lg font-semibold">
							<Bot size={18} />
							AI tools
						</div>

						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<div className="text-sm font-semibold">{aiModel}</div>
								<div className="mt-1 text-xs text-muted">
									{aiApiKey.trim() ? "API key saved" : "API key is not set"}
								</div>
							</div>
							<Link
								to="/settings/ai"
								className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-elevated"
							>
								Open AI settings
							</Link>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
