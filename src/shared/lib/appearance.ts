export type ThemeMode = "light" | "dark" | "system";
export type DensityMode = "comfortable" | "compact";
export type PaletteMode = "slate" | "neutral" | "contrast";
export type RadiusMode = "sharp" | "balanced" | "rounded";
export type FontScale = "small" | "normal" | "large";

export interface AppearanceSettings {
	themeMode: ThemeMode;
	accent: string;
	density: DensityMode;
	palette: PaletteMode;
	radius: RadiusMode;
	fontScale: FontScale;
}

export const ACCENT_COLORS = [
	{ name: "Blue", value: "#3b82f6" },
	{ name: "Cyan", value: "#06b6d4" },
	{ name: "Emerald", value: "#10b981" },
	{ name: "Rose", value: "#f43f5e" },
	{ name: "Amber", value: "#f59e0b" },
] as const;

export const PALETTE_OPTIONS = [
	{
		name: "Slate",
		value: "slate",
		description: "Current SupportOS look.",
	},
	{
		name: "Neutral",
		value: "neutral",
		description: "Cleaner gray surfaces.",
	},
	{
		name: "Contrast",
		value: "contrast",
		description: "Sharper borders and text.",
	},
] as const;

export const RADIUS_OPTIONS = [
	{ name: "Sharp", value: "sharp", description: "Tighter corners." },
	{ name: "Balanced", value: "balanced", description: "Default shape." },
	{ name: "Rounded", value: "rounded", description: "Softer controls." },
] as const;

export const FONT_SCALE_OPTIONS = [
	{ name: "Small", value: "small" },
	{ name: "Normal", value: "normal" },
	{ name: "Large", value: "large" },
] as const;

const THEME_MODE_KEY = "supportos-theme-mode";
const LEGACY_THEME_KEY = "supportos-theme";
const ACCENT_KEY = "supportos-accent";
const DENSITY_KEY = "supportos-density";
const PALETTE_KEY = "supportos-palette";
const RADIUS_KEY = "supportos-radius";
const FONT_SCALE_KEY = "supportos-font-scale";

const DEFAULT_APPEARANCE: AppearanceSettings = {
	themeMode: "dark",
	accent: ACCENT_COLORS[0].value,
	density: "comfortable",
	palette: "slate",
	radius: "balanced",
	fontScale: "normal",
};

export function getDefaultAppearanceSettings(): AppearanceSettings {
	return { ...DEFAULT_APPEARANCE };
}

const PALETTES: Record<
	PaletteMode,
	Record<
		"light" | "dark",
		{
			background: string;
			foreground: string;
			surface: string;
			surfaceElevated: string;
			border: string;
			muted: string;
		}
	>
> = {
	slate: {
		light: {
			background: "#f8fafc",
			foreground: "#0f172a",
			surface: "#ffffff",
			surfaceElevated: "#f1f5f9",
			border: "#e2e8f0",
			muted: "#64748b",
		},
		dark: {
			background: "#0b1120",
			foreground: "#e2e8f0",
			surface: "#111827",
			surfaceElevated: "#1e293b",
			border: "#1e293b",
			muted: "#94a3b8",
		},
	},
	neutral: {
		light: {
			background: "#fafafa",
			foreground: "#171717",
			surface: "#ffffff",
			surfaceElevated: "#f5f5f5",
			border: "#e5e5e5",
			muted: "#737373",
		},
		dark: {
			background: "#0a0a0a",
			foreground: "#e5e5e5",
			surface: "#171717",
			surfaceElevated: "#262626",
			border: "#262626",
			muted: "#a3a3a3",
		},
	},
	contrast: {
		light: {
			background: "#ffffff",
			foreground: "#020617",
			surface: "#ffffff",
			surfaceElevated: "#f8fafc",
			border: "#cbd5e1",
			muted: "#475569",
		},
		dark: {
			background: "#020617",
			foreground: "#f8fafc",
			surface: "#0f172a",
			surfaceElevated: "#1e293b",
			border: "#334155",
			muted: "#cbd5e1",
		},
	},
};

const RADIUS_VALUES: Record<RadiusMode, Record<string, string>> = {
	sharp: {
		"--radius-sm": "0.125rem",
		"--radius-md": "0.25rem",
		"--radius-lg": "0.375rem",
		"--radius-xl": "0.5rem",
		"--radius-2xl": "0.625rem",
		"--radius-3xl": "0.75rem",
	},
	balanced: {
		"--radius-sm": "0.25rem",
		"--radius-md": "0.375rem",
		"--radius-lg": "0.5rem",
		"--radius-xl": "0.75rem",
		"--radius-2xl": "1rem",
		"--radius-3xl": "1.25rem",
	},
	rounded: {
		"--radius-sm": "0.375rem",
		"--radius-md": "0.5rem",
		"--radius-lg": "0.75rem",
		"--radius-xl": "1rem",
		"--radius-2xl": "1.25rem",
		"--radius-3xl": "1.5rem",
	},
};

