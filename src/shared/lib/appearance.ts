export type ThemeMode = "light" | "dark" | "system";
export type DensityMode = "comfortable" | "compact";

export interface AppearanceSettings {
	themeMode: ThemeMode;
	accent: string;
	density: DensityMode;
}

export const ACCENT_COLORS = [
	{ name: "Blue", value: "#3b82f6" },
	{ name: "Cyan", value: "#06b6d4" },
	{ name: "Emerald", value: "#10b981" },
	{ name: "Rose", value: "#f43f5e" },
	{ name: "Amber", value: "#f59e0b" },
] as const;

const THEME_MODE_KEY = "supportos-theme-mode";
const LEGACY_THEME_KEY = "supportos-theme";
const ACCENT_KEY = "supportos-accent";
const DENSITY_KEY = "supportos-density";

const DEFAULT_APPEARANCE: AppearanceSettings = {
	themeMode: "dark",
	accent: ACCENT_COLORS[0].value,
	density: "comfortable",
};

function isThemeMode(value: string | null): value is ThemeMode {
	return value === "light" || value === "dark" || value === "system";
}

function isDensityMode(value: string | null): value is DensityMode {
	return value === "comfortable" || value === "compact";
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

	return {
		themeMode: isThemeMode(themeMode)
			? themeMode
			: DEFAULT_APPEARANCE.themeMode,
		accent: accent || DEFAULT_APPEARANCE.accent,
		density: isDensityMode(density) ? density : DEFAULT_APPEARANCE.density,
	};
}

export function applyAppearance(settings = getAppearanceSettings()) {
	if (typeof document === "undefined") return;

	const resolvedTheme = resolveThemeMode(settings.themeMode);
	const root = document.documentElement;

	root.classList.toggle("dark", resolvedTheme === "dark");
	root.dataset.themeMode = settings.themeMode;
	root.dataset.density = settings.density;
	root.style.setProperty("--color-accent", settings.accent);
	root.style.setProperty("--color-accent-foreground", "#ffffff");

	if (typeof window !== "undefined") {
		window.localStorage.setItem(LEGACY_THEME_KEY, resolvedTheme);
	}
}

export function saveAppearanceSettings(settings: AppearanceSettings) {
	if (typeof window !== "undefined") {
		window.localStorage.setItem(THEME_MODE_KEY, settings.themeMode);
		window.localStorage.setItem(ACCENT_KEY, settings.accent);
		window.localStorage.setItem(DENSITY_KEY, settings.density);
	}

	applyAppearance(settings);
}

export function onSystemThemeChange(callback: () => void) {
	if (typeof window === "undefined") return () => {};

	const media = window.matchMedia("(prefers-color-scheme: dark)");

	media.addEventListener("change", callback);

	return () => media.removeEventListener("change", callback);
}