const FONT_SIZES: Record<FontScale, number> = {
	small: 15,
	normal: 16,
	large: 17,
};

function isThemeMode(value: string | null): value is ThemeMode {
	return value === "light" || value === "dark" || value === "system";
}

function isDensityMode(value: string | null): value is DensityMode {
	return value === "comfortable" || value === "compact";
}

function isPaletteMode(value: string | null): value is PaletteMode {
	return value === "slate" || value === "neutral" || value === "contrast";
}

function isRadiusMode(value: string | null): value is RadiusMode {
	return value === "sharp" || value === "balanced" || value === "rounded";
}

function isFontScale(value: string | null): value is FontScale {
	return value === "small" || value === "normal" || value === "large";
}

function getStoredValue(key: string) {
	if (typeof window === "undefined") return null;

	return window.localStorage.getItem(key);
}

export function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "dark";

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

export function resolveThemeMode(themeMode: ThemeMode): "light" | "dark" {
	return themeMode === "system" ? getSystemTheme() : themeMode;
}

export function getAppearanceSettings(): AppearanceSettings {
	const themeMode =
		getStoredValue(THEME_MODE_KEY) ?? getStoredValue(LEGACY_THEME_KEY);
	const accent = getStoredValue(ACCENT_KEY);
	const density = getStoredValue(DENSITY_KEY);
	const palette = getStoredValue(PALETTE_KEY);
	const radius = getStoredValue(RADIUS_KEY);
	const fontScale = getStoredValue(FONT_SCALE_KEY);

	return {
		themeMode: isThemeMode(themeMode)
			? themeMode
			: DEFAULT_APPEARANCE.themeMode,
		accent: accent || DEFAULT_APPEARANCE.accent,
		density: isDensityMode(density) ? density : DEFAULT_APPEARANCE.density,
		palette: isPaletteMode(palette) ? palette : DEFAULT_APPEARANCE.palette,
		radius: isRadiusMode(radius) ? radius : DEFAULT_APPEARANCE.radius,
		fontScale: isFontScale(fontScale)
			? fontScale
			: DEFAULT_APPEARANCE.fontScale,
	};
}

export function applyAppearance(settings = getAppearanceSettings()) {
	if (typeof document === "undefined") return;

	const resolvedTheme = resolveThemeMode(settings.themeMode);
	const root = document.documentElement;
	const palette = PALETTES[settings.palette][resolvedTheme];
	const baseFontSize = FONT_SIZES[settings.fontScale];
	const fontSize =
		settings.density === "compact" ? baseFontSize - 1 : baseFontSize;

	root.classList.toggle("dark", resolvedTheme === "dark");
	root.dataset.themeMode = settings.themeMode;
	root.dataset.density = settings.density;
	root.dataset.palette = settings.palette;
	root.dataset.radius = settings.radius;
	root.style.setProperty("--color-background", palette.background);
	root.style.setProperty("--color-foreground", palette.foreground);
	root.style.setProperty("--color-surface", palette.surface);
	root.style.setProperty("--color-surface-elevated", palette.surfaceElevated);
	root.style.setProperty("--color-border", palette.border);
	root.style.setProperty("--color-muted", palette.muted);
	root.style.setProperty("--color-accent", settings.accent);
	root.style.setProperty("--color-accent-foreground", "#ffffff");
	root.style.setProperty("--supportos-font-size", `${fontSize}px`);

	for (const [key, value] of Object.entries(RADIUS_VALUES[settings.radius])) {
		root.style.setProperty(key, value);
	}

	if (typeof window !== "undefined") {
		window.localStorage.setItem(LEGACY_THEME_KEY, resolvedTheme);
	}
}

export function saveAppearanceSettings(settings: AppearanceSettings) {
	if (typeof window !== "undefined") {
		window.localStorage.setItem(THEME_MODE_KEY, settings.themeMode);
		window.localStorage.setItem(ACCENT_KEY, settings.accent);
		window.localStorage.setItem(DENSITY_KEY, settings.density);
		window.localStorage.setItem(PALETTE_KEY, settings.palette);
		window.localStorage.setItem(RADIUS_KEY, settings.radius);
		window.localStorage.setItem(FONT_SCALE_KEY, settings.fontScale);
	}

	applyAppearance(settings);
}

export function onSystemThemeChange(callback: () => void) {
	if (typeof window === "undefined") return () => {};

	const media = window.matchMedia("(prefers-color-scheme: dark)");

	media.addEventListener("change", callback);

	return () => media.removeEventListener("change", callback);
}
